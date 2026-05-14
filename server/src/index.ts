import "./instrument";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import http from "http";
import path from "path";
import { WebSocket, WebSocketServer } from "ws";
import { runAuthCleanup } from "./auth/authCleanup";
import { AuthService } from "./auth/authService";
import { attachAuthUser, AUTH_COOKIE_NAME, requireAdmin, requireAuth } from "./auth/authMiddleware";
import { createEmailSenderFromEnv } from "./auth/emailSenderFactory";
import { clientIpFromRequest } from "./auth/rateLimit";
import { SharedAuthRateLimiter } from "./auth/sharedAuthRateLimiter";
import { runAssessmentEngine } from "./assessment/assessmentEngine";
import { analyzePhotoForHazards } from "./assessment/photoHazardVision";
import { generateServiceRequestSuggestions } from "./assessment/serviceRequestEngine";
import { searchContractorsNearZip } from "./contractors/contractorSearch";
import { db } from "./data/repository";
import { RoomType } from "./domain/enums";
import { REQUIRED_ROOM_ORDER } from "./domain/roomChecklists";
import {
  CareNoteAuthorRole,
  CareNoteType,
  EvidenceUploaderRole,
  RecommendationEvidenceType,
  ReportPayload,
  SeniorProfile,
  AssessmentReviewStatus,
  ReviewConfidenceLevel,
  PartnerOrganizationType,
  PartnerReferralInviteType,
  PartnerReferralStatus,
  PilotCohortStatus,
  FollowUpCheckInType,
  FollowUpCheckInStatus,
  ServiceRequesterRole,
  ServiceRequestStatus,
  ServiceType,
  SessionContextUpdate,
  HazardObservation,
} from "./domain/types";
import { buildExportablePreventionSummary, estimatePreventionImpact } from "./domain/independenceRisk";
import { SessionOrchestrator } from "./realtime/sessionOrchestrator";
import { getGeminiLiveModel } from "./realtime/liveConfig";
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
const AUTH_MAINTENANCE_KEY = process.env.AUTH_MAINTENANCE_KEY || "";
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

const hasMinimumAssessmentCoverage = (roomScans: Awaited<ReturnType<typeof db.listRoomScans>>): boolean => {
  if (roomScans.length === 0) return false;
  const averageCoverage = roomScans.reduce((acc, scan) => {
    if (scan.coverageStatus === "covered" || scan.coverageStatus === "skipped") return acc + 1;
    return acc + scan.capturedViews.length / Math.max(scan.requiredViews.length, 1);
  }, 0) / roomScans.length;
  return averageCoverage >= 0.6;
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
  // Use timing-safe comparison to prevent timing-based key enumeration attacks.
  const keyStr = typeof key === "string" ? key : "";
  const keyValid = AUTH_MAINTENANCE_KEY.length > 0 &&
    keyStr.length === AUTH_MAINTENANCE_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(keyStr), Buffer.from(AUTH_MAINTENANCE_KEY));
  if (!keyValid) {
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
    seniorProfile?: Partial<SeniorProfile>;
    pilotCohortId?: string;
    referralId?: string;
    consent?: {
      consentAccepted?: boolean;
      consentVersion?: string;
      recordingPermissionConfirmed?: boolean;
      shareWithCareCoordinator?: boolean;
      shareWithContractor?: boolean;
      shareWithInsurer?: boolean;
    };
  };
  const consent = parseConsentState(body.consent);
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
    pilotCohortId: optionalString(body.pilotCohortId, 120),
    referralId: optionalString(body.referralId, 120),
    ...consent,
  });
  for (const roomType of REQUIRED_ROOM_ORDER) {
    await db.getOrCreateRoomScan(session.id, roomType);
  }
  const seniorProfile = parseSeniorProfile(body.seniorProfile);
  if (seniorProfile) {
    await db.upsertSeniorProfile(session.id, seniorProfile);
  }
  res.status(201).json({ session });
});

app.get("/api/sessions/:id", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({
    session,
    seniorProfile: await db.getSeniorProfile(session.id),
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
  return res.json({ session, seniorProfile: await db.getSeniorProfile(session.id) });
});

const VALID_ROOM_TYPES_SET = new Set<string>(["entryway", "living_room", "bedroom", "bathroom", "kitchen", "stairs", "exterior_entry"]);
const VALID_HAZARD_TYPES_SET = new Set<string>(["poor_lighting", "missing_handrail", "slippery_floor", "loose_rug", "clutter_trip_hazard", "narrow_walkway", "high_threshold", "missing_grab_bar", "unsafe_stairs", "uneven_floor", "outdoor_step_risk"]);
const VALID_SEVERITY_SET = new Set<string>(["low", "medium", "high", "critical"]);
const VALID_STATUS_SET = new Set<string>(["candidate", "validated", "dismissed"]);
const PHOTO_VIEW_LABELS: Record<string, string> = {
  wide_view: "wide room view",
  walking_path: "main walking path",
  floor_surfaces: "floor, rugs, and thresholds",
  nighttime_path: "nighttime route and lighting",
  transfer_support: "grab bars, handrails, and transfer support",
  stairs: "stairs and railings",
  exterior_entry: "exterior entry and outdoor steps",
  cooking_area: "cooking and counter area",
};
const PHOTO_CONCERN_LABELS: Record<string, string> = {
  poor_lighting: "poor lighting",
  missing_handrail: "missing handrail",
  slippery_floor: "slippery floor",
  loose_rug: "loose rug",
  clutter_trip_hazard: "clutter or cords in the walking path",
  narrow_walkway: "narrow walkway",
  high_threshold: "raised threshold",
  missing_grab_bar: "missing grab bar",
  unsafe_stairs: "unsafe stairs",
  uneven_floor: "uneven floor",
  outdoor_step_risk: "outdoor step risk",
};
const PHOTO_CONCERN_DEFAULT_SEVERITY: Record<string, HazardObservation["severityHint"]> = {
  poor_lighting: "medium",
  missing_handrail: "high",
  slippery_floor: "high",
  loose_rug: "medium",
  clutter_trip_hazard: "medium",
  narrow_walkway: "medium",
  high_threshold: "medium",
  missing_grab_bar: "high",
  unsafe_stairs: "high",
  uneven_floor: "medium",
  outdoor_step_risk: "high",
};
const VALID_ANALYTICS_EVENT_NAMES = new Set<string>([
  "report_viewed",
  "affiliate_click_started",
  "affiliate_click_saved",
  "contractor_form_opened",
  "contractor_lead_submitted",
  "contractor_lead_saved",
  "beta_waitlist_joined",
]);
const VALID_LEAD_STATUS = new Set<string>(["new", "contacted", "qualified", "rejected", "converted"]);
const VALID_PROJECT_URGENCY = new Set<string>(["immediately", "within_30_days", "within_3_months", "just_researching"]);
const VALID_ESTIMATED_BUDGET = new Set<string>(["under_500", "500_2000", "2000_5000", "over_5000", "unsure"]);
const VALID_AGE_RANGE = new Set<string>(["under_65", "65_74", "75_84", "85_plus", "unknown"]);
const VALID_LIVING_ARRANGEMENT = new Set<string>(["alone", "with_spouse", "with_family", "assisted_living", "other", "unknown"]);
const VALID_SENIOR_MOBILITY = new Set<string>(["independent", "cane_walker", "needs_help", "wheelchair", "mostly_bedbound", "unknown"]);
const VALID_PRIOR_FALLS = new Set<string>(["none", "one", "multiple", "unknown"]);
const VALID_COMPLEXITY = new Set<string>(["low", "medium", "high", "unknown"]);
const VALID_MEMORY_CONCERNS = new Set<string>(["none", "mild", "moderate", "severe", "unknown"]);
const VALID_CARE_NOTE_TYPE = new Set<string>(["family_check_in", "caregiver_visit", "contractor_update", "clinician_note", "other"]);
const VALID_CARE_AUTHOR_ROLE = new Set<string>(["family", "caregiver", "contractor", "clinician", "admin", "other"]);
const VALID_ACTION_STATUS = new Set<string>(["pending", "in_progress", "completed", "skipped"]);
const VALID_ACTION_OWNER = new Set<string>(["family", "caregiver", "contractor", "clinician", "insurer_or_care_coordinator"]);
const VALID_ACTION_PRIORITY = new Set<string>(["immediate", "this_week", "this_month", "monitor"]);
const VALID_PREVENTION_IMPACT = new Set<string>(["low", "medium", "high"]);
const VALID_EVIDENCE_TYPE = new Set<string>(["before_photo", "after_photo", "note", "contractor_update", "caregiver_update", "other"]);
const VALID_EVIDENCE_UPLOADER_ROLE = new Set<string>(["family", "caregiver", "contractor", "admin", "other"]);
const VALID_SERVICE_TYPE = new Set<string>(["home_modification", "caregiver_visit", "rehab_evaluation", "smart_monitoring", "clinician_followup", "family_checkin", "memory_support", "other"]);
const VALID_SERVICE_REQUESTER_ROLE = new Set<string>(["family", "care_coordinator", "contractor", "caregiver", "admin", "other"]);
const VALID_SERVICE_STATUS = new Set<string>(["draft", "requested", "matched", "scheduled", "completed", "cancelled"]);
const VALID_REVIEW_STATUS = new Set<string>(["not_reviewed", "reviewed", "needs_followup", "rejected"]);
const VALID_REVIEW_CONFIDENCE = new Set<string>(["low", "medium", "high"]);
const VALID_PARTNER_ORG_TYPE = new Set<string>(["insurer", "home_care_agency", "care_coordinator", "contractor_partner", "local_government", "employer_benefit", "other"]);
const VALID_PILOT_COHORT_STATUS = new Set<string>(["draft", "active", "paused", "completed"]);
const VALID_FOLLOW_UP_TYPE = new Set<string>(["thirty_day", "sixty_day", "ninety_day", "custom"]);
const VALID_FOLLOW_UP_STATUS = new Set<string>(["scheduled", "completed", "missed", "cancelled"]);
const VALID_REFERRAL_INVITE_TYPE = new Set<string>(["general_link", "family_invite", "care_coordinator_invite", "contractor_invite", "employer_benefit", "insurer_member", "other"]);
const VALID_REFERRAL_STATUS = new Set<string>(["created", "sent", "opened", "started_onboarding", "consent_completed", "assessment_completed", "report_generated", "inactive", "cancelled"]);

const optionalString = (value: unknown, max = 300): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, max) : undefined;
};

const parseConsentState = (input: unknown) => {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const consentAccepted = Boolean(raw.consentAccepted);
  return {
    consentAccepted,
    consentAcceptedAt: consentAccepted ? new Date().toISOString() : undefined,
    consentVersion: optionalString(raw.consentVersion, 40) ?? "parent-safety-consent-v1",
    recordingPermissionConfirmed: Boolean(raw.recordingPermissionConfirmed),
    shareWithCareCoordinator: Boolean(raw.shareWithCareCoordinator),
    shareWithContractor: Boolean(raw.shareWithContractor),
    shareWithInsurer: Boolean(raw.shareWithInsurer),
  };
};

const consentStateFromSession = (session: {
  consentAccepted?: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
  recordingPermissionConfirmed?: boolean;
  shareWithCareCoordinator?: boolean;
  shareWithContractor?: boolean;
  shareWithInsurer?: boolean;
}) => ({
  consentAccepted: Boolean(session.consentAccepted),
  consentAcceptedAt: session.consentAcceptedAt,
  consentVersion: session.consentVersion,
  recordingPermissionConfirmed: Boolean(session.recordingPermissionConfirmed),
  shareWithCareCoordinator: Boolean(session.shareWithCareCoordinator),
  shareWithContractor: Boolean(session.shareWithContractor),
  shareWithInsurer: Boolean(session.shareWithInsurer),
});

const parseSeniorProfile = (input: unknown): Partial<SeniorProfile> | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const ageRange = String(raw.ageRange ?? "unknown");
  const livingArrangement = String(raw.livingArrangement ?? "unknown");
  const mobilityLevel = String(raw.mobilityLevel ?? "unknown");
  const priorFalls = String(raw.priorFalls ?? "unknown");
  const medicationComplexity = String(raw.medicationComplexity ?? "unknown");
  const memoryConcerns = String(raw.memoryConcerns ?? "unknown");
  return {
    seniorName: optionalString(raw.seniorName, 120),
    relationshipToUser: optionalString(raw.relationshipToUser, 80),
    ageRange: (VALID_AGE_RANGE.has(ageRange) ? ageRange : "unknown") as SeniorProfile["ageRange"],
    livingArrangement: (VALID_LIVING_ARRANGEMENT.has(livingArrangement) ? livingArrangement : "unknown") as SeniorProfile["livingArrangement"],
    mobilityLevel: (VALID_SENIOR_MOBILITY.has(mobilityLevel) ? mobilityLevel : "unknown") as SeniorProfile["mobilityLevel"],
    priorFalls: (VALID_PRIOR_FALLS.has(priorFalls) ? priorFalls : "unknown") as SeniorProfile["priorFalls"],
    chronicConditions: Array.isArray(raw.chronicConditions) ? raw.chronicConditions.map(String).slice(0, 20) : optionalString(raw.chronicConditions, 500)?.split(",").map((item) => item.trim()).filter(Boolean),
    medicationComplexity: (VALID_COMPLEXITY.has(medicationComplexity) ? medicationComplexity : "unknown") as SeniorProfile["medicationComplexity"],
    memoryConcerns: (VALID_MEMORY_CONCERNS.has(memoryConcerns) ? memoryConcerns : "unknown") as SeniorProfile["memoryConcerns"],
    visionConcerns: raw.visionConcerns === undefined ? undefined : Boolean(raw.visionConcerns),
    hearingConcerns: raw.hearingConcerns === undefined ? undefined : Boolean(raw.hearingConcerns),
    emergencyContactName: optionalString(raw.emergencyContactName, 120),
    emergencyContactPhone: optionalString(raw.emergencyContactPhone, 60),
    primaryCaregiver: optionalString(raw.primaryCaregiver, 120),
  };
};

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

app.post("/api/sessions/:id/photo-evidence", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const roomType = String(req.body.roomType ?? "");
  const viewKey = optionalString(req.body.viewKey, 80) ?? "wide_view";
  const base64Image = String(req.body.base64Image ?? "").replace(/^data:image\/[a-zA-Z]+;base64,/, "");
  const concerns: string[] = Array.isArray(req.body.concerns) ? req.body.concerns.map((item: unknown) => String(item)) : [];
  const validConcerns: string[] = concerns.filter((item: string) => VALID_HAZARD_TYPES_SET.has(item)).slice(0, 6);
  if (!VALID_ROOM_TYPES_SET.has(roomType)) return res.status(400).json({ error: "Invalid roomType." });
  if (!base64Image || base64Image.length > 10_000_000) return res.status(400).json({ error: "A reasonably sized photo is required." });

  const saved = await storage.saveEvidence({
    base64Image,
    userId: session.userId,
    sessionId: session.id,
    roomType,
    hint: `${viewKey}_photo`,
  });
  const asset = await db.createEvidenceAsset({
    userId: session.userId,
    sessionId: session.id,
    roomType: roomType as RoomType,
    storageProvider: storage.providerName,
    storageKey: saved.storageKey,
    publicUrl: saved.publicUrl,
    mimeType: "image/jpeg",
  });
  const roomScan = await db.getOrCreateRoomScan(session.id, roomType as RoomType);
  const capturedViews = Array.from(new Set([...(roomScan.capturedViews ?? []), viewKey]));
  roomScan.capturedViews = capturedViews;
  roomScan.missingViews = (roomScan.requiredViews ?? []).filter((view) => !capturedViews.includes(view));
  roomScan.coverageStatus = roomScan.missingViews.length === 0 || capturedViews.length >= 2 ? "covered" : "in_progress";
  roomScan.notes = `Photo-based assessment: captured ${capturedViews.map((view) => PHOTO_VIEW_LABELS[view] ?? view).join(", ")}.`;
  await db.saveRoomScan(roomScan);

  const aiDetectedObservations = await analyzePhotoForHazards({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_PHOTO_HAZARD_MODEL,
    sessionId: session.id,
    roomType: roomType as RoomType,
    roomScanId: roomScan.id,
    viewLabel: PHOTO_VIEW_LABELS[viewKey] ?? viewKey,
    base64Image,
    evidenceImagePath: saved.storageKey,
  });
  const aiHazardTypes = new Set(aiDetectedObservations.map((observation) => observation.hazardType));
  const manuallyFlaggedObservations = validConcerns
    .filter((hazardType) => !aiHazardTypes.has(hazardType as HazardObservation["hazardType"]))
    .map((hazardType: string): Omit<HazardObservation, "id" | "createdAt"> => ({
      sessionId: session.id,
      roomScanId: roomScan.id,
      roomType: roomType as RoomType,
      hazardType: hazardType as HazardObservation["hazardType"],
      severityHint: PHOTO_CONCERN_DEFAULT_SEVERITY[hazardType] ?? "medium",
      evidenceImagePath: saved.storageKey,
      modelNote: `Photo-based prevention review flagged ${PHOTO_CONCERN_LABELS[hazardType] ?? hazardType} in the ${PHOTO_VIEW_LABELS[viewKey] ?? viewKey}. This is screening support, not a diagnosis or professional inspection.`,
      followUpNeeded: ["missing_grab_bar", "missing_handrail", "unsafe_stairs", "outdoor_step_risk"].includes(hazardType),
      status: "candidate",
    }));
  const observations = await Promise.all([...aiDetectedObservations, ...manuallyFlaggedObservations].map((observation) => db.createObservation(observation)));
  return res.status(201).json({
    photo: {
      storageKey: saved.storageKey,
      publicUrl: await storage.resolveEvidenceUrl(saved.storageKey).catch(() => saved.publicUrl),
      evidenceAssetId: asset.id,
    },
    roomScan,
    observations,
    detectedHazardCount: observations.length,
  });
});

app.post("/api/sessions/:id/finalize", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  if (!session.consentAccepted || !session.recordingPermissionConfirmed) {
    return res.status(409).json({
      error: "Consent and recording permission must be confirmed before generating a prevention report.",
      code: "CONSENT_REQUIRED",
    });
  }
  const roomScans = await db.listRoomScans(session.id);
  if (req.body?.allowIncomplete !== true && !hasMinimumAssessmentCoverage(roomScans)) {
    return res.status(409).json({
      error: "Assessment coverage is incomplete. Review more rooms or confirm that you want an incomplete report.",
      code: "INCOMPLETE_ASSESSMENT",
    });
  }
  const assessment = await runAssessmentEngine(session);
  session.status = "completed";
  session.endedAt = new Date().toISOString();
  session.overallRiskLevel = assessment.overallRiskLevel;
  await db.updateSession(session);
  if (session.referralId) {
    await db.updatePartnerReferralStatus(session.referralId, "assessment_completed");
  }
  const seniorProfile = await db.getSeniorProfile(session.id);
  const report = buildReportPayload(assessment, seniorProfile);
  const assessmentReview = await db.getAssessmentReview(session.id);
  report.assessmentReview = assessmentReview;
  report.consent = consentStateFromSession(session);
  await persistReportPayload(report, req.authUser!.id);
  if (session.referralId) {
    await db.updatePartnerReferralStatus(session.referralId, "report_generated");
  }
  const resolved = await resolveReportEvidenceUrls(report);
  return res.json({ assessment, report: resolved });
});

app.post("/api/beta-waitlist", async (req, res) => {
  try {
    const ip = clientIpFromRequest(req.ip, typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : undefined);
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const name = req.body.name ? String(req.body.name).trim().slice(0, 120) : undefined;
    const role = req.body.role ? String(req.body.role).trim().slice(0, 80) : undefined;
    const zipCode = req.body.zipCode ? String(req.body.zipCode).trim() : undefined;
    const source = req.body.source ? String(req.body.source).trim().slice(0, 80) : "home";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const zipOk = !zipCode || /^\d{5}(-\d{4})?$/.test(zipCode);
    if (!emailOk || !zipOk) {
      return res.status(400).json({ error: "Enter a valid email address and ZIP code." });
    }

    const rl = await sharedAuthLimiter.enforce({
      endpoint: "beta-waitlist",
      ip,
      email,
      strictOnProviderError: false,
    });
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSec));
      return res.status(429).json({ error: "Too many signup attempts. Please wait and try again." });
    }

    const signup = await db.upsertBetaWaitlistSignup({
      email,
      name,
      role,
      zipCode,
      source,
    });
    await db.saveAnalyticsEvent({
      eventName: "beta_waitlist_joined",
      metadata: {
        source,
        zipCode: zipCode ?? null,
        role: role ?? null,
        created: signup.created,
      },
    });
    try {
      await authService.getEmailSender().sendBetaWaitlistConfirmation({ email, name });
    } catch (emailError) {
      console.warn("[BETA] waitlist_confirmation_email_failed", { id: signup.id, email, error: String(emailError) });
    }
    console.info("[BETA] waitlist_signup_saved", { id: signup.id, email, zipCode: zipCode ?? null, source, created: signup.created });
    return res.status(signup.created ? 201 : 200).json({ ok: true, id: signup.id, alreadyJoined: !signup.created });
  } catch (error) {
    console.error("[BETA] waitlist_signup_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to join the beta list right now." });
  }
});

app.post("/api/sessions/:id/assessment", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const assessment = await runAssessmentEngine(session);
  return res.json({ assessment });
});

app.get("/api/sessions/:id/report", requireAuth, async (req, res) => {
  const report = await db.getReport(req.params.id, req.authUser!.role === "admin" ? undefined : req.authUser!.id);
  if (!report) return res.status(404).json({ error: "Report not found." });
  const resolved = await resolveReportEvidenceUrls(report);
  return res.json({ report: resolved });
});

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderPreventionSummaryHtml = (summary: ReturnType<typeof buildExportablePreventionSummary>): string => {
  const riskRows = Object.entries(summary.risks)
    .map(([label, value]) => `<div class="metric"><span>${escapeHtml(label.replace(/([A-Z])/g, " $1"))}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  const actions = summary.topRecommendedActions
    .map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.priority.replace("_", " "))} · ${escapeHtml(item.owner.replace(/_/g, " "))} · Estimated prevention impact: ${escapeHtml(item.estimatedPreventionImpact ?? "low")}</span><p>${escapeHtml(item.recommendedAction)}</p></li>`)
    .join("");
  const activeServices = (summary.activeServiceRequests ?? [])
    .map((request) => `<li><strong>${escapeHtml(request.title)}</strong><br><span>${escapeHtml(request.serviceType.replace(/_/g, " "))} · ${escapeHtml(request.status)} · ${escapeHtml(request.priority.replace("_", " "))}</span>${request.providerName ? `<p>Provider: ${escapeHtml(request.providerName)} ${escapeHtml(request.providerContact ?? "")}</p>` : ""}${request.notes ? `<p>${escapeHtml(request.notes)}</p>` : ""}${request.providerFollowupNeeded ? `<p>Provider follow-up needed.</p>` : ""}</li>`)
    .join("");
  const scheduledServices = (summary.scheduledOrCompletedServiceRequests ?? [])
    .map((request) => `<li><strong>${escapeHtml(request.title)}</strong><br><span>${escapeHtml(request.status)}${request.scheduledAt ? ` · scheduled ${escapeHtml(new Date(request.scheduledAt).toLocaleString())}` : ""}${request.completedAt ? ` · completed ${escapeHtml(new Date(request.completedAt).toLocaleString())}` : ""}</span>${request.providerName ? `<p>Provider: ${escapeHtml(request.providerName)} ${escapeHtml(request.providerContact ?? "")}</p>` : ""}<p>Completion verified: ${request.completionVerified ? "yes" : "not yet"}${request.serviceQualityRating ? ` · Family rating: ${escapeHtml(request.serviceQualityRating)}/5` : ""}</p>${request.familyFeedback ? `<p>Family feedback: ${escapeHtml(request.familyFeedback)}</p>` : ""}</li>`)
    .join("");
  const review = summary.assessmentReview;
  const reviewLine = review?.reviewStatus === "reviewed"
    ? `Reviewed by care coordinator${review.reviewedBy ? ` (${escapeHtml(review.reviewedBy)})` : ""}. Confidence: ${escapeHtml(review.confidenceLevel)}.`
    : review?.reviewStatus === "needs_followup"
      ? "Needs follow-up review by a care coordinator."
      : review?.reviewStatus === "rejected"
        ? "Assessment review rejected; repeat or verify before sharing."
        : "AI-generated prevention support; not yet reviewed by a care coordinator.";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>HFE Prevention Summary</title>
  <style>
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #292524; margin: 0; background: #f7f3ea; }
    main { max-width: 880px; margin: 0 auto; background: white; min-height: 100vh; padding: 40px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 12px; font-size: 16px; text-transform: uppercase; letter-spacing: .06em; color: #78716c; }
    .sub { color: #78716c; margin: 0 0 24px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .metric { border: 1px solid #e7e0d3; border-radius: 10px; padding: 12px; background: #fbfaf7; display: flex; justify-content: space-between; gap: 12px; }
    .metric span { color: #78716c; text-transform: capitalize; }
    ul { padding-left: 20px; }
    li { margin: 0 0 14px; }
    li span, p, .note { color: #57534e; }
    .disclaimer { border: 1px solid #f3d8a7; background: #fffbeb; border-radius: 10px; padding: 14px; color: #854d0e; margin-top: 28px; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    button { border: 1px solid #d6d3d1; background: white; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    @media print { body { background: white; } main { padding: 0; } .toolbar { display: none; } }
  </style>
</head>
<body>
  <main>
    <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
    <h1>Prevention Summary</h1>
    <p class="sub">For sharing with your care team, family, insurer, home-care agency, contractor, or service provider.</p>
    <p><strong>Generated:</strong> ${escapeHtml(new Date(summary.generatedAt).toLocaleString())}</p>
    <p><strong>Profile:</strong> ${escapeHtml(summary.seniorProfileSummary)}</p>
    <h2>Consent & Review</h2>
    <p><strong>Consent:</strong> ${summary.consent?.consentAccepted ? "Accepted" : "Not captured"}${summary.consent?.consentAcceptedAt ? ` · ${escapeHtml(new Date(summary.consent.consentAcceptedAt).toLocaleString())}` : ""}</p>
    <p><strong>Sharing:</strong> Care coordinator ${summary.consent?.shareWithCareCoordinator ? "allowed" : "not allowed"} · Contractor ${summary.consent?.shareWithContractor ? "allowed" : "not allowed"} · Insurer ${summary.consent?.shareWithInsurer ? "allowed" : "not allowed"}</p>
    <p><strong>Review status:</strong> ${reviewLine}</p>
    ${review?.reviewerNotes ? `<p><strong>Care coordinator notes:</strong> ${escapeHtml(review.reviewerNotes)}</p>` : ""}
    <h2>Risk Support</h2>
    <div class="grid">${riskRows}</div>
    <h2>Top Risk Drivers</h2>
    <ul>${summary.topRiskDrivers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h2>Top Recommended Actions</h2>
    <ul>${actions}</ul>
    <h2>Execution Status</h2>
    <p>${summary.completedActionCount} completed or skipped actions · ${summary.pendingActionCount} pending actions.</p>
    <h2>Care Notes Summary</h2>
    <p><strong>Changed:</strong> ${escapeHtml(summary.careNotesSummary.whatChanged.join(" "))}</p>
    <p><strong>Needs attention:</strong> ${escapeHtml(summary.careNotesSummary.whatNeedsAttention.join(" "))}</p>
    <p><strong>Next:</strong> ${escapeHtml(summary.careNotesSummary.nextRecommendedAction)}</p>
    <h2>Progress Since Assessment</h2>
    <p>${escapeHtml(summary.progressSummary?.completedActionsCount ?? 0)} completed actions · ${escapeHtml(summary.progressSummary?.openImmediateActionsCount ?? 0)} open immediate actions · ${escapeHtml(summary.progressSummary?.serviceRequestsCompleted ?? 0)} completed service requests.</p>
    <p><strong>Latest family follow-up:</strong> ${summary.latestFamilyFollowUp ? `${escapeHtml(summary.latestFamilyFollowUp.status)}${summary.latestFamilyFollowUp.completedAt ? ` · ${escapeHtml(new Date(summary.latestFamilyFollowUp.completedAt).toLocaleDateString())}` : ""}` : "No family follow-up submitted yet."}</p>
    ${summary.latestFamilyFollowUp?.currentBiggestConcern ? `<p><strong>Current biggest concern:</strong> ${escapeHtml(summary.latestFamilyFollowUp.currentBiggestConcern)}</p>` : ""}
    ${summary.latestFamilyFollowUp ? `<p><strong>Self-reported progress:</strong> major home fix ${summary.latestFamilyFollowUp.majorHomeFixCompleted ? "completed" : "not reported"} · caregiver support ${summary.latestFamilyFollowUp.newCaregiverSupportAdded ? "added" : "not reported"} · parent feels safer ${escapeHtml(summary.latestFamilyFollowUp.parentFeelsSafer ?? "unsure")}.</p>` : ""}
    <p><strong>Suggested next step:</strong> ${escapeHtml(summary.progressSummary?.suggestedNextStep ?? "Continue tracking prevention actions and family check-ins.")}</p>
    <h2>Service Needs</h2>
    <p><strong>Home modification:</strong> ${escapeHtml(summary.contractorHomeModificationNeeds.join(", ") || "No contractor-specific needs listed.")}</p>
    <p><strong>Caregiver/professional support:</strong> ${escapeHtml(summary.caregiverProfessionalSupportNeeds.join(", ") || "No professional support needs listed.")}</p>
    <p><strong>Recommended service categories:</strong> ${escapeHtml((summary.recommendedServiceCategories ?? []).map((item) => item.replace(/_/g, " ")).join(", ") || "No active service categories yet.")}</p>
    <h2>Active Service Requests</h2>
    <ul>${activeServices || "<li>No active service requests yet.</li>"}</ul>
    <h2>Scheduled / Completed Service Requests</h2>
    <ul>${scheduledServices || "<li>No scheduled or completed service requests yet.</li>"}</ul>
    <div class="disclaimer">${escapeHtml(summary.nonMedicalDisclaimer)} ${escapeHtml(summary.consentPrivacyNote)}</div>
    <p class="note">Service requests are coordination support only and are not medical advice or a substitute for professional judgment.</p>
  </main>
</body>
</html>`;
};

const getExportableSummaryForSession = async (sessionId: string, userId: string) => {
  const report = await db.getReport(sessionId, userId);
  if (!report || !report.independenceRiskScore || !report.independencePlan) return null;
  const careNotesSummary = await db.buildCareNoteSummary(sessionId);
  const evidenceCounts = await db.getEvidenceCountsByRecommendation(sessionId);
  const serviceRequests = await db.listServiceRequests(sessionId);
  const session = await db.getSession(sessionId);
  const assessmentReview = await db.getAssessmentReview(sessionId);
  const followUps = await db.listFollowUpCheckInsForSession(sessionId);
  const plan = report.independencePlan.map((item) => ({
    ...item,
    evidenceCount: evidenceCounts[item.id] ?? item.evidenceCount ?? 0,
    estimatedPreventionImpact: item.estimatedPreventionImpact ?? estimatePreventionImpact({
      section: item.section,
      title: item.title,
      owner: item.owner,
    }),
  }));
  const summary = buildExportablePreventionSummary({
    sessionId,
    generatedAt: new Date().toISOString(),
    profile: report.seniorProfile,
    riskScore: report.independenceRiskScore,
    plan,
    careNotesSummary,
    serviceRequests,
    consent: session ? consentStateFromSession(session) : undefined,
    assessmentReview,
  });
  const latestFamilyFollowUp = followUps.find((item) => item.status === "completed") ?? followUps[0];
  const openImmediate = plan.filter((item) => item.priority === "immediate" && item.status !== "completed" && item.status !== "skipped");
  summary.latestFamilyFollowUp = latestFamilyFollowUp;
  summary.progressSummary = {
    completedActionsCount: plan.filter((item) => item.status === "completed" || item.status === "skipped").length,
    openImmediateActionsCount: openImmediate.length,
    serviceRequestsCompleted: serviceRequests.filter((item) => item.status === "completed").length,
    lastFollowUpStatus: latestFamilyFollowUp?.status,
    currentBiggestConcern: latestFamilyFollowUp?.currentBiggestConcern,
    suggestedNextStep: openImmediate[0]?.title
      ? `The highest remaining priority is ${openImmediate[0].title}. Consider assigning an owner or requesting service support.`
      : "Keep the family check-in rhythm going and update care notes when anything changes.",
  };
  return summary;
};

app.get("/api/sessions/:id/prevention-summary", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const summary = await getExportableSummaryForSession(session.id, req.authUser!.id);
  if (!summary) return res.status(404).json({ error: "Prevention Summary not found." });
  return res.json({ summary });
});

app.get("/api/sessions/:id/prevention-summary.html", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).send("Session not found.");
  if (session.userId !== req.authUser!.id) return res.status(403).send("Forbidden");
  const summary = await getExportableSummaryForSession(session.id, req.authUser!.id);
  if (!summary) return res.status(404).send("Prevention Summary not found.");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(renderPreventionSummaryHtml(summary));
});

app.get("/api/sessions/:id/care-notes", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({ notes: await db.listCareNotes(session.id) });
});

app.post("/api/sessions/:id/care-notes", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const noteType = String(req.body.noteType ?? "other");
  const authorRole = String(req.body.authorRole ?? "family");
  const body = optionalString(req.body.body, 5000);
  if (!VALID_CARE_NOTE_TYPE.has(noteType) || !VALID_CARE_AUTHOR_ROLE.has(authorRole) || !body) {
    return res.status(400).json({ error: "Invalid care note payload." });
  }
  const note = await db.addCareNote({
    sessionId: session.id,
    noteType: noteType as CareNoteType,
    authorName: optionalString(req.body.authorName, 120),
    authorRole: authorRole as CareNoteAuthorRole,
    body,
    observedChanges: optionalString(req.body.observedChanges, 1000),
    concerns: optionalString(req.body.concerns, 1000),
    followUpNeeded: Boolean(req.body.followUpNeeded),
  });
  return res.status(201).json({ note });
});

app.get("/api/sessions/:id/care-notes/summary", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({ summary: await db.buildCareNoteSummary(session.id) });
});

app.get("/api/sessions/:id/recommendations/:recommendationId/evidence", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({ evidence: await db.listRecommendationEvidence(session.id, String(req.params.recommendationId)) });
});

app.post("/api/sessions/:id/recommendations/:recommendationId/evidence", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const evidenceType = String(req.body.evidenceType ?? "note");
  const uploadedByRole = String(req.body.uploadedByRole ?? "family");
  const note = optionalString(req.body.note, 3000);
  const imageUrl = optionalString(req.body.imageUrl, 2000);
  if (!VALID_EVIDENCE_TYPE.has(evidenceType) || !VALID_EVIDENCE_UPLOADER_ROLE.has(uploadedByRole)) {
    return res.status(400).json({ error: "Invalid evidence payload." });
  }
  if (!note && !imageUrl) {
    return res.status(400).json({ error: "Evidence note or imageUrl is required." });
  }
  const evidence = await db.addRecommendationEvidence({
    sessionId: session.id,
    recommendationActionId: String(req.params.recommendationId),
    evidenceType: evidenceType as RecommendationEvidenceType,
    uploadedByRole: uploadedByRole as EvidenceUploaderRole,
    note,
    imageUrl,
  });
  const report = await db.getReport(session.id, req.authUser!.id);
  if (report?.independencePlan) {
    const evidenceCounts = await db.getEvidenceCountsByRecommendation(session.id);
    await db.saveReport({
      ...report,
      independencePlan: report.independencePlan.map((item) =>
        item.id === req.params.recommendationId
          ? { ...item, evidenceCount: evidenceCounts[item.id] ?? 0 }
          : item
      ),
    }, req.authUser!.id);
  }
  return res.status(201).json({ evidence });
});

app.get("/api/sessions/:id/service-requests", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({ serviceRequests: await db.listServiceRequests(session.id) });
});

app.post("/api/sessions/:id/service-requests", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const serviceType = String(req.body.serviceType ?? "");
  const priority = String(req.body.priority ?? "this_month");
  const requestedByRole = String(req.body.requestedByRole ?? "family");
  const status = req.body.status !== undefined ? String(req.body.status) : "draft";
  const title = optionalString(req.body.title, 200);
  const description = optionalString(req.body.description, 2000);
  if (!VALID_SERVICE_TYPE.has(serviceType) || !VALID_ACTION_PRIORITY.has(priority) || !VALID_SERVICE_REQUESTER_ROLE.has(requestedByRole) || !VALID_SERVICE_STATUS.has(status) || !title || !description) {
    return res.status(400).json({ error: "Invalid service request payload." });
  }
  const serviceRequest = await db.createServiceRequest({
    sessionId: session.id,
    recommendationActionId: optionalString(req.body.recommendationActionId, 120),
    serviceType: serviceType as ServiceType,
    title,
    description,
    priority: priority as "immediate" | "this_week" | "this_month" | "monitor",
    requestedByRole: requestedByRole as ServiceRequesterRole,
    requestedByName: optionalString(req.body.requestedByName, 120),
    status: status as ServiceRequestStatus,
    preferredDate: optionalString(req.body.preferredDate, 80),
    scheduledAt: optionalString(req.body.scheduledAt, 80),
    providerName: optionalString(req.body.providerName, 160),
    providerContact: optionalString(req.body.providerContact, 160),
    notes: optionalString(req.body.notes, 2000),
  });
  return res.status(201).json({ serviceRequest });
});

app.post("/api/sessions/:id/service-requests/generate-suggestions", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const report = await db.getReport(session.id, req.authUser!.id);
  if (!report?.independencePlan) return res.status(404).json({ error: "Report plan not found." });
  const existingRequests = await db.listServiceRequests(session.id);
  const suggestions = generateServiceRequestSuggestions({
    plan: report.independencePlan,
    profile: report.seniorProfile,
    existingRequests,
  });
  return res.json({ suggestions, existingRequests });
});

app.patch("/api/service-requests/:id", requireAuth, async (req, res) => {
  const existing = await db.getServiceRequest(String(req.params.id));
  if (!existing) return res.status(404).json({ error: "Service request not found." });
  const session = await db.getSession(existing.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const status = req.body.status !== undefined ? String(req.body.status) : undefined;
  const priority = req.body.priority !== undefined ? String(req.body.priority) : undefined;
  if (status !== undefined && !VALID_SERVICE_STATUS.has(status)) return res.status(400).json({ error: "Invalid service request status." });
  if (priority !== undefined && !VALID_ACTION_PRIORITY.has(priority)) return res.status(400).json({ error: "Invalid service request priority." });
  const updated = await db.updateServiceRequest({
    id: existing.id,
    status: status as ServiceRequestStatus | undefined,
    priority: priority as "immediate" | "this_week" | "this_month" | "monitor" | undefined,
    preferredDate: req.body.preferredDate === null ? null : req.body.preferredDate !== undefined ? String(req.body.preferredDate) : undefined,
    scheduledAt: req.body.scheduledAt === null ? null : req.body.scheduledAt !== undefined ? String(req.body.scheduledAt) : undefined,
    completedAt: req.body.completedAt === null ? null : req.body.completedAt !== undefined ? String(req.body.completedAt) : undefined,
    providerName: req.body.providerName === null ? null : req.body.providerName !== undefined ? optionalString(req.body.providerName, 160) ?? null : undefined,
    providerContact: req.body.providerContact === null ? null : req.body.providerContact !== undefined ? optionalString(req.body.providerContact, 160) ?? null : undefined,
    notes: req.body.notes === null ? null : req.body.notes !== undefined ? optionalString(req.body.notes, 2000) ?? null : undefined,
    serviceQualityRating: req.body.serviceQualityRating === null ? null : req.body.serviceQualityRating !== undefined ? Math.min(5, Math.max(1, Number(req.body.serviceQualityRating))) : undefined,
    familyFeedback: req.body.familyFeedback === null ? null : req.body.familyFeedback !== undefined ? optionalString(req.body.familyFeedback, 2000) ?? null : undefined,
    providerFollowupNeeded: req.body.providerFollowupNeeded !== undefined ? Boolean(req.body.providerFollowupNeeded) : undefined,
    completionVerified: req.body.completionVerified !== undefined ? Boolean(req.body.completionVerified) : undefined,
    completionVerifiedAt: req.body.completionVerifiedAt === null ? null : req.body.completionVerifiedAt !== undefined ? String(req.body.completionVerifiedAt) : req.body.completionVerified === true ? new Date().toISOString() : undefined,
    completionVerifiedBy: req.body.completionVerifiedBy === null ? null : req.body.completionVerifiedBy !== undefined ? optionalString(req.body.completionVerifiedBy, 120) ?? null : req.body.completionVerified === true ? "family" : undefined,
  });
  return res.json({ serviceRequest: updated });
});

app.patch("/api/sessions/:id/recommendations/:recommendationId/status", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const actionStatus = req.body.actionStatus !== undefined ? String(req.body.actionStatus) : undefined;
  const actionOwner = req.body.actionOwner !== undefined ? String(req.body.actionOwner) : undefined;
  const actionPriority = req.body.actionPriority !== undefined ? String(req.body.actionPriority) : undefined;
  const dueDate = req.body.dueDate === null ? null : req.body.dueDate !== undefined ? String(req.body.dueDate) : undefined;
  const skippedReason = req.body.skippedReason === null ? null : req.body.skippedReason !== undefined ? optionalString(req.body.skippedReason, 500) ?? null : undefined;
  const estimatedPreventionImpact = req.body.estimatedPreventionImpact !== undefined ? String(req.body.estimatedPreventionImpact) : undefined;
  if (actionStatus !== undefined && !VALID_ACTION_STATUS.has(actionStatus)) return res.status(400).json({ error: "Invalid actionStatus." });
  if (actionOwner !== undefined && !VALID_ACTION_OWNER.has(actionOwner)) return res.status(400).json({ error: "Invalid actionOwner." });
  if (actionPriority !== undefined && !VALID_ACTION_PRIORITY.has(actionPriority)) return res.status(400).json({ error: "Invalid actionPriority." });
  if (estimatedPreventionImpact !== undefined && !VALID_PREVENTION_IMPACT.has(estimatedPreventionImpact)) return res.status(400).json({ error: "Invalid estimatedPreventionImpact." });
  const updated = await db.updateRecommendationActionStatus({
    sessionId: session.id,
    recommendationId: String(req.params.recommendationId),
    actionStatus: actionStatus as "pending" | "in_progress" | "completed" | "skipped" | undefined,
    actionOwner,
    actionPriority,
    dueDate,
    skippedReason,
    estimatedPreventionImpact,
  });

  const report = await db.getReport(session.id, req.authUser!.id);
  if (!updated && !report?.independencePlan?.some((item) => item.id === req.params.recommendationId)) {
    return res.status(404).json({ error: "Recommendation not found." });
  }
  if (report?.independencePlan) {
    const independencePlan = report.independencePlan.map((item) =>
      item.id === req.params.recommendationId
        ? {
            ...item,
            status: actionStatus ? actionStatus as typeof item.status : item.status,
            owner: actionOwner ? actionOwner as typeof item.owner : item.owner,
            priority: actionPriority ? actionPriority as typeof item.priority : item.priority,
            dueDate: dueDate === undefined ? item.dueDate : dueDate ?? undefined,
            skippedReason: skippedReason === undefined ? item.skippedReason : skippedReason ?? undefined,
            completedAt: actionStatus === "completed" ? new Date().toISOString() : actionStatus ? undefined : item.completedAt,
            estimatedPreventionImpact: estimatedPreventionImpact ? estimatedPreventionImpact as typeof item.estimatedPreventionImpact : item.estimatedPreventionImpact,
          }
        : item
    );
    const nextReport: ReportPayload = {
      ...report,
      independencePlan,
    };
    if (nextReport.familyDashboard) {
      const completed = independencePlan.filter((item) => item.status === "completed" || item.status === "skipped").length;
      nextReport.familyDashboard = {
        ...nextReport.familyDashboard,
        completedActionCount: completed,
        pendingActionCount: independencePlan.length - completed,
      };
    }
    await db.saveReport(nextReport, req.authUser!.id);
  }
  return res.json({ ok: true });
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

app.post("/api/affiliate-clicks", async (req, res) => {
  try {
    const productName = String(req.body.productName ?? "").trim();
    const category = String(req.body.category ?? "").trim();
    const affiliateUrl = String(req.body.affiliateUrl ?? "").trim();
    const reportId = req.body.reportId ? String(req.body.reportId).trim() : undefined;
    let sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
    if (!productName || !category || !affiliateUrl) {
      console.warn("[REVENUE] affiliate validation_error", { productName, category, hasUrl: !!affiliateUrl });
      return res.status(400).json({ error: "productName, category, and affiliateUrl are required." });
    }
    if (!/^https?:\/\//i.test(affiliateUrl)) {
      console.warn("[REVENUE] affiliate validation_error", { reason: "invalid_url" });
      return res.status(400).json({ error: "Invalid affiliateUrl." });
    }

    const userId = req.authUser?.id;
    if (!userId && sessionId) {
      return res.status(401).json({ error: "Authentication required for session-scoped tracking." });
    }
    if (userId && sessionId) {
      const session = await db.getSession(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(401).json({ error: "Authentication required." });
      }
    } else if (!userId) {
      sessionId = undefined;
    }

    const recent = await db.findRecentAffiliateClick({
      userId,
      sessionId,
      reportId,
      productName,
      category,
      affiliateUrl,
      withinSeconds: 15,
    });
    if (recent) {
      return res.json({ ok: true, deduped: true, id: recent.id });
    }

    const click = await db.saveAffiliateClick({
      userId,
      sessionId,
      reportId,
      productName,
      category,
      affiliateUrl,
    });
    await db.saveAnalyticsEvent({
      eventName: "affiliate_click_saved",
      sessionId,
      reportId,
      metadata: {
        productName,
        category,
        deduped: false,
      },
    });
    console.info("[REVENUE] affiliate_click_saved", { id: click.id, userId: userId ?? null, sessionId: sessionId ?? null, productName, category });
    return res.status(201).json({ ok: true, id: click.id });
  } catch (error) {
    console.error("[REVENUE] affiliate_click_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to save affiliate click." });
  }
});

app.post("/api/contractor-leads", async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const phone = req.body.phone ? String(req.body.phone).trim() : undefined;
    const zipCode = String(req.body.zipCode ?? "").trim();
    const preferredContact = String(req.body.preferredContact ?? "").trim().toLowerCase();
    const notes = req.body.notes ? String(req.body.notes).trim() : undefined;
    const projectUrgency = req.body.projectUrgency ? String(req.body.projectUrgency).trim() : undefined;
    const estimatedBudget = req.body.estimatedBudget ? String(req.body.estimatedBudget).trim() : undefined;
    const scopeText = String(req.body.scopeText ?? "").trim();
    let sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const zipOk = /^\d{5}(-\d{4})?$/.test(zipCode);
    const preferredOk = ["email", "phone", "either"].includes(preferredContact);
    if (!name || !emailOk || !zipOk || !scopeText || !preferredOk) {
      console.warn("[REVENUE] lead validation_error", { hasName: !!name, emailOk, zipOk, hasScope: !!scopeText, preferredContact });
      return res.status(400).json({ error: "Invalid contractor lead payload." });
    }
    if (scopeText.length > 20000) {
      console.warn("[REVENUE] lead validation_error", { reason: "scope_too_long" });
      return res.status(400).json({ error: "scopeText is too long." });
    }
    if (projectUrgency && !VALID_PROJECT_URGENCY.has(projectUrgency)) {
      return res.status(400).json({ error: "Invalid projectUrgency." });
    }
    if (estimatedBudget && !VALID_ESTIMATED_BUDGET.has(estimatedBudget)) {
      return res.status(400).json({ error: "Invalid estimatedBudget." });
    }

    const userId = req.authUser?.id;
    if (!userId && sessionId) {
      return res.status(401).json({ error: "Authentication required for session-scoped lead." });
    }
    if (userId && sessionId) {
      const session = await db.getSession(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(401).json({ error: "Authentication required." });
      }
    } else if (!userId) {
      sessionId = undefined;
    }

    const recent = await db.findRecentContractorLeadByEmailZip({
      email,
      zipCode,
      withinMinutes: 10,
    });
    if (recent) {
      return res.json({ ok: true, deduped: true, id: recent.id });
    }

    const lead = await db.saveContractorLead({
      userId,
      sessionId,
      name,
      email,
      phone,
      zipCode,
      preferredContact: preferredContact as "email" | "phone" | "either",
      notes,
      projectUrgency: projectUrgency as "immediately" | "within_30_days" | "within_3_months" | "just_researching" | undefined,
      estimatedBudget: estimatedBudget as "under_500" | "500_2000" | "2000_5000" | "over_5000" | "unsure" | undefined,
      scopeText,
    });
    await db.saveAnalyticsEvent({
      eventName: "contractor_lead_saved",
      sessionId,
      reportId: sessionId,
      metadata: {
        preferredContact,
        projectUrgency: projectUrgency ?? null,
        estimatedBudget: estimatedBudget ?? null,
        deduped: false,
      },
    });
    console.info("[REVENUE] contractor_lead_saved", { id: lead.id, userId: userId ?? null, sessionId: sessionId ?? null, email, zipCode });
    return res.status(201).json({ ok: true, id: lead.id });
  } catch (error) {
    console.error("[REVENUE] contractor_lead_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to save contractor lead." });
  }
});

app.post("/api/sessions/:id/contractor-suggestions", requireAuth, async (req, res) => {
  try {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });

    const zipCode = String(req.body.zipCode ?? "").trim();
    const trades: string[] = Array.isArray(req.body.trades)
      ? Array.from(new Set<string>(req.body.trades.map((item: unknown) => String(item)).filter(Boolean))).slice(0, 5)
      : [];
    if (!/^\d{5}(-\d{4})?$/.test(zipCode)) {
      return res.status(400).json({ error: "Zip code must be 5 digits." });
    }
    if (trades.length === 0) {
      return res.status(400).json({ error: "At least one contractor trade is required." });
    }

    const existing = await db.listContractorSuggestions({ sessionId: session.id, zipCode, trades });
    if (existing.length > 0 && req.body.refresh !== true) {
      return res.json({ suggestions: existing, cached: true });
    }

    const searchResults = (await Promise.all(
      trades.map((trade) =>
        searchContractorsNearZip({
          apiKey: GOOGLE_PLACES_API_KEY,
          trade,
          zipCode,
          limit: 4,
        }).catch((error) => {
          console.warn("[CONTRACTOR] search_failed", { sessionId: session.id, trade, zipCode, error: String(error) });
          return [];
        })
      )
    )).flat();

    await db.saveContractorSuggestions(searchResults.map((result) => ({
      sessionId: session.id,
      trade: result.trade,
      zipCode: result.zipCode,
      provider: result.provider,
      externalId: result.externalId,
      name: result.name,
      rating: result.rating,
      reviewCount: result.reviewCount,
      address: result.address,
      phone: result.phone,
      websiteUrl: result.websiteUrl,
      profileUrl: result.profileUrl,
      sourceUrl: result.sourceUrl,
    })));

    const suggestions = await db.listContractorSuggestions({ sessionId: session.id, zipCode, trades });
    return res.status(201).json({
      suggestions,
      cached: false,
      source: GOOGLE_PLACES_API_KEY ? "google_places" : "google_maps_search",
    });
  } catch (error) {
    console.error("[CONTRACTOR] suggestions_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to find contractor suggestions right now." });
  }
});

app.post("/api/analytics/events", async (req, res) => {
  try {
    const eventName = String(req.body.eventName ?? "").trim();
    const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
    const reportId = req.body.reportId ? String(req.body.reportId).trim() : undefined;
    const metadata = (req.body.metadata && typeof req.body.metadata === "object")
      ? req.body.metadata
      : undefined;

    if (!VALID_ANALYTICS_EVENT_NAMES.has(eventName)) {
      return res.status(400).json({ error: "Invalid eventName." });
    }
    if (sessionId && !req.authUser?.id) {
      return res.status(401).json({ error: "Authentication required for session-scoped events." });
    }
    if (sessionId && req.authUser?.id) {
      const session = await db.getSession(sessionId);
      if (!session || session.userId !== req.authUser.id) {
        return res.status(401).json({ error: "Authentication required." });
      }
    }

    await db.saveAnalyticsEvent({
      eventName,
      sessionId,
      reportId,
      metadata,
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("[ANALYTICS] event_save_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to save analytics event." });
  }
});

const toCsvCell = (value: string | null | undefined): string => {
  const raw = value ?? "";
  return `"${raw.replace(/"/g, "\"\"")}"`;
};

const pct = (value: number | undefined): string => `${Number(value ?? 0).toFixed(1).replace(/\.0$/, "")}%`;

const renderPilotReportHtml = (summary: Awaited<ReturnType<typeof db.getRevenueSummary>>): string => {
  const pilot = summary.parentSafety.pilotMetrics;
  const service = summary.parentSafety.serviceRequests;
  const topHazards = pilot.mostCommonHazardCategories
    .map((item) => `<li>${escapeHtml(item.hazardType.replace(/_/g, " "))}: ${escapeHtml(item.count)}</li>`)
    .join("");
  const snippets = summary.parentSafety.careCoordinationRows.slice(0, 5)
    .map((row) => `<li><strong>${escapeHtml(row.parentLabel)}</strong>: ${escapeHtml(row.riskLevel)} risk · ${escapeHtml(row.topRiskDriver)} · ${escapeHtml(row.pendingImmediateActions)} pending immediate action(s)</li>`)
    .join("");
  const providerRows = (pilot.providerCompletedCounts ?? [])
    .map((item) => `<tr><td>${escapeHtml(item.providerName)}</td><td>${escapeHtml(item.count)}</td></tr>`)
    .join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>HFE Partner Pilot Report</title>
  <style>
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #292524; margin: 0; background: #f7f3ea; }
    main { max-width: 960px; margin: 0 auto; background: #fff; min-height: 100vh; padding: 40px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin: 30px 0 12px; font-size: 16px; text-transform: uppercase; letter-spacing: .06em; color: #78716c; }
    .sub, p, li, td { color: #57534e; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric { border: 1px solid #e7e0d3; border-radius: 10px; padding: 14px; background: #fbfaf7; }
    .metric span { display: block; color: #78716c; font-size: 12px; }
    .metric strong { display: block; font-size: 24px; margin-top: 4px; color: #292524; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; border-bottom: 1px solid #e7e0d3; padding: 8px; }
    .disclaimer { border: 1px solid #f3d8a7; background: #fffbeb; border-radius: 10px; padding: 14px; color: #854d0e; margin-top: 28px; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    button { border: 1px solid #d6d3d1; background: white; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    @media print { body { background: white; } main { padding: 0; } .toolbar { display: none; } }
  </style>
</head>
<body>
  <main>
    <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
    <h1>Partner Pilot Report</h1>
    <p class="sub">Prevention support and care coordination metrics for insurer, eldercare agency, local aging program, home-care, or contractor pilots.</p>
    <p><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</p>
    <h2>Proof Metrics</h2>
    <div class="grid">
      <div class="metric"><span>Assessments completed</span><strong>${escapeHtml(pilot.totalAssessments)}</strong></div>
      <div class="metric"><span>High / urgent risk</span><strong>${pct(pilot.highUrgentRiskPercentage)}</strong></div>
      <div class="metric"><span>Average actions per assessment</span><strong>${escapeHtml(pilot.averageRecommendationsPerAssessment)}</strong></div>
      <div class="metric"><span>Action completion rate</span><strong>${pct(pilot.actionCompletionRate)}</strong></div>
      <div class="metric"><span>Immediate action completion</span><strong>${pct(pilot.immediateActionCompletionRate)}</strong></div>
      <div class="metric"><span>Evidence attachment</span><strong>${pct(pilot.evidenceAttachmentRate)}</strong></div>
      <div class="metric"><span>Service request generation</span><strong>${pct(pilot.serviceRequestGenerationRate)}</strong></div>
      <div class="metric"><span>Service completion</span><strong>${pct(pilot.serviceRequestCompletionRate)}</strong></div>
      <div class="metric"><span>Verified completion</span><strong>${pct(pilot.verifiedCompletionRate)}</strong></div>
      <div class="metric"><span>Care note usage</span><strong>${pct(pilot.careNoteUsageRate)}</strong></div>
      <div class="metric"><span>Memory support flagged</span><strong>${pct(pilot.memorySupportFlaggedPercentage)}</strong></div>
      <div class="metric"><span>Contractor lead conversion</span><strong>${pct(pilot.contractorLeadConversionRate)}</strong></div>
    </div>
    <h2>Service Coordination</h2>
    <div class="grid">
      <div class="metric"><span>Total service requests</span><strong>${escapeHtml(service.total)}</strong></div>
      <div class="metric"><span>Open requests</span><strong>${escapeHtml(service.open)}</strong></div>
      <div class="metric"><span>Completed requests</span><strong>${escapeHtml(service.completed)}</strong></div>
      <div class="metric"><span>Verified completion rate</span><strong>${pct(pilot.verifiedCompletionRate)}</strong></div>
      <div class="metric"><span>Average service rating</span><strong>${pilot.averageServiceRating ? escapeHtml(pilot.averageServiceRating) : "n/a"}</strong></div>
      <div class="metric"><span>Provider follow-up needed</span><strong>${escapeHtml(pilot.providerFollowupNeededCount ?? 0)}</strong></div>
    </div>
    <h2>Top Prevention Needs</h2>
    <ul>${topHazards || "<li>No hazard categories yet.</li>"}</ul>
    <h2>Anonymized Coordination Examples</h2>
    <ul>${snippets || "<li>No completed reports yet.</li>"}</ul>
    <h2>Provider Completion Counts</h2>
    <table><thead><tr><th>Provider</th><th>Completed requests</th></tr></thead><tbody>${providerRows || "<tr><td colspan=\"2\">No provider completions yet.</td></tr>"}</tbody></table>
    <div class="disclaimer">HFE provides prevention support and care coordination support. This partner pilot report is not medical advice, not a diagnosis, and does not guarantee prevention, claim reduction, or outcomes. Emergency situations require local emergency or medical services.</div>
  </main>
</body>
</html>`;
};

const sharingAllowedForPartner = (partnerType: string, row: {
  shareWithCareCoordinator: boolean;
  shareWithContractor: boolean;
  shareWithInsurer: boolean;
}) => {
  if (partnerType === "insurer") return row.shareWithInsurer;
  if (partnerType === "contractor_partner") return row.shareWithContractor;
  return row.shareWithCareCoordinator;
};

const renderCohortReportHtml = (card: Awaited<ReturnType<typeof db.getPilotCohortDashboard>>["cohorts"][number]): string => {
  const m = card.metrics;
  const authorizedRows = card.households.filter((row) => sharingAllowedForPartner(card.partner.organizationType, row));
  const riskRows = authorizedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.riskLevel] = (acc[row.riskLevel] ?? 0) + 1;
    return acc;
  }, {});
  const topDrivers = authorizedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.topRiskDriver] = (acc[row.topRiskDriver] ?? 0) + 1;
    return acc;
  }, {});
  const examples = card.households.slice(0, 6).map((row) => {
    const allowed = sharingAllowedForPartner(card.partner.organizationType, row);
    return `<li><strong>${allowed ? escapeHtml(row.parentLabel) : "Sharing not authorized"}</strong>${allowed ? `: ${escapeHtml(row.riskLevel)} risk · ${escapeHtml(row.topRiskDriver)} · ${escapeHtml(row.pendingImmediateActions)} pending immediate action(s)` : " for this partner type."}</li>`;
  }).join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>HFE Cohort Report</title>
  <style>
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #292524; margin: 0; background: #f7f3ea; }
    main { max-width: 960px; margin: 0 auto; background: #fff; min-height: 100vh; padding: 40px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin: 30px 0 12px; font-size: 16px; text-transform: uppercase; letter-spacing: .06em; color: #78716c; }
    .sub, p, li, td { color: #57534e; }
    .brand { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
    .brand img { max-height:44px; max-width:160px; object-fit:contain; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric { border: 1px solid #e7e0d3; border-radius: 10px; padding: 14px; background: #fbfaf7; }
    .metric span { display: block; color: #78716c; font-size: 12px; }
    .metric strong { display: block; font-size: 24px; margin-top: 4px; color: #292524; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; border-bottom: 1px solid #e7e0d3; padding: 8px; }
    .disclaimer { border: 1px solid #f3d8a7; background: #fffbeb; border-radius: 10px; padding: 14px; color: #854d0e; margin-top: 28px; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    button { border: 1px solid #d6d3d1; background: white; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    @media print { body { background: white; } main { padding: 0; } .toolbar { display: none; } }
  </style>
</head>
<body>
  <main>
    <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
    <div class="brand">${card.partner.logoUrl ? `<img src="${escapeHtml(card.partner.logoUrl)}" alt="">` : ""}<div><h1>Cohort Report</h1><p class="sub">${escapeHtml(card.partner.displayName || card.partner.name)} · ${escapeHtml(card.cohort.name)}</p></div></div>
    <p><strong>Pilot date range:</strong> ${card.cohort.startDate ? escapeHtml(new Date(card.cohort.startDate).toLocaleDateString()) : "Not set"} - ${card.cohort.endDate ? escapeHtml(new Date(card.cohort.endDate).toLocaleDateString()) : "ongoing"}</p>
    <h2>Key Metrics</h2>
    <div class="grid">
      <div class="metric"><span>Total households</span><strong>${escapeHtml(m.totalHouseholds)}</strong></div>
      <div class="metric"><span>Assessments completed</span><strong>${escapeHtml(m.assessmentsCompleted)}</strong></div>
      <div class="metric"><span>High / urgent risk</span><strong>${pct(m.highUrgentRiskPercentage)}</strong></div>
      <div class="metric"><span>Avg recommendations</span><strong>${escapeHtml(m.averageRecommendationsPerAssessment)}</strong></div>
      <div class="metric"><span>Action completion</span><strong>${pct(m.actionCompletionRate)}</strong></div>
      <div class="metric"><span>Immediate completion</span><strong>${pct(m.immediateActionCompletionRate)}</strong></div>
      <div class="metric"><span>Evidence attachment</span><strong>${pct(m.evidenceAttachmentRate)}</strong></div>
      <div class="metric"><span>Service request rate</span><strong>${pct(m.serviceRequestGenerationRate)}</strong></div>
      <div class="metric"><span>Service completion</span><strong>${pct(m.serviceRequestCompletionRate)}</strong></div>
      <div class="metric"><span>Verified completion</span><strong>${pct(m.verifiedCompletionRate)}</strong></div>
      <div class="metric"><span>Average service rating</span><strong>${m.averageServiceRating || "n/a"}</strong></div>
      <div class="metric"><span>Review completion</span><strong>${pct(m.assessmentReviewCompletionRate)}</strong></div>
    </div>
    <h2>Risk Distribution</h2>
    <ul>${Object.entries(riskRows).map(([risk, count]) => `<li>${escapeHtml(risk)}: ${escapeHtml(count)}</li>`).join("") || "<li>No authorized household risk data.</li>"}</ul>
    <h2>Top Risk Drivers</h2>
    <ul>${Object.entries(topDrivers).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([driver, count]) => `<li>${escapeHtml(driver)} (${escapeHtml(count)})</li>`).join("") || "<li>No authorized risk drivers.</li>"}</ul>
    <h2>Follow-up Metrics</h2>
    <div class="grid">
      <div class="metric"><span>Scheduled</span><strong>${escapeHtml(m.followUps.scheduled)}</strong></div>
      <div class="metric"><span>Completed</span><strong>${escapeHtml(m.followUps.completed)}</strong></div>
      <div class="metric"><span>Missed</span><strong>${escapeHtml(m.followUps.missed)}</strong></div>
      <div class="metric"><span>Self-reported new falls</span><strong>${escapeHtml(m.followUps.selfReportedNewFalls)}</strong></div>
      <div class="metric"><span>Self-reported near-falls</span><strong>${escapeHtml(m.followUps.selfReportedNearFalls)}</strong></div>
      <div class="metric"><span>Self-reported hospital visits</span><strong>${escapeHtml(m.followUps.selfReportedHospitalVisits)}</strong></div>
      <div class="metric"><span>Major home fixes completed</span><strong>${escapeHtml(m.followUps.majorHomeFixCompleted)}</strong></div>
      <div class="metric"><span>Caregiver support added</span><strong>${escapeHtml(m.followUps.caregiverSupportAdded)}</strong></div>
      <div class="metric"><span>Families feeling safer</span><strong>${escapeHtml(m.followUps.familiesFeelingSafer)}</strong></div>
      <div class="metric"><span>Families feeling more prepared</span><strong>${escapeHtml(m.followUps.familiesFeelingMorePrepared)}</strong></div>
      <div class="metric"><span>Care coordinator follow-up requested</span><strong>${escapeHtml(m.followUps.careCoordinatorFollowupRequested)}</strong></div>
    </div>
    <h2>Referral Intake Funnel</h2>
    <div class="grid">
      <div class="metric"><span>Referrals created</span><strong>${escapeHtml(m.intake?.created ?? 0)}</strong></div>
      <div class="metric"><span>Opened</span><strong>${escapeHtml(m.intake?.opened ?? 0)}</strong></div>
      <div class="metric"><span>Started onboarding</span><strong>${escapeHtml(m.intake?.startedOnboarding ?? 0)}</strong></div>
      <div class="metric"><span>Consent completed</span><strong>${escapeHtml(m.intake?.consentCompleted ?? 0)}</strong></div>
      <div class="metric"><span>Assessment completed</span><strong>${escapeHtml(m.intake?.assessmentCompleted ?? 0)}</strong></div>
      <div class="metric"><span>Report generated</span><strong>${escapeHtml(m.intake?.reportGenerated ?? 0)}</strong></div>
      <div class="metric"><span>Opened to report generated</span><strong>${pct(m.intake?.openedToReportGeneratedRate)}</strong></div>
      <div class="metric"><span>Inactive / cancelled</span><strong>${escapeHtml(m.intake?.inactiveOrCancelled ?? 0)}</strong></div>
    </div>
    <h2>Anonymized Household Examples</h2>
    <ul>${examples || "<li>No enrolled households yet.</li>"}</ul>
    <p class="sub">Rows marked “Sharing not authorized” are excluded from partner household detail because consent/share preferences do not authorize sharing for this partner type.</p>
    <div class="disclaimer">HFE provides prevention support, aging-at-home support, and care coordination support. This report is not medical advice, not diagnostic, and does not guarantee prevention, claim reduction, or outcomes. Follow-up metrics are self-reported pilot tracking only.</div>
  </main>
</body>
</html>`;
};

const renderPartnerOverviewHtml = (): string => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AI Parent Safety & Independence Platform</title>
  <style>
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #292524; margin: 0; background: #f7f3ea; }
    main { max-width: 920px; margin: 0 auto; background: #fff; min-height: 100vh; padding: 44px; }
    h1 { margin: 0 0 8px; font-size: 32px; }
    h2 { margin: 30px 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #78716c; }
    p, li { color: #57534e; line-height: 1.55; }
    .lead { font-size: 18px; color: #292524; max-width: 760px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .card { border: 1px solid #e7e0d3; border-radius: 12px; padding: 16px; background: #fbfaf7; }
    .flow { display: flex; flex-wrap: wrap; gap: 8px; }
    .step { border: 1px solid #d6d3d1; border-radius: 999px; padding: 8px 11px; background: white; font-size: 13px; color: #44403c; }
    .disclaimer { border: 1px solid #f3d8a7; background: #fffbeb; border-radius: 10px; padding: 14px; color: #854d0e; margin-top: 28px; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    button { border: 1px solid #d6d3d1; background: white; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    @media print { body { background: white; } main { padding: 0; } .toolbar { display: none; } }
  </style>
</head>
<body>
  <main>
    <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
    <h1>AI Parent Safety & Independence Platform</h1>
    <p class="lead">Identify aging-at-home risks, turn them into action plans, coordinate services, and track follow-up outcomes.</p>

    <h2>Who It Helps</h2>
    <div class="grid">
      <div class="card"><strong>Families</strong><p>Understand practical prevention steps and coordinate follow-through for a parent or senior loved one.</p></div>
      <div class="card"><strong>Care Coordinators</strong><p>Review high-risk households, service requests, evidence, and self-reported follow-up data.</p></div>
      <div class="card"><strong>Insurers & Aging Programs</strong><p>Run small prevention pilots with referral tracking, cohort reporting, and partner-ready documentation.</p></div>
      <div class="card"><strong>Home-Care & Contractor Partners</strong><p>Receive clearer context for home modification, caregiver visit, family check-in, and support requests.</p></div>
    </div>

    <h2>Pilot Workflow</h2>
    <div class="flow">
      ${["referral", "consent", "assessment", "prevention plan", "service request", "evidence", "follow-up", "cohort report"].map((step) => `<span class="step">${escapeHtml(step)}</span>`).join("")}
    </div>

    <h2>Key Metrics Tracked</h2>
    <ul>
      <li>Referral conversion from invitation to completed report.</li>
      <li>Risk distribution, top risk drivers, and memory-support flags.</li>
      <li>Action completion, immediate action completion, and evidence attachment.</li>
      <li>Service request generation, scheduling, completion, verification, and rating.</li>
      <li>30/60/90-day self-reported follow-up outcomes and family preparedness.</li>
    </ul>

    <h2>Suggested Pilot Design</h2>
    <ul>
      <li>Enroll 25-100 households through partner referral links.</li>
      <li>Capture explicit permission, privacy consent, and sharing preferences.</li>
      <li>Review high-risk households through a care coordinator workflow.</li>
      <li>Schedule 30/60/90-day follow-ups and track self-reported updates.</li>
      <li>Measure completed actions, service coordination, evidence, and family preparedness.</li>
    </ul>

    <h2>What It Does Not Do</h2>
    <ul>
      <li>It does not diagnose dementia, frailty, disease, or medical conditions.</li>
      <li>It does not replace clinicians, emergency response, professional judgment, or local services.</li>
      <li>It does not claim guaranteed prevention, clinical outcomes, or claim reduction.</li>
      <li>It is not medical advice.</li>
    </ul>

    <div class="disclaimer">This platform provides prevention support, family safety support, care coordination support, aging-at-home support, and pilot tracking. Reports and metrics should be interpreted as support documentation and self-reported pilot data, not medical decisions or guaranteed outcomes.</div>
  </main>
</body>
</html>`;

app.get("/api/admin/revenue-summary", requireAdmin, async (_req, res) => {
  try {
    const summary = await db.getRevenueSummary();
    return res.json(summary);
  } catch (error) {
    console.error("[REVENUE] summary_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to load revenue summary." });
  }
});

app.get("/api/admin/pilot-report.html", requireAdmin, async (_req, res) => {
  try {
    const summary = await db.getRevenueSummary();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderPilotReportHtml(summary));
  } catch (error) {
    console.error("[PILOT] report_failed", { error: String(error) });
    return res.status(500).send("Unable to generate pilot report.");
  }
});

app.get("/api/admin/partner-overview.html", requireAdmin, async (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(renderPartnerOverviewHtml());
});

app.patch("/api/admin/sessions/:id/assessment-review", requireAdmin, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  const reviewStatus = String(req.body.reviewStatus ?? "");
  const confidenceLevel = String(req.body.confidenceLevel ?? "medium");
  if (!VALID_REVIEW_STATUS.has(reviewStatus) || !VALID_REVIEW_CONFIDENCE.has(confidenceLevel)) {
    return res.status(400).json({ error: "Invalid assessment review payload." });
  }
  const flaggedIssues = Array.isArray(req.body.flaggedIssues)
    ? req.body.flaggedIssues.map((item: unknown) => String(item).slice(0, 400)).slice(0, 20)
    : undefined;
  const review = await db.updateAssessmentReview({
    sessionId: session.id,
    reviewStatus: reviewStatus as AssessmentReviewStatus,
    confidenceLevel: confidenceLevel as ReviewConfidenceLevel,
    reviewedBy: optionalString(req.body.reviewedBy, 120) ?? req.authUser?.email,
    reviewerNotes: req.body.reviewerNotes === null ? undefined : optionalString(req.body.reviewerNotes, 3000),
    flaggedIssues,
  });
  const report = await db.getReport(session.id, session.userId);
  if (report) {
    await db.saveReport({ ...report, assessmentReview: review }, session.userId);
  }
  return res.json({ review });
});

app.get("/api/admin/pilot-cohorts", requireAdmin, async (_req, res) => {
  try {
    return res.json(await db.getPilotCohortDashboard());
  } catch (error) {
    console.error("[PILOT] cohorts_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to load pilot cohorts." });
  }
});

app.get("/api/admin/demo-pilot", requireAdmin, async (_req, res) => {
  const [dashboard, referrals] = await Promise.all([
    db.getPilotCohortDashboard(),
    db.listPartnerReferrals(),
  ]);
  const card = dashboard.cohorts.find((item) => item.partner.name === "Demo Care Partner" && item.cohort.name === "Aging-at-Home Prevention Pilot");
  if (!card) return res.json({ demoAvailable: false });
  const referral = referrals.referrals.find((item) => item.cohortName === card.cohort.name && item.partnerName === card.partner.name);
  const highRisk = card.households.find((row) => row.riskLevel === "urgent" || row.riskLevel === "high" || row.riskLevel === "critical") ?? card.households[0];
  const completed = card.households.find((row) => row.serviceStatusSummary?.includes("completed") || row.pendingImmediateActions === 0) ?? card.households[card.households.length - 1];
  return res.json({
    demoAvailable: true,
    partnerName: card.partner.displayName || card.partner.name,
    cohortName: card.cohort.name,
    cohortId: card.cohort.id,
    cohortReportUrl: `/api/admin/pilot-cohorts/${card.cohort.id}/report.html`,
    referralUrl: referral?.referralUrl,
    highRiskReportUrl: highRisk?.reportUrl,
    completedImprovementReportUrl: completed?.reportUrl,
  });
});

app.get("/api/admin/follow-up-attention-queue", requireAdmin, async (_req, res) => {
  try {
    return res.json({ queue: await db.getFollowUpAttentionQueue() });
  } catch (error) {
    console.error("[PILOT] follow_up_queue_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to load follow-up attention queue." });
  }
});

app.get("/api/referrals/:code", async (req, res) => {
  const referral = await db.getPartnerReferralByCode(String(req.params.code));
  if (!referral || referral.status === "cancelled") return res.status(404).json({ error: "Referral not found." });
  if (referral.status === "created" || referral.status === "sent") {
    await db.updatePartnerReferralStatus(referral.id, "opened");
  }
  return res.json({ referral });
});

app.post("/api/referrals/:code/status", async (req, res) => {
  const status = String(req.body.status ?? "");
  if (!VALID_REFERRAL_STATUS.has(status)) return res.status(400).json({ error: "Invalid referral status." });
  const referral = await db.updatePartnerReferralStatus(String(req.params.code), status as PartnerReferralStatus);
  if (!referral) return res.status(404).json({ error: "Referral not found." });
  return res.json({ referral });
});

app.get("/api/admin/partner-referrals", requireAdmin, async (_req, res) => {
  return res.json(await db.listPartnerReferrals());
});

app.post("/api/admin/partner-referrals", requireAdmin, async (req, res) => {
  const partnerOrganizationId = optionalString(req.body.partnerOrganizationId, 120);
  const inviteType = String(req.body.inviteType ?? "general_link");
  if (!partnerOrganizationId || !VALID_REFERRAL_INVITE_TYPE.has(inviteType)) {
    return res.status(400).json({ error: "Invalid partner referral payload." });
  }
  const referral = await db.createPartnerReferral({
    partnerOrganizationId,
    pilotCohortId: optionalString(req.body.pilotCohortId, 120),
    inviteType: inviteType as PartnerReferralInviteType,
    recipientName: optionalString(req.body.recipientName, 160),
    recipientEmail: optionalString(req.body.recipientEmail, 180),
    recipientPhone: optionalString(req.body.recipientPhone, 80),
    seniorName: optionalString(req.body.seniorName, 160),
    sourceLabel: optionalString(req.body.sourceLabel, 160),
    notes: optionalString(req.body.notes, 3000),
  });
  return res.status(201).json({ referral, referralUrl: `/start/${referral.referralCode}` });
});

app.patch("/api/admin/partner-referrals/:id", requireAdmin, async (req, res) => {
  const status = String(req.body.status ?? "");
  if (!VALID_REFERRAL_STATUS.has(status)) return res.status(400).json({ error: "Invalid referral status." });
  const referral = await db.updatePartnerReferralStatus(String(req.params.id), status as PartnerReferralStatus);
  if (!referral) return res.status(404).json({ error: "Referral not found." });
  return res.json({ referral });
});

app.post("/api/admin/partner-organizations", requireAdmin, async (req, res) => {
  const organizationType = String(req.body.organizationType ?? "other");
  const name = optionalString(req.body.name, 180);
  if (!name || !VALID_PARTNER_ORG_TYPE.has(organizationType)) {
    return res.status(400).json({ error: "Invalid partner organization payload." });
  }
  const partner = await db.createPartnerOrganization({
    name,
    organizationType: organizationType as PartnerOrganizationType,
    displayName: optionalString(req.body.displayName, 180),
    logoUrl: optionalString(req.body.logoUrl, 2000),
    primaryContact: optionalString(req.body.primaryContact, 180),
    contactName: optionalString(req.body.contactName, 180),
    contactEmail: optionalString(req.body.contactEmail, 180),
    contactPhone: optionalString(req.body.contactPhone, 80),
    notes: optionalString(req.body.notes, 3000),
  });
  return res.status(201).json({ partner });
});

app.post("/api/admin/pilot-cohorts", requireAdmin, async (req, res) => {
  const status = String(req.body.status ?? "draft");
  const partnerOrganizationId = optionalString(req.body.partnerOrganizationId, 120);
  const name = optionalString(req.body.name, 180);
  if (!partnerOrganizationId || !name || !VALID_PILOT_COHORT_STATUS.has(status)) {
    return res.status(400).json({ error: "Invalid pilot cohort payload." });
  }
  const cohort = await db.createPilotCohort({
    partnerOrganizationId,
    name,
    status: status as PilotCohortStatus,
    description: optionalString(req.body.description, 2000),
    startDate: optionalString(req.body.startDate, 80),
    endDate: optionalString(req.body.endDate, 80),
    targetHouseholds: req.body.targetHouseholds === undefined ? undefined : Math.max(0, Number(req.body.targetHouseholds)),
    consentVersion: optionalString(req.body.consentVersion, 80),
    notes: optionalString(req.body.notes, 3000),
  });
  return res.status(201).json({ cohort });
});

app.patch("/api/admin/sessions/:id/pilot-cohort", requireAdmin, async (req, res) => {
  const pilotCohortId = req.body.pilotCohortId === null ? null : optionalString(req.body.pilotCohortId, 120);
  const session = await db.assignSessionToPilotCohort(String(req.params.id), pilotCohortId ?? null);
  if (!session) return res.status(404).json({ error: "Session not found." });
  return res.json({ session });
});

app.post("/api/admin/follow-up-check-ins", requireAdmin, async (req, res) => {
  const sessionId = optionalString(req.body.sessionId, 120);
  const checkInType = String(req.body.checkInType ?? "custom");
  const scheduledFor = optionalString(req.body.scheduledFor, 80);
  if (!sessionId || !scheduledFor || !VALID_FOLLOW_UP_TYPE.has(checkInType)) {
    return res.status(400).json({ error: "Invalid follow-up check-in payload." });
  }
  const followUp = await db.scheduleFollowUpCheckIn({
    sessionId,
    pilotCohortId: optionalString(req.body.pilotCohortId, 120),
    checkInType: checkInType as FollowUpCheckInType,
    scheduledFor,
    notes: optionalString(req.body.notes, 3000),
  });
  return res.status(201).json({ followUp });
});

app.patch("/api/admin/follow-up-check-ins/:id", requireAdmin, async (req, res) => {
  const status = req.body.status !== undefined ? String(req.body.status) : undefined;
  if (status !== undefined && !VALID_FOLLOW_UP_STATUS.has(status)) {
    return res.status(400).json({ error: "Invalid follow-up status." });
  }
  const followUp = await db.updateFollowUpCheckIn({
    id: String(req.params.id),
    status: status as FollowUpCheckInStatus | undefined,
    completedAt: req.body.completedAt === null ? null : req.body.completedAt !== undefined ? String(req.body.completedAt) : undefined,
    notes: req.body.notes === null ? null : req.body.notes !== undefined ? optionalString(req.body.notes, 3000) ?? null : undefined,
    newFallsReported: req.body.newFallsReported === null ? null : req.body.newFallsReported !== undefined ? Boolean(req.body.newFallsReported) : undefined,
    nearFallsReported: req.body.nearFallsReported === null ? null : req.body.nearFallsReported !== undefined ? Boolean(req.body.nearFallsReported) : undefined,
    newHospitalVisitReported: req.body.newHospitalVisitReported === null ? null : req.body.newHospitalVisitReported !== undefined ? Boolean(req.body.newHospitalVisitReported) : undefined,
    newCaregiverSupportAdded: req.body.newCaregiverSupportAdded === null ? null : req.body.newCaregiverSupportAdded !== undefined ? Boolean(req.body.newCaregiverSupportAdded) : undefined,
    majorHomeFixCompleted: req.body.majorHomeFixCompleted === null ? null : req.body.majorHomeFixCompleted !== undefined ? Boolean(req.body.majorHomeFixCompleted) : undefined,
    medicationRoutineImproved: req.body.medicationRoutineImproved === null ? null : req.body.medicationRoutineImproved !== undefined ? Boolean(req.body.medicationRoutineImproved) : undefined,
    parentFeelsSafer: req.body.parentFeelsSafer === null ? null : req.body.parentFeelsSafer !== undefined ? optionalString(req.body.parentFeelsSafer, 20) ?? null : undefined,
    familyFeelsMorePrepared: req.body.familyFeelsMorePrepared === null ? null : req.body.familyFeelsMorePrepared !== undefined ? optionalString(req.body.familyFeelsMorePrepared, 20) ?? null : undefined,
    currentBiggestConcern: req.body.currentBiggestConcern === null ? null : req.body.currentBiggestConcern !== undefined ? optionalString(req.body.currentBiggestConcern, 1000) ?? null : undefined,
    requestCareCoordinatorFollowup: req.body.requestCareCoordinatorFollowup !== undefined ? Boolean(req.body.requestCareCoordinatorFollowup) : undefined,
  });
  if (!followUp) return res.status(404).json({ error: "Follow-up check-in not found." });
  return res.json({ followUp });
});

app.get("/api/sessions/:id/follow-up-check-ins", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  return res.json({ followUps: await db.listFollowUpCheckInsForSession(session.id) });
});

app.post("/api/sessions/:id/follow-up-check-ins/:followUpId/submit", requireAuth, async (req, res) => {
  const session = await db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
  const existing = await db.getFollowUpCheckIn(req.params.followUpId);
  if (!existing || existing.sessionId !== session.id) return res.status(404).json({ error: "Follow-up check-in not found." });
  const parentFeelsSafer = String(req.body.parentFeelsSafer ?? "unsure");
  const familyFeelsMorePrepared = String(req.body.familyFeelsMorePrepared ?? "unsure");
  const allowedFeeling = new Set(["yes", "somewhat", "no", "unsure"]);
  const followUp = await db.updateFollowUpCheckIn({
    id: existing.id,
    status: "completed",
    completedAt: new Date().toISOString(),
    notes: optionalString(req.body.notes, 3000),
    newFallsReported: Boolean(req.body.anyNewFalls),
    nearFallsReported: req.body.anyNearFalls === undefined ? undefined : Boolean(req.body.anyNearFalls),
    newHospitalVisitReported: Boolean(req.body.anyHospitalVisit),
    majorHomeFixCompleted: Boolean(req.body.majorHomeFixCompleted),
    newCaregiverSupportAdded: Boolean(req.body.caregiverSupportAdded),
    medicationRoutineImproved: req.body.medicationRoutineImproved === undefined ? undefined : Boolean(req.body.medicationRoutineImproved),
    parentFeelsSafer: allowedFeeling.has(parentFeelsSafer) ? parentFeelsSafer : "unsure",
    familyFeelsMorePrepared: allowedFeeling.has(familyFeelsMorePrepared) ? familyFeelsMorePrepared : "unsure",
    currentBiggestConcern: optionalString(req.body.currentBiggestConcern, 1000),
    requestCareCoordinatorFollowup: Boolean(req.body.requestCareCoordinatorFollowup),
  });
  if (req.body.anyNewFalls || req.body.anyHospitalVisit || req.body.requestCareCoordinatorFollowup) {
    await db.updateAssessmentReview({
      sessionId: session.id,
      reviewStatus: "needs_followup",
      confidenceLevel: "medium",
      reviewerNotes: "Family follow-up reported a concern or requested care coordinator follow-up.",
    });
  }
  return res.json({ followUp });
});

app.get("/api/admin/pilot-cohorts/:id/report.html", requireAdmin, async (req, res) => {
  try {
    const dashboard = await db.getPilotCohortDashboard();
    const card = dashboard.cohorts.find((item) => item.cohort.id === req.params.id);
    if (!card) return res.status(404).send("Pilot cohort not found.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderCohortReportHtml(card));
  } catch (error) {
    console.error("[PILOT] cohort_report_failed", { error: String(error) });
    return res.status(500).send("Unable to generate cohort report.");
  }
});

app.get("/api/admin/contractor-leads.csv", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.listContractorLeadsForExport();
    const header = "name,email,phone,zipCode,preferredContact,notes,status,projectUrgency,estimatedBudget,internalNotes,createdAt,sessionId";
    const lines = rows.map((row) =>
      [
        toCsvCell(row.name),
        toCsvCell(row.email),
        toCsvCell(row.phone),
        toCsvCell(row.zipCode),
        toCsvCell(row.preferredContact),
        toCsvCell(row.notes),
        toCsvCell(row.status),
        toCsvCell(row.projectUrgency),
        toCsvCell(row.estimatedBudget),
        toCsvCell(row.internalNotes),
        toCsvCell(row.createdAt),
        toCsvCell(row.sessionId),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"contractor-leads.csv\"");
    return res.status(200).send(csv);
  } catch (error) {
    console.error("[REVENUE] lead_export_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to export leads." });
  }
});

app.delete("/api/admin/contractor-leads/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      return res.status(400).json({ error: "Lead id is required." });
    }
    const deleted = await db.deleteContractorLeadById(id);
    if (!deleted) {
      return res.status(404).json({ error: "Contractor lead not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("[REVENUE] lead_delete_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to delete contractor lead." });
  }
});

app.patch("/api/admin/contractor-leads/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    const rawStatus = req.body.status !== undefined ? String(req.body.status).trim() : undefined;
    const internalNotes = req.body.internalNotes !== undefined ? String(req.body.internalNotes) : undefined;
    if (!id) {
      return res.status(400).json({ error: "Lead id is required." });
    }
    if (rawStatus === undefined && internalNotes === undefined) {
      return res.status(400).json({ error: "No lead updates were provided." });
    }
    if (rawStatus !== undefined && !VALID_LEAD_STATUS.has(rawStatus)) {
      return res.status(400).json({ error: "Invalid lead status." });
    }
    const updated = await db.updateContractorLeadOpsById({
      id,
      status: rawStatus as "new" | "contacted" | "qualified" | "rejected" | "converted" | undefined,
      internalNotes,
    });
    if (!updated) {
      return res.status(404).json({ error: "Contractor lead not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("[REVENUE] lead_update_failed", { error: String(error) });
    return res.status(500).json({ error: "Unable to update contractor lead." });
  }
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
      await db.saveContractorLead({
        userId: req.authUser!.id,
        name,
        email,
        zipCode: zip,
        phone,
        preferredContact: "either",
        scopeText: scopeSummary,
      });
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

server.listen(PORT, () => {
  console.log(`[BOOT] HFE server starting mode=${NODE_ENV} port=${PORT} version=${APP_VERSION}`);
});

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
