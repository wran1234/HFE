/**
 * sessions.routes.test.ts
 *
 * Integration tests for /api/sessions/* routes.
 * Mocks db and authMiddleware — no real DB.
 */

import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ── Mock the repository BEFORE importing routes ────────────────────────────
jest.mock("../../data/repository", () => ({
  db: {
    listSessionsForUser: jest.fn(),
    ensureHomeForUser: jest.fn(),
    createSession: jest.fn(),
    getOrCreateRoomScan: jest.fn(),
    upsertSeniorProfile: jest.fn(),
    getSeniorProfile: jest.fn(),
    getSession: jest.fn(),
    listRoomScans: jest.fn(),
    listObservations: jest.fn(),
    updateSessionContext: jest.fn(),
    createObservation: jest.fn(),
    saveRoomScan: jest.fn(),
    getReport: jest.fn(),
    saveReport: jest.fn(),
    updateSession: jest.fn(),
    updatePartnerReferralStatus: jest.fn(),
    getAssessmentReview: jest.fn(),
    buildCareNoteSummary: jest.fn(),
    getEvidenceCountsByRecommendation: jest.fn(),
    listServiceRequests: jest.fn(),
    listFollowUpCheckInsForSession: jest.fn(),
    listCareNotes: jest.fn(),
    addCareNote: jest.fn(),
    listRecommendationEvidence: jest.fn(),
    addRecommendationEvidence: jest.fn(),
    createServiceRequest: jest.fn(),
    updateRecommendationActionStatus: jest.fn(),
    listContractorSuggestions: jest.fn(),
    saveContractorSuggestions: jest.fn(),
    getFollowUpCheckIn: jest.fn(),
    updateFollowUpCheckIn: jest.fn(),
    updateAssessmentReview: jest.fn(),
    assignSessionToPilotCohort: jest.fn(),
    scheduleFollowUpCheckIn: jest.fn(),
  },
}));

// ── Mock heavy external deps so router factory doesn't blow up ─────────────
jest.mock("../../assessment/assessmentEngine", () => ({
  runAssessmentEngine: jest.fn().mockResolvedValue({
    overallRiskLevel: "medium",
    recommendations: [],
    roomBreakdowns: [],
  }),
}));

jest.mock("../../assessment/photoHazardVision", () => ({
  analyzePhotoForHazards: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../assessment/serviceRequestEngine", () => ({
  generateServiceRequestSuggestions: jest.fn().mockReturnValue([]),
}));

jest.mock("../../contractors/contractorSearch", () => ({
  searchContractorsNearZip: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../reporting/reportBuilder", () => ({
  buildReportPayload: jest.fn().mockReturnValue({
    sessionId: "sess-1",
    roomBreakdown: [],
    evidenceImages: [],
    recommendations: [],
    independencePlan: [],
    familyDashboard: null,
    seniorProfile: null,
    independenceRiskScore: null,
    assessmentReview: null,
    consent: null,
  }),
  persistReportPayload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../domain/independenceRisk", () => ({
  buildExportablePreventionSummary: jest.fn().mockReturnValue({
    generatedAt: new Date().toISOString(),
    seniorProfileSummary: "Test profile",
    risks: {},
    topRiskDrivers: [],
    topRecommendedActions: [],
    completedActionCount: 0,
    pendingActionCount: 0,
    careNotesSummary: { whatChanged: [], whatNeedsAttention: [], nextRecommendedAction: "" },
    contractorHomeModificationNeeds: [],
    caregiverProfessionalSupportNeeds: [],
    recommendedServiceCategories: [],
    activeServiceRequests: [],
    scheduledOrCompletedServiceRequests: [],
    nonMedicalDisclaimer: "",
    consentPrivacyNote: "",
  }),
  estimatePreventionImpact: jest.fn().mockReturnValue("low"),
}));

// ── authMiddleware mock with controllable authUser injection ───────────────
jest.mock("../../auth/authMiddleware", () => {
  const requireAuth = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    next();
  };
  const requireAdmin = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (req.authUser.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    next();
  };
  return { AUTH_COOKIE_NAME: "hfe_session", requireAuth, requireAdmin };
});

import { db } from "../../data/repository";
import { createSessionsRouter } from "../../routes/sessions";

const mockedDb = db as jest.Mocked<typeof db>;

// ── Storage stub ───────────────────────────────────────────────────────────
const mockStorage = {
  providerName: "local",
  saveEvidence: jest.fn().mockResolvedValue({ storageKey: "k", publicUrl: "u" }),
  resolveEvidenceUrl: jest.fn().mockResolvedValue("https://example.com/img.jpg"),
};

// ── Build app with injected authUser ───────────────────────────────────────
const buildApp = (authUser?: { id: string; email: string; role: "user" | "admin" }) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: express.Request, _res, next) => {
    if (authUser) req.authUser = authUser;
    next();
  });
  app.use(
    "/api/sessions",
    createSessionsRouter(mockStorage as any, "fake-key", "gemini-model", "places-key")
  );
  return app;
};

const USER = { id: "user-1", email: "user@example.com", role: "user" as const };
const OTHER_USER = { id: "user-2", email: "other@example.com", role: "user" as const };

const mockSession = {
  id: "sess-1",
  userId: "user-1",
  homeId: "home-1",
  status: "active",
  residentAge: 72,
  mobilityAid: "none",
  fallHistory: 0,
  nightBathroomTrips: false,
  startedAt: new Date().toISOString(),
  endedAt: null,
  overallRiskLevel: null,
  consentAccepted: true,
  recordingPermissionConfirmed: true,
  shareWithCareCoordinator: false,
  shareWithContractor: false,
  shareWithInsurer: false,
};

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/sessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.ensureHomeForUser.mockResolvedValue({ id: "home-1" } as any);
    mockedDb.createSession.mockResolvedValue({ ...mockSession, id: "sess-new" } as any);
    mockedDb.getOrCreateRoomScan.mockResolvedValue({ id: "room-1" } as any);
    mockedDb.upsertSeniorProfile.mockResolvedValue({} as any);
  });

  it("returns 201 with session for authenticated user", async () => {
    const res = await request(buildApp(USER))
      .post("/api/sessions")
      .send({ city: "Austin" });
    expect(res.status).toBe(201);
    expect(res.body.session).toBeDefined();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/sessions")
      .send({ city: "Austin" });
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/sessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.listSessionsForUser.mockResolvedValue({
      sessions: [mockSession],
      nextCursor: undefined,
    } as any);
  });

  it("returns sessions for authenticated user", async () => {
    const res = await request(buildApp(USER)).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/sessions");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/sessions/:id/report", () => {
  const mockReport = {
    sessionId: "sess-1",
    roomBreakdown: [],
    evidenceImages: [],
    recommendations: [],
    independencePlan: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with report for owner", async () => {
    mockedDb.getReport.mockResolvedValue(mockReport as any);
    const res = await request(buildApp(USER)).get("/api/sessions/sess-1/report");
    expect(res.status).toBe(200);
    expect(res.body.report).toBeDefined();
  });

  it("returns 404 when report does not exist", async () => {
    mockedDb.getReport.mockResolvedValue(undefined as any);
    const res = await request(buildApp(USER)).get("/api/sessions/missing/report");
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/sessions/sess-1/report");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/sessions/:id (single session)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.getSeniorProfile.mockResolvedValue(undefined as any);
    mockedDb.listRoomScans.mockResolvedValue([]);
    mockedDb.listObservations.mockResolvedValue([]);
  });

  it("returns 200 with session for owner", async () => {
    mockedDb.getSession.mockResolvedValue(mockSession as any);
    const res = await request(buildApp(USER)).get("/api/sessions/sess-1");
    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
  });

  it("returns 404 when session does not exist", async () => {
    mockedDb.getSession.mockResolvedValue(undefined as any);
    const res = await request(buildApp(USER)).get("/api/sessions/missing");
    expect(res.status).toBe(404);
  });

  it("returns 403 when session belongs to another user", async () => {
    mockedDb.getSession.mockResolvedValue({ ...mockSession, userId: "user-2" } as any);
    const res = await request(buildApp(USER)).get("/api/sessions/sess-1");
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/sessions/:id/finalize", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.listRoomScans.mockResolvedValue([
      {
        id: "r1",
        coverageStatus: "covered",
        capturedViews: ["wide_view"],
        requiredViews: ["wide_view"],
      },
    ] as any);
    mockedDb.updateSession.mockResolvedValue(mockSession as any);
    mockedDb.getSeniorProfile.mockResolvedValue(undefined as any);
    mockedDb.getAssessmentReview.mockResolvedValue(undefined as any);
    mockedDb.getEvidenceCountsByRecommendation.mockResolvedValue({});
    mockedDb.listServiceRequests.mockResolvedValue([]);
    mockedDb.listFollowUpCheckInsForSession.mockResolvedValue([]);
  });

  it("returns 409 CONSENT_REQUIRED when consent not accepted", async () => {
    mockedDb.getSession.mockResolvedValue({
      ...mockSession,
      consentAccepted: false,
      recordingPermissionConfirmed: false,
    } as any);
    const res = await request(buildApp(USER))
      .post("/api/sessions/sess-1/finalize")
      .send({ allowIncomplete: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONSENT_REQUIRED");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/sessions/sess-1/finalize")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 404 when session not found", async () => {
    mockedDb.getSession.mockResolvedValue(undefined as any);
    const res = await request(buildApp(USER))
      .post("/api/sessions/missing/finalize")
      .send({ allowIncomplete: true });
    expect(res.status).toBe(404);
  });

  it("returns 403 when session belongs to another user", async () => {
    mockedDb.getSession.mockResolvedValue({ ...mockSession, userId: "user-2" } as any);
    const res = await request(buildApp(USER))
      .post("/api/sessions/sess-1/finalize")
      .send({ allowIncomplete: true });
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/sessions/:id/recommendations/:recId/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 ok:true on valid status update", async () => {
    mockedDb.getSession.mockResolvedValue(mockSession as any);
    mockedDb.updateRecommendationActionStatus.mockResolvedValue({ id: "rec-1" } as any);
    mockedDb.getReport.mockResolvedValue({
      sessionId: "sess-1",
      roomBreakdown: [],
      evidenceImages: [],
      recommendations: [],
      independencePlan: [
        {
          id: "rec-1",
          status: "pending",
          owner: "family",
          priority: "this_month",
          title: "Fix rug",
          section: "bedroom",
          recommendedAction: "Remove rug",
        },
      ],
      familyDashboard: null,
    } as any);
    mockedDb.saveReport.mockResolvedValue({} as any);

    const res = await request(buildApp(USER))
      .patch("/api/sessions/sess-1/recommendations/rec-1/status")
      .send({ actionStatus: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 on invalid actionStatus", async () => {
    mockedDb.getSession.mockResolvedValue(mockSession as any);
    const res = await request(buildApp(USER))
      .patch("/api/sessions/sess-1/recommendations/rec-1/status")
      .send({ actionStatus: "INVALID_STATUS" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .patch("/api/sessions/sess-1/recommendations/rec-1/status")
      .send({ actionStatus: "completed" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session belongs to another user", async () => {
    mockedDb.getSession.mockResolvedValue({ ...mockSession, userId: "user-2" } as any);
    const res = await request(buildApp(USER))
      .patch("/api/sessions/sess-1/recommendations/rec-1/status")
      .send({ actionStatus: "completed" });
    expect(res.status).toBe(403);
  });
});
