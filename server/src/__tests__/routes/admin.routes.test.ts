/**
 * admin.routes.test.ts
 *
 * Integration tests for /api/admin/* routes.
 * Mocks db and authMiddleware — no real DB.
 */

import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ── Mock repository BEFORE importing routes ────────────────────────────────
jest.mock("../../data/repository", () => ({
  db: {
    getRevenueSummary: jest.fn(),
    getPilotCohortDashboard: jest.fn(),
    createPartnerOrganization: jest.fn(),
    createPartnerReferral: jest.fn(),
    listPartnerReferrals: jest.fn(),
    updatePartnerReferralStatus: jest.fn(),
    createPilotCohort: jest.fn(),
    getSession: jest.fn(),
    updateAssessmentReview: jest.fn(),
    getReport: jest.fn(),
    saveReport: jest.fn(),
    assignSessionToPilotCohort: jest.fn(),
    scheduleFollowUpCheckIn: jest.fn(),
    updateFollowUpCheckIn: jest.fn(),
    getFollowUpAttentionQueue: jest.fn(),
    listContractorLeadsForExport: jest.fn(),
    deleteContractorLeadById: jest.fn(),
    updateContractorLeadOpsById: jest.fn(),
  },
}));

// ── Mock authMiddleware ─────────────────────────────────────────────────────
jest.mock("../../auth/authMiddleware", () => ({
  AUTH_COOKIE_NAME: "hfe_session",
  requireAuth: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    next();
  },
  requireAdmin: (
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
  },
}));

import { db } from "../../data/repository";
import { createAdminRouter } from "../../routes/admin";

const mockedDb = db as jest.Mocked<typeof db>;

// ── Build app with optional injected authUser ──────────────────────────────
const buildApp = (authUser?: { id: string; email: string; role: "user" | "admin" }) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  if (authUser) {
    app.use((req: express.Request, _res, next) => {
      req.authUser = authUser;
      next();
    });
  }
  app.use("/api/admin", createAdminRouter());
  return app;
};

const ADMIN = { id: "admin-1", email: "admin@example.com", role: "admin" as const };
const USER = { id: "user-1", email: "user@example.com", role: "user" as const };

const mockRevenueSummary = {
  affiliateClicks: { total: 0, byCategory: [] },
  contractorLeads: { total: 0, byStatus: [] },
  betaWaitlist: { total: 0 },
  analytics: { totalEvents: 0 },
  parentSafety: {
    pilotMetrics: {
      totalAssessments: 5,
      highUrgentRiskPercentage: 20,
      averageRecommendationsPerAssessment: 3,
      actionCompletionRate: 60,
      immediateActionCompletionRate: 40,
      evidenceAttachmentRate: 30,
      serviceRequestGenerationRate: 50,
      serviceRequestCompletionRate: 25,
      verifiedCompletionRate: 20,
      careNoteUsageRate: 15,
      memorySupportFlaggedPercentage: 10,
      contractorLeadConversionRate: 5,
      mostCommonHazardCategories: [],
      providerCompletedCounts: [],
      providerFollowupNeededCount: 0,
      averageServiceRating: null,
    },
    serviceRequests: { total: 0, open: 0, completed: 0 },
    careCoordinationRows: [],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/revenue-summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with summary for admin user", async () => {
    mockedDb.getRevenueSummary.mockResolvedValue(mockRevenueSummary as any);
    const res = await request(buildApp(ADMIN)).get("/api/admin/revenue-summary");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("returns 403 for regular user", async () => {
    const res = await request(buildApp(USER)).get("/api/admin/revenue-summary");
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/admin/revenue-summary");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/pilot-cohorts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with cohorts for admin", async () => {
    mockedDb.getPilotCohortDashboard.mockResolvedValue({ cohorts: [] } as any);
    const res = await request(buildApp(ADMIN)).get("/api/admin/pilot-cohorts");
    expect(res.status).toBe(200);
  });

  it("returns 403 for regular user", async () => {
    const res = await request(buildApp(USER)).get("/api/admin/pilot-cohorts");
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/admin/pilot-cohorts");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/partner-organizations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPayload = {
    name: "ABC Home Care",
    organizationType: "home_care_agency",
    displayName: "ABC Home Care LLC",
  };

  it("returns 201 with partner for admin", async () => {
    mockedDb.createPartnerOrganization.mockResolvedValue({
      id: "org-1",
      name: "ABC Home Care",
      organizationType: "home_care_agency",
    } as any);
    const res = await request(buildApp(ADMIN))
      .post("/api/admin/partner-organizations")
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.partner).toBeDefined();
    expect(res.body.partner.id).toBe("org-1");
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(buildApp(ADMIN))
      .post("/api/admin/partner-organizations")
      .send({ organizationType: "home_care_agency" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when organizationType is invalid", async () => {
    const res = await request(buildApp(ADMIN))
      .post("/api/admin/partner-organizations")
      .send({ name: "ABC", organizationType: "INVALID_TYPE" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for regular user", async () => {
    const res = await request(buildApp(USER))
      .post("/api/admin/partner-organizations")
      .send(validPayload);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/admin/partner-organizations")
      .send(validPayload);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/partner-referrals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPayload = {
    partnerOrganizationId: "org-1",
    inviteType: "general_link",
  };

  it("returns 201 with referral and url for admin", async () => {
    mockedDb.createPartnerReferral.mockResolvedValue({
      id: "ref-1",
      referralCode: "ABCXYZ",
      partnerOrganizationId: "org-1",
      inviteType: "general_link",
    } as any);
    const res = await request(buildApp(ADMIN))
      .post("/api/admin/partner-referrals")
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.referral).toBeDefined();
    expect(res.body.referralUrl).toContain("ABCXYZ");
  });

  it("returns 400 when partnerOrganizationId is missing", async () => {
    const res = await request(buildApp(ADMIN))
      .post("/api/admin/partner-referrals")
      .send({ inviteType: "general_link" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when inviteType is invalid", async () => {
    const res = await request(buildApp(ADMIN))
      .post("/api/admin/partner-referrals")
      .send({ partnerOrganizationId: "org-1", inviteType: "INVALID_TYPE" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for regular user", async () => {
    const res = await request(buildApp(USER))
      .post("/api/admin/partner-referrals")
      .send(validPayload);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/admin/partner-referrals")
      .send(validPayload);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/admin/sessions/:id/assessment-review", () => {
  const mockSession = { id: "sess-1", userId: "user-1" };
  const mockReview = {
    id: "rev-1",
    sessionId: "sess-1",
    reviewStatus: "reviewed",
    confidenceLevel: "high",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.getSession.mockResolvedValue(mockSession as any);
    mockedDb.updateAssessmentReview.mockResolvedValue(mockReview as any);
    mockedDb.getReport.mockResolvedValue(undefined as any);
  });

  it("returns 200 with review for admin", async () => {
    const res = await request(buildApp(ADMIN))
      .patch("/api/admin/sessions/sess-1/assessment-review")
      .send({ reviewStatus: "reviewed", confidenceLevel: "high" });
    expect(res.status).toBe(200);
    expect(res.body.review).toBeDefined();
  });

  it("returns 400 when reviewStatus is invalid", async () => {
    const res = await request(buildApp(ADMIN))
      .patch("/api/admin/sessions/sess-1/assessment-review")
      .send({ reviewStatus: "BOGUS", confidenceLevel: "high" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when session is not found", async () => {
    mockedDb.getSession.mockResolvedValue(undefined as any);
    const res = await request(buildApp(ADMIN))
      .patch("/api/admin/sessions/missing/assessment-review")
      .send({ reviewStatus: "reviewed", confidenceLevel: "high" });
    expect(res.status).toBe(404);
  });

  it("returns 403 for regular user", async () => {
    const res = await request(buildApp(USER))
      .patch("/api/admin/sessions/sess-1/assessment-review")
      .send({ reviewStatus: "reviewed", confidenceLevel: "high" });
    expect(res.status).toBe(403);
  });
});
