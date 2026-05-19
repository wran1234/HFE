import "./instrument";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import http from "http";
import path from "path";
import { WebSocket, WebSocketServer } from "ws";
import { runAuthCleanup } from "./auth/authCleanup";
import { AuthService } from "./auth/authService";
import { attachAuthUser, AUTH_COOKIE_NAME, requireAuth } from "./auth/authMiddleware";
import { createEmailSenderFromEnv } from "./auth/emailSenderFactory";
import { SharedAuthRateLimiter } from "./auth/sharedAuthRateLimiter";
import { db } from "./data/repository";
import { RoomType } from "./domain/enums";
import { REQUIRED_ROOM_ORDER } from "./domain/roomChecklists";
import { SessionOrchestrator } from "./realtime/sessionOrchestrator";
import { getGeminiLiveModel } from "./realtime/liveConfig";
import { GcsStorageAdapter } from "./storage/gcsStorageAdapter";
import { LocalStorageAdapter } from "./storage/storageAdapter";
import { StorageAdapter } from "./storage/storageAdapter";
import { createAuthRouter, createMaintenanceRouter, createLeadsRouter } from "./routes/auth";
import { createSessionsRouter } from "./routes/sessions";
import { createReportsRouter } from "./routes/reports";
import { createAdminRouter } from "./routes/admin";
import { createPublicRouter } from "./routes/public";
import { createServiceRequestsRouter } from "./routes/serviceRequests";
import { parseConsentState, parseSeniorProfile, resolveReportEvidenceUrls, optionalString } from "./routes/shared";

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

// Helmet sets secure HTTP headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow GCS signed-URL media to load
}));

const PORT = parseInt(process.env.PORT || "8080", 10);
const APP_VERSION = process.env.npm_package_version || "1.0.0";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_LIVE_MODEL = getGeminiLiveModel();
const GEMINI_PHOTO_HAZARD_MODEL = (process.env.GEMINI_PHOTO_HAZARD_MODEL || "gemini-2.5-flash").trim();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const IS_PROD = process.env.NODE_ENV === "production";
const NODE_ENV = process.env.NODE_ENV || "development";
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";
const AUTH_RATE_LIMIT_PROVIDER = (process.env.AUTH_RATE_LIMIT_PROVIDER || "local").toLowerCase() as "local" | "upstash";
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 20);
const AUTH_RATE_LIMIT_MAX_PER_EMAIL = Number(process.env.AUTH_RATE_LIMIT_MAX_PER_EMAIL || 8);
const AUTH_TOKEN_RETENTION_HOURS = Number(process.env.AUTH_TOKEN_RETENTION_HOURS || 48);
const CSRF_HEADER_VALUE = "same-origin";

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

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser(process.env.AUTH_SESSION_SECRET || "dev-only-secret"));
app.use(attachAuthUser);
app.use((req, res, next) => {
  if (!req.authUser || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  if (req.headers["x-hfe-csrf"] !== CSRF_HEADER_VALUE) {
    res.status(403).json({ error: "CSRF protection failed." });
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Evidence file serving (local storage only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Health / readiness probes
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  try {
    await db.healthCheck();
    res.json({ status: "ok", version: APP_VERSION, time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", version: APP_VERSION, time: new Date().toISOString() });
  }
});

app.get("/ready", async (_req, res) => {
  const checks = {
    database: false,
    gemini: Boolean(GEMINI_API_KEY),
    authSecret: Boolean(process.env.AUTH_SESSION_SECRET && process.env.AUTH_SESSION_SECRET !== "dev-only-secret"),
    storage: STORAGE_PROVIDER === "gcs"
      ? Boolean(process.env.GCS_BUCKET_NAME)
      : Boolean(process.env.LOCAL_STORAGE_BASE_PATH || !IS_PROD),
    allowedOrigin: Boolean(process.env.ALLOWED_ORIGIN || !IS_PROD),
    sentry: Boolean(process.env.SENTRY_DSN || !IS_PROD),
  };
  try {
    await db.healthCheck();
    checks.database = true;
  } catch {
    checks.database = false;
  }
  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    version: APP_VERSION,
    checks,
    time: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// API route modules
// ---------------------------------------------------------------------------

// Auth routes: /api/auth/*
app.use("/api/auth", createAuthRouter(authService, sharedAuthLimiter));
// Maintenance routes: /api/maintenance/*
app.use("/api/maintenance", createMaintenanceRouter());
// Authenticated contractor lead submission: /api/leads/*
app.use("/api/leads", createLeadsRouter(authService, sharedAuthLimiter));

app.use("/api/sessions", createSessionsRouter(storage, GEMINI_API_KEY, GEMINI_PHOTO_HAZARD_MODEL, GOOGLE_PLACES_API_KEY));
app.use("/api/reports", createReportsRouter());
app.use("/api/admin", createAdminRouter());
app.use("/api/service-requests", createServiceRequestsRouter());

// Public routes (affiliate-clicks, contractor-leads, beta-waitlist, analytics/events, referrals)
// mounted at /api so routes inside use their full relative paths
app.use("/api", createPublicRouter(authService, sharedAuthLimiter));

// ---------------------------------------------------------------------------
// Static file serving (must come after all API routes)
// ---------------------------------------------------------------------------

const clientBuildPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientBuildPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

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
      liveModel: GEMINI_LIVE_MODEL,
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
            liveModel: GEMINI_LIVE_MODEL,
            storage,
            userId: authUser.id,
            profile: {
              age: validAge,
              mobilityLevel: String(profile.mobilityLevel ?? "none"),
              fallHistoryCount: Number(profile.fallHistoryCount ?? 0),
              nightBathroomTrips: Boolean(profile.nightBathroomTrips),
              city: typeof profile.city === "string" ? profile.city : undefined,
              roomSequence: safeRoomSequence,
              seniorProfile: parseSeniorProfile(profile.seniorProfile),
              pilotCohortId: optionalString(profile.pilotCohortId, 120),
              referralId: optionalString(profile.referralId, 120),
              consent: parseConsentState(profile.consent),
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
          if (message.payload?.allowIncomplete !== true && !orchestrator.canFinalizeReport()) {
            ws.send(JSON.stringify({
              type: "error",
              payload: {
                message: "Assessment coverage is incomplete. Review more rooms or confirm that you want an incomplete report.",
                code: "INCOMPLETE_ASSESSMENT",
              },
            }));
            break;
          }
          const report = await orchestrator.finalizeSession();
          if (report) {
            const resolved = await resolveReportEvidenceUrls(report, storage);
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

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`[BOOT] HFE server starting mode=${NODE_ENV} port=${PORT} version=${APP_VERSION}`);
});

process.on("SIGTERM", () => {
  for (const orchestrator of orchestrators.values()) {
    orchestrator.close();
  }
  server.close(() => process.exit(0));
});

// Auth rate limiter GC
setInterval(() => {
  const gcCount = sharedAuthLimiter.gc();
  if (gcCount > 0) {
    console.info(`[AUTH] rate limiter gc removed=${gcCount}`);
  }
}, 10 * 60 * 1000);

// Auth cleanup cron (runs on startup and periodically via external cron or Cloud Scheduler)
void (async () => {
  const startedAt = new Date().toISOString();
  console.info(`[AUTH] cleanup start at=${startedAt}`);
  const result = await runAuthCleanup(AUTH_TOKEN_RETENTION_HOURS);
  const finishedAt = new Date().toISOString();
  console.info(`[AUTH] cleanup done at=${finishedAt} expiredSessions=${result.expiredSessionsDeleted} expiredTokens=${result.expiredTokensDeleted} usedTokens=${result.usedTokensDeleted}`);
})().catch((error) => {
  console.error(`[AUTH] startup cleanup failed: ${String(error)}`);
});
