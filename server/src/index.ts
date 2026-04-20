import "./instrument";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import * as Sentry from "@sentry/node";
import { WebSocket, WebSocketServer } from "ws";
import { runAuthCleanup } from "./auth/authCleanup";
import { AuthService } from "./auth/authService";
import { attachAuthUser, AUTH_COOKIE_NAME, requireAuth } from "./auth/authMiddleware";
import { createEmailSenderFromEnv } from "./auth/emailSenderFactory";
import { clientIpFromRequest } from "./auth/rateLimit";
import { SharedAuthRateLimiter } from "./auth/sharedAuthRateLimiter";
import { runAssessmentEngine } from "./assessment/assessmentEngine";
import { db } from "./data/repository";
import { RoomType } from "./domain/enums";
import { REQUIRED_ROOM_ORDER } from "./domain/roomChecklists";
import { HazardObservation, ReportPayload, SessionContextUpdate } from "./domain/types";
import { SessionOrchestrator } from "./realtime/sessionOrchestrator";
import { buildReportPayload, persistReportPayload } from "./reporting/reportBuilder";
import { GcsStorageAdapter } from "./storage/gcsStorageAdapter";
import { LocalStorageAdapter } from "./storage/storageAdapter";
import { StorageAdapter } from "./storage/storageAdapter";

dotenv.config();
if (process.env.NODE_ENV === "production") {
  if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET === "dev-only-secret") {
    console.error("FATAL: AUTH_SESSION_SECRET must be set in production");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("FATAL: GEMINI_API_KEY must be set in production");
    process.exit(1);
  }
  if (!process.env.ALLOWED_ORIGIN) {
    console.warn("WARNING: ALLOWED_ORIGIN not set in production. CORS will default to http://localhost:5173 which will block all browser requests.");
  }
}

const app = express();
const server = http.createServer(app);
const authService = new AuthService(createEmailSenderFromEnv());

const PORT = parseInt(process.env.PORT || "8080", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const IS_PROD = process.env.NODE_ENV === "production";
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";
const AUTH_RATE_LIMIT_PROVIDER = (process.env.AUTH_RATE_LIMIT_PROVIDER || "local").toLowerCase() as "local" | "upstash";
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 20);
const AUTH_RATE_LIMIT_MAX_PER_EMAIL = Number(process.env.AUTH_RATE_LIMIT_MAX_PER_EMAIL || 8);
const AUTH_TOKEN_RETENTION_HOURS = Number(process.env.AUTH_TOKEN_RETENTION_HOURS || 48);
const AUTH_MAINTENANCE_KEY = process.env.AUTH_MAINTENANCE_KEY || "";

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY not set.");
}

const sharedAuthLimiter = new SharedAuthRateLimiter({
  provider: AUTH_RATE_LIMIT_PROVIDER,
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS,
  maxPerEmail: AUTH_RATE_LIMIT_MAX_PER_EMAIL,
  nodeEnv: process.env.NODE_ENV || "development",
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const resolveStorageAdapter = (): StorageAdapter => {
  if (STORAGE_PROVIDER === "gcs") {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      console.warn("STORAGE_PROVIDER=gcs but GCS_BUCKET_NAME missing; falling back to local storage.");
      return new LocalStorageAdapter(process.env.LOCAL_STORAGE_BASE_PATH || path.join(process.cwd(), "evidence"));
    }
    return new GcsStorageAdapter({
      bucketName,
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      signedUrlTtlSeconds: Number(process.env.GCS_SIGNED_URL_TTL_SECONDS || 900),
    });
  }
  return new LocalStorageAdapter(process.env.LOCAL_STORAGE_BASE_PATH || path.join(process.cwd(), "evidence"));
};

const storage = resolveStorageAdapter();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser(process.env.AUTH_SESSION_SECRET || "dev-only-secret"));
app.use(attachAuthUser);
app.get(
  "/evidence/:userId/:sessionId/:roomType/:filename",
  requireAuth,
  (req, res) => {
    if (req.authUser!.id !== req.params.userId) {
      return res.status(403).end();
    }
    const evidenceBase = path.resolve(
      process.env.LOCAL_STORAGE_BASE_PATH ||
      path.join(process.cwd(), "evidence")
    );
    const resolved = path.resolve(
      evidenceBase,
      req.params.userId,
      req.params.sessionId,
      req.params.roomType,
      req.params.filename
    );
    if (!resolved.startsWith(evidenceBase + path.sep) &&
        resolved !== evidenceBase) {
      return res.status(403).end();
    }
    res.sendFile(resolved, (err) => {
      if (err) res.status(404).end();
    });
  }
);

app.get("/health", async (_req, res) => {
  try {
    await db.healthCheck();
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", timestamp: new Date().toISOString() });
  }
});

const applyAuthRateLimit = async (
  req: express.Request,
  res: express.Response,
  email: string | undefined,
  strictOnProviderError: boolean
): Promise<boolean> => {
  const ip = clientIpFromRequest(req.ip, typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : undefined);
  const result = await sharedAuthLimiter.enforce({
    endpoint: req.path,
    ip,
    email,
    strictOnProviderError,
  });
  if (!result.allowed) {
    console.warn(`[AUTH] rate limit hit path=${req.path} ip=${ip}${email ? ` email=${email}` : ""}`);
    res.setHeader("Retry-After", String(result.retryAfterSec));
    res.status(429).json({ error: "Too many auth requests. Please wait and try again." });
    return false;
  }
  return true;
};

const runCleanupWithLogs = async () => {
  const startedAt = new Date().toISOString();
  console.info(`[AUTH] cleanup start at=${startedAt}`);
  const result = await runAuthCleanup(AUTH_TOKEN_RETENTION_HOURS);
  const finishedAt = new Date().toISOString();
  console.info(`[AUTH] cleanup done at=${finishedAt} expiredSessions=${result.expiredSessionsDeleted} expiredTokens=${result.expiredTokensDeleted} usedTokens=${result.usedTokensDeleted}`);
  return { startedAt, finishedAt, result };
};

const resolveReportEvidenceUrls = async (report: ReportPayload): Promise<ReportPayload> => {
  const roomBreakdown = await Promise.all(
    report.roomBreakdown.map(async (room) => ({
      ...room,
      hazards: await Promise.all(
        room.hazards.map(async (hazard) => ({
          ...hazard,
          evidenceImagePath: hazard.evidenceImagePath
            ? await storage.resolveEvidenceUrl(hazard.evidenceImagePath)
            : hazard.evidenceImagePath,
        }))
      ),
    }))
  );
  const evidenceImages = await Promise.all(
    report.evidenceImages.map(async (image) => ({
      ...image,
      imagePath: await storage.resolveEvidenceUrl(image.imagePath),
    }))
  );
  return {
    ...report,
    roomBreakdown,
    evidenceImages,
  };
};

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const name = req.body.name ? String(req.body.name) : undefined;
    if (!(await applyAuthRateLimit(req, res, email, false))) return;
    if (!email.includes("@")) return res.status(400).json({ error: "Valid email required." });
    await authService.register(email, name);
    console.info(`[AUTH] register/request-login for ${email}`);
    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Unable to process request right now." });
  }
});

app.post("/api/auth/request-login", async (req, res) => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    if (!(await applyAuthRateLimit(req, res, email, false))) return;
    if (!email.includes("@")) return res.status(400).json({ error: "Valid email required." });
    await authService.requestLogin(email);
    console.info(`[AUTH] request-login for ${email}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Unable to process request right now." });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const code = String(req.body.code ?? "");
    if (!(await applyAuthRateLimit(req, res, email, true))) return;
    if (!email || !code) return res.status(400).json({ error: "Email and code are required." });
    const verified = await authService.verifyLogin(email, code);
    res.cookie(AUTH_COOKIE_NAME, verified.token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      expires: new Date(verified.expiresAt),
    });
    console.info(`[AUTH] verify success email=${email}`);
    return res.json({ user: verified.user });
  } catch (error) {
    console.warn(`[AUTH] verify failed email=${String(req.body?.email ?? "")}`);
    return res.status(400).json({ error: "Invalid or expired verification code." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  if (!req.authUser) return res.status(401).json({ user: null });
  return res.json({ user: req.authUser });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (token) await db.deleteSessionToken(token);
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  console.info("[AUTH] logout");
  return res.json({ ok: true });
});

app.post("/api/maintenance/auth-cleanup", async (req, res) => {
  const key = req.headers["x-maintenance-key"];
  if (!AUTH_MAINTENANCE_KEY || key !== AUTH_MAINTENANCE_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const cleanup = await runCleanupWithLogs();
    return res.json(cleanup);
  } catch (error) {
    console.error(`[AUTH] cleanup failed: ${String(error)}`);
    return res.status(500).json({ error: "Cleanup failed." });
  }
});



app.get("/api/sessions", requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 20)), 100);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  try {
    const { sessions, nextCursor } = await db.listSessionsForUser(req.authUser!.id, { limit, cursor });
    return res.json({ sessions, nextCursor });
  } catch {
    return res.status(400).json({ error: "Invalid cursor." });
  }
});

app.post("/api/sessions", requireAuth, async (req, res) => {
  const body = req.body as {
    city?: string;
    residentAge?: number;
    mobilityAid?: "none" | "cane" | "walker" | "wheelchair";
    fallHistory?: number;
    nightBathroomTrips?: boolean;
  };
  const home = await db.ensureHomeForUser(req.authUser!.id, body.city);
  const session = await db.createSession({
    userId: req.authUser!.id,
    homeId: home.id,
    residentAge: body.residentAge ?? 70,
    mobilityAid: body.mobilityAid ?? "none",
    fallHistory: body.fallHistory ?? 0,
    nightBathroomTrips: !!body.nightBathroomTrips,
    city: body.city,
    overallRiskLevel: undefined,
  });
  for (const roomType of REQUIRED_ROOM_ORDER) {
    await db.getOrCreateRoomScan(session.id, roomType);
  }
  res.status(201).json({ session });
});

app.get("/api/sessions/:id", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({
    session,
    roomScans: await db.listRoomScans(session.id),
    observations: await db.listObservations(session.id),
  });
});

app.post("/api/sessions/:id/context", requireAuth, async (req, res) => {
  const existing = await db.getSession(req.params.id);
  if (!existing) return res.status(404).json({ error: "Session not found." });
  if (existing.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const update = req.body as SessionContextUpdate;
  const session = await db.updateSessionContext(req.params.id, update);
  if (!session) return res.status(404).json({ error: "Session not found." });
  return res.json({ session });
});

const VALID_ROOM_TYPES_SET = new Set<string>(["entryway", "living_room", "bedroom", "bathroom", "kitchen", "stairs", "exterior_entry"]);
const VALID_HAZARD_TYPES_SET = new Set<string>(["poor_lighting", "missing_handrail", "slippery_floor", "loose_rug", "clutter_trip_hazard", "narrow_walkway", "high_threshold", "missing_grab_bar", "unsafe_stairs", "uneven_floor", "outdoor_step_risk"]);
const VALID_SEVERITY_SET = new Set<string>(["low", "medium", "high", "critical"]);
const VALID_STATUS_SET = new Set<string>(["candidate", "validated", "dismissed"]);

app.post("/api/sessions/:id/observations", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const roomType = String(req.body.roomType ?? "");
  const hazardType = String(req.body.hazardType ?? "");
  const severityHint = String(req.body.severityHint ?? "medium");
  const status = String(req.body.status ?? "candidate");
  if (!VALID_ROOM_TYPES_SET.has(roomType)) return res.status(400).json({ error: "Invalid roomType." });
  if (!VALID_HAZARD_TYPES_SET.has(hazardType)) return res.status(400).json({ error: "Invalid hazardType." });
  if (!VALID_SEVERITY_SET.has(severityHint)) return res.status(400).json({ error: "Invalid severityHint." });
  if (!VALID_STATUS_SET.has(status)) return res.status(400).json({ error: "Invalid status." });
  const observation = await db.createObservation({
    sessionId: session.id,
    roomScanId: req.body.roomScanId,
    roomType: roomType as RoomType,
    hazardType: hazardType as HazardObservation["hazardType"],
    severityHint: severityHint as HazardObservation["severityHint"],
    evidenceImagePath: req.body.evidenceImagePath,
    modelNote: req.body.modelNote ?? "",
    followUpNeeded: !!req.body.followUpNeeded,
    status: status as HazardObservation["status"],
  });
  return res.status(201).json({ observation });
});

app.post("/api/sessions/:id/rooms/:roomType/progress", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const roomType = req.params.roomType as RoomType;
  const roomScan = await db.getOrCreateRoomScan(session.id, roomType);
  roomScan.capturedViews = req.body.capturedViews ?? roomScan.capturedViews;
  roomScan.missingViews = req.body.missingViews ?? roomScan.missingViews;
  roomScan.coverageStatus = req.body.coverageStatus ?? roomScan.coverageStatus;
  roomScan.notes = req.body.notes ?? roomScan.notes;
  await db.saveRoomScan(roomScan);
  return res.json({ roomScan });
});

app.post("/api/sessions/:id/finalize", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const assessment = await runAssessmentEngine(session);
  session.status = "completed";
  session.endedAt = new Date().toISOString();
  session.overallRiskLevel = assessment.overallRiskLevel;
  await db.updateSession(session);
  const report = buildReportPayload(assessment);
  await persistReportPayload(report, req.authUser!.id);
  const resolved = await resolveReportEvidenceUrls(report);
  return res.json({ assessment, report: resolved });
});

app.post("/api/sessions/:id/assessment", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const assessment = await runAssessmentEngine(session);
  return res.json({ assessment });
});

app.get("/api/sessions/:id/report", requireAuth, async (req, res) => {
  const report = await db.getReport(req.params.id, req.authUser!.id);
  if (!report) return res.status(404).json({ error: "Report not found." });
  const resolved = await resolveReportEvidenceUrls(report);
  return res.json({ report: resolved });
});

app.get("/api/reports", requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 20)), 100);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  let items: Awaited<ReturnType<typeof db.listReportsForUser>>["reports"];
  let nextCursor: string | null;
  try {
    ({ reports: items, nextCursor } = await db.listReportsForUser(req.authUser!.id, { limit, cursor }));
  } catch {
    return res.status(400).json({ error: "Invalid cursor." });
  }
  return res.json({
    reports: items.map((item) => {
      const report = item.reportJson as ReportPayload;
      return {
        sessionId: item.sessionId,
        createdAt: item.createdAt,
        riskLevel: report?.overallRiskSummary?.level,
        hazardCount: report?.overallRiskSummary?.totalHazards,
        roomCount: report?.roomBreakdown?.length ?? 0,
        summary: report?.overallRiskSummary?.summary ?? "",
      };
    }),
    nextCursor,
  });
});

app.post("/api/leads/contractor", requireAuth, async (req, res) => {
  const ip = clientIpFromRequest(req.ip, typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : undefined);
  const rl = await sharedAuthLimiter.enforce({ endpoint: "leads:contractor", ip, strictOnProviderError: false });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  const name = String(req.body.name ?? "").trim();
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const zip = String(req.body.zip ?? "").trim();
  const phone = req.body.phone ? String(req.body.phone).trim() : undefined;
  const scopeSummary = String(req.body.scopeSummary ?? "").trim();
  if (!name || !email.includes("@") || !/^\d{5}(-\d{4})?$/.test(zip)) {
    return res.status(400).json({ error: "name, a valid email, and a 5-digit zip are required." });
  }
  if (scopeSummary.length > 10_000) {
    return res.status(400).json({ error: "Scope summary is too long (max 10,000 characters)." });
  }
  const accountEmail = req.authUser!.email;
  // Dedup: skip DB insert if same user submitted a lead for this zip in the last hour
  const recentLead = await db.findRecentContractorLead(req.authUser!.id, zip);
  if (!recentLead) {
    try {
      await db.saveContractorLead({ userId: req.authUser!.id, name, email, zip, phone, scopeSummary });
    } catch (err) {
      console.error("[LEAD] DB save failed:", String(err));
      return res.status(500).json({ error: "Unable to submit request right now. Please try again." });
    }
  }
  try {
    await authService.getEmailSender().sendContractorLeadNotification({ name, email, accountEmail, zip, phone, scopeSummary });
    console.info(`[LEAD] contractor lead name=${name} email=${email} zip=${zip}`);
    return res.json({ ok: true });
  } catch (error) {
    console.error(`[LEAD] failed to send contractor lead notification: ${String(error)}`);
    return res.status(500).json({ error: "Unable to submit request right now. Please try again." });
  }
});

const clientBuildPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientBuildPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

Sentry.setupExpressErrorHandler(app);

const parseCookieHeader = (value: string | undefined): Record<string, string> => {
  if (!value) return {};
  return value.split(";").reduce<Record<string, string>>((acc, token) => {
    const [key, ...rest] = token.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
};

const wss = new WebSocketServer({ server, path: "/ws" });
const orchestrators = new Map<WebSocket, SessionOrchestrator>();
const userSessionMap = new Map<string, WebSocket>();

wss.on("connection", async (ws: WebSocket, req) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  const authUser = token ? await db.findUserBySessionToken(token) : null;
  if (!authUser) {
    ws.send(JSON.stringify({ type: "error", payload: { message: "Unauthorized websocket session." } }));
    ws.close();
    return;
  }

  const existingSession = await db.findActiveSessionForUser(authUser.id);
  if (existingSession) {
    const [roomScans, observations] = await Promise.all([
      db.listRoomScans(existingSession.id),
      db.listObservations(existingSession.id),
    ]);
    const history = existingSession.conversationHistory ?? [];
    const orchestrator = await SessionOrchestrator.resume({
      ws,
      geminiApiKey: GEMINI_API_KEY,
      storage,
      session: existingSession,
      roomScans,
      observations,
      conversationHistory: history,
    });
    orchestrators.set(ws, orchestrator);
    userSessionMap.set(authUser.id, ws);
    ws.send(JSON.stringify({
      type: "session_resumed",
      payload: {
        sessionId: existingSession.id,
        inspectionState: orchestrator.buildInspectionStatePayload(),
      },
    }));
  } else {
    ws.send(JSON.stringify({ type: "connected", payload: { message: "Connected to HFE server." } }));
  }

  ws.on("message", async (rawData) => {
    try {
      const message = JSON.parse(rawData.toString()) as {
        type: string;
        payload?: Record<string, unknown>;
      };

      switch (message.type) {
        case "start_session": {
          if (!GEMINI_API_KEY) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "Missing GEMINI_API_KEY." } }));
            return;
          }

          const profile = (message.payload?.profile as Record<string, unknown> | undefined) ?? {};
          const rawAge = Number(profile.age ?? 70);
          const validAge = Number.isFinite(rawAge) && rawAge > 0 ? rawAge : 70;
          const VALID_ROOM_TYPES = new Set([
            "entryway", "living_room", "bedroom", "bathroom",
            "kitchen", "stairs", "exterior_entry",
          ]);
          const rawRoomSeq = (message.payload?.roomSequence as string[] | undefined) ?? [];
          const safeRoomSequence: RoomType[] = rawRoomSeq.every((r) => VALID_ROOM_TYPES.has(r))
            ? rawRoomSeq as RoomType[]
            : REQUIRED_ROOM_ORDER;
          if (userSessionMap.has(authUser.id)) {
            ws.send(JSON.stringify({
              type: "error",
              payload: { message: "You already have an active session. End it first." },
            }));
            break;
          }
          const orchestrator = await SessionOrchestrator.create({
            ws,
            geminiApiKey: GEMINI_API_KEY,
            storage,
            userId: authUser.id,
            profile: {
              age: validAge,
              mobilityLevel: String(profile.mobilityLevel ?? "none"),
              fallHistoryCount: Number(profile.fallHistoryCount ?? 0),
              nightBathroomTrips: Boolean(profile.nightBathroomTrips),
              city: typeof profile.city === "string" ? profile.city : undefined,
              roomSequence: safeRoomSequence,
            },
          });
          orchestrators.set(ws, orchestrator);
          userSessionMap.set(authUser.id, ws);
          await orchestrator.start();
          break;
        }
        case "video_frame":
          orchestrators.get(ws)?.handleVideoFrame(String(message.payload?.data ?? ""));
          break;
        case "text_message":
          await orchestrators.get(ws)?.sendUserText(String(message.payload?.text ?? ""));
          break;
        case "request_report": {
          const orchestrator = orchestrators.get(ws);
          if (!orchestrator) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "No active session." } }));
            break;
          }
          const report = await orchestrator.finalizeSession();
          if (report) {
            const resolved = await resolveReportEvidenceUrls(report);
            ws.send(JSON.stringify({
              type: "report_ready",
              payload: {
                sessionId: resolved.sessionId,
                report: resolved,
              },
            }));
          }
          break;
        }
        case "end_session":
          orchestrators.get(ws)?.close();
          orchestrators.delete(ws);
          userSessionMap.delete(authUser.id);
          break;
        default:
          ws.send(JSON.stringify({ type: "error", payload: { message: "Unknown message type." } }));
      }
    } catch (error) {
      console.error("[WS] message handler error:", error);
      ws.send(JSON.stringify({ type: "error", payload: { message: "Internal server error." } }));
    }
  });

  ws.on("close", () => {
    orchestrators.get(ws)?.close();
    orchestrators.delete(ws);
    userSessionMap.delete(authUser.id);
  });
});

server.listen(PORT, () => console.log(`HFE server on port ${PORT}`));

process.on("SIGTERM", () => {
  for (const orchestrator of orchestrators.values()) {
    orchestrator.close();
  }
  server.close(() => process.exit(0));
});

setInterval(() => {
  const gcCount = sharedAuthLimiter.gc();
  if (gcCount > 0) {
    console.info(`[AUTH] rate limiter gc removed=${gcCount}`);
  }
}, 10 * 60 * 1000);

void runCleanupWithLogs()
  .catch((error) => {
    console.error(`[AUTH] startup cleanup failed: ${String(error)}`);
  });
