/**
 * public.routes.test.ts
 *
 * Integration tests for public (no-auth required) routes:
 *   POST /api/affiliate-clicks
 *   POST /api/contractor-leads
 *   POST /api/beta-waitlist
 *   POST /api/analytics/events
 *   GET  /api/referrals/:code
 *   POST /api/referrals/:code/status
 */

import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ── Mock repository ─────────────────────────────────────────────────────────
jest.mock("../../data/repository", () => ({
  db: {
    getSession: jest.fn(),
    findRecentAffiliateClick: jest.fn(),
    saveAffiliateClick: jest.fn(),
    saveAnalyticsEvent: jest.fn(),
    findRecentContractorLeadByEmailZip: jest.fn(),
    saveContractorLead: jest.fn(),
    upsertBetaWaitlistSignup: jest.fn(),
    getPartnerReferralByCode: jest.fn(),
    updatePartnerReferralStatus: jest.fn(),
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
    if (!req.authUser || req.authUser.role !== "admin") {
      res.status(req.authUser ? 403 : 401).json({ error: "Admin access required." });
      return;
    }
    next();
  },
}));

// ── Mock SharedAuthRateLimiter ──────────────────────────────────────────────
jest.mock("../../auth/sharedAuthRateLimiter");

import { db } from "../../data/repository";
import { createPublicRouter } from "../../routes/public";
import { SharedAuthRateLimiter } from "../../auth/sharedAuthRateLimiter";

const mockedDb = db as jest.Mocked<typeof db>;

// ── Helpers ─────────────────────────────────────────────────────────────────
const makeEmailSender = () => ({
  sendLoginCode: jest.fn(),
  sendContractorLeadNotification: jest.fn(),
  sendBetaWaitlistConfirmation: jest.fn().mockResolvedValue(undefined),
});

const makeLimiter = (allowed = true) => {
  const mock = new (SharedAuthRateLimiter as jest.MockedClass<typeof SharedAuthRateLimiter>)(
    {} as any
  );
  mock.enforce = jest
    .fn()
    .mockResolvedValue({ allowed, retryAfterSec: allowed ? 0 : 60 });
  return mock;
};

const makeAuthService = (emailSender: ReturnType<typeof makeEmailSender>) => ({
  getEmailSender: jest.fn().mockReturnValue(emailSender),
});

const buildApp = (
  authUser?: { id: string; email: string; role: "user" | "admin" },
  limiterAllowed = true
) => {
  const emailSender = makeEmailSender();
  const limiter = makeLimiter(limiterAllowed);
  const authService = makeAuthService(emailSender);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  if (authUser) {
    app.use((req: express.Request, _res, next) => {
      req.authUser = authUser;
      next();
    });
  }
  app.use("/api", createPublicRouter(authService as any, limiter));
  return app;
};

const USER = { id: "user-1", email: "user@example.com", role: "user" as const };

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/affiliate-clicks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.findRecentAffiliateClick.mockResolvedValue(null);
    mockedDb.saveAffiliateClick.mockResolvedValue({ id: "click-1" } as any);
    mockedDb.saveAnalyticsEvent.mockResolvedValue({} as any);
  });

  const validPayload = {
    productName: "Grab Bar",
    category: "bathroom",
    affiliateUrl: "https://amazon.com/dp/ABC123",
  };

  it("returns 201 with id on success", async () => {
    const res = await request(buildApp()).post("/api/affiliate-clicks").send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe("click-1");
  });

  it("deduplicates recent clicks and returns 200", async () => {
    mockedDb.findRecentAffiliateClick.mockResolvedValue({ id: "existing-click" } as any);
    const res = await request(buildApp()).post("/api/affiliate-clicks").send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
  });

  it("returns 400 when productName is missing", async () => {
    const res = await request(buildApp())
      .post("/api/affiliate-clicks")
      .send({ category: "bathroom", affiliateUrl: "https://amazon.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when affiliateUrl is not http(s)", async () => {
    const res = await request(buildApp())
      .post("/api/affiliate-clicks")
      .send({ ...validPayload, affiliateUrl: "ftp://badurl.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when category is missing", async () => {
    const res = await request(buildApp())
      .post("/api/affiliate-clicks")
      .send({ productName: "Grab Bar", affiliateUrl: "https://amazon.com" });
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/contractor-leads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.findRecentContractorLeadByEmailZip.mockResolvedValue(null);
    mockedDb.saveContractorLead.mockResolvedValue({ id: "lead-1" } as any);
    mockedDb.saveAnalyticsEvent.mockResolvedValue({} as any);
  });

  const validPayload = {
    name: "Jane Doe",
    email: "jane@example.com",
    zipCode: "78701",
    preferredContact: "email",
    scopeText: "Install grab bars in bathroom",
  };

  it("returns 201 with id on success", async () => {
    const res = await request(buildApp()).post("/api/contractor-leads").send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe("lead-1");
  });

  it("deduplicates recent leads and returns 200", async () => {
    mockedDb.findRecentContractorLeadByEmailZip.mockResolvedValue({ id: "old-lead" } as any);
    const res = await request(buildApp()).post("/api/contractor-leads").send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
  });

  it("returns 400 when name is missing", async () => {
    const { name: _name, ...rest } = validPayload;
    const res = await request(buildApp()).post("/api/contractor-leads").send(rest);
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await request(buildApp())
      .post("/api/contractor-leads")
      .send({ ...validPayload, email: "notanemail" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when zipCode is invalid", async () => {
    const res = await request(buildApp())
      .post("/api/contractor-leads")
      .send({ ...validPayload, zipCode: "ABCDE" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when preferredContact is invalid", async () => {
    const res = await request(buildApp())
      .post("/api/contractor-leads")
      .send({ ...validPayload, preferredContact: "smoke_signal" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when scopeText is missing", async () => {
    const { scopeText: _scope, ...rest } = validPayload;
    const res = await request(buildApp()).post("/api/contractor-leads").send(rest);
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/beta-waitlist", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPayload = { email: "newuser@example.com", name: "New User", zipCode: "94102" };

  it("returns 201 when new signup succeeds", async () => {
    mockedDb.upsertBetaWaitlistSignup.mockResolvedValue({ id: "w-1", created: true } as any);
    mockedDb.saveAnalyticsEvent.mockResolvedValue({} as any);
    const res = await request(buildApp()).post("/api/beta-waitlist").send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyJoined).toBe(false);
  });

  it("returns 200 when email already on waitlist (upsert, not created)", async () => {
    mockedDb.upsertBetaWaitlistSignup.mockResolvedValue({ id: "w-1", created: false } as any);
    mockedDb.saveAnalyticsEvent.mockResolvedValue({} as any);
    const res = await request(buildApp()).post("/api/beta-waitlist").send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.alreadyJoined).toBe(true);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await request(buildApp())
      .post("/api/beta-waitlist")
      .send({ email: "bad-email", zipCode: "94102" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when zipCode is invalid format", async () => {
    const res = await request(buildApp())
      .post("/api/beta-waitlist")
      .send({ email: "ok@example.com", zipCode: "ABC" });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockedDb.upsertBetaWaitlistSignup.mockResolvedValue({ id: "w-1", created: true } as any);
    const res = await request(buildApp(undefined, false))
      .post("/api/beta-waitlist")
      .send(validPayload);
    expect(res.status).toBe(429);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/analytics/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.saveAnalyticsEvent.mockResolvedValue({} as any);
  });

  it("returns 201 for valid eventName", async () => {
    const res = await request(buildApp())
      .post("/api/analytics/events")
      .send({ eventName: "report_viewed" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 for unknown eventName", async () => {
    const res = await request(buildApp())
      .post("/api/analytics/events")
      .send({ eventName: "unknown_made_up_event" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when sessionId is provided without auth", async () => {
    const res = await request(buildApp())
      .post("/api/analytics/events")
      .send({ eventName: "report_viewed", sessionId: "sess-1" });
    expect(res.status).toBe(401);
  });

  it("returns 201 when sessionId is provided with auth and session belongs to user", async () => {
    mockedDb.getSession.mockResolvedValue({ id: "sess-1", userId: "user-1" } as any);
    const res = await request(buildApp(USER))
      .post("/api/analytics/events")
      .send({ eventName: "report_viewed", sessionId: "sess-1" });
    expect(res.status).toBe(201);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/referrals/:code", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns referral and updates status to opened for sent referral", async () => {
    const referral = {
      id: "ref-1",
      status: "sent",
      referralCode: "ABC123",
    };
    mockedDb.getPartnerReferralByCode.mockResolvedValue(referral as any);
    mockedDb.updatePartnerReferralStatus.mockResolvedValue({ ...referral, status: "opened" } as any);
    const res = await request(buildApp()).get("/api/referrals/ABC123");
    expect(res.status).toBe(200);
    expect(res.body.referral).toBeDefined();
    expect(mockedDb.updatePartnerReferralStatus).toHaveBeenCalledWith("ref-1", "opened");
  });

  it("returns 404 when referral not found", async () => {
    mockedDb.getPartnerReferralByCode.mockResolvedValue(undefined as any);
    const res = await request(buildApp()).get("/api/referrals/NOTFOUND");
    expect(res.status).toBe(404);
  });

  it("returns 404 when referral is cancelled", async () => {
    mockedDb.getPartnerReferralByCode.mockResolvedValue({
      id: "ref-1",
      status: "cancelled",
      referralCode: "ABC123",
    } as any);
    const res = await request(buildApp()).get("/api/referrals/ABC123");
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/referrals/:code/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns updated referral on valid status", async () => {
    const referral = { id: "ref-1", status: "assessment_completed", referralCode: "ABC123" };
    mockedDb.updatePartnerReferralStatus.mockResolvedValue(referral as any);
    const res = await request(buildApp())
      .post("/api/referrals/ABC123/status")
      .send({ status: "assessment_completed" });
    expect(res.status).toBe(200);
    expect(res.body.referral).toBeDefined();
  });

  it("returns 400 on invalid status", async () => {
    const res = await request(buildApp())
      .post("/api/referrals/ABC123/status")
      .send({ status: "FAKE_STATUS" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when referral not found", async () => {
    mockedDb.updatePartnerReferralStatus.mockResolvedValue(undefined as any);
    const res = await request(buildApp())
      .post("/api/referrals/NOTFOUND/status")
      .send({ status: "opened" });
    expect(res.status).toBe(404);
  });
});
