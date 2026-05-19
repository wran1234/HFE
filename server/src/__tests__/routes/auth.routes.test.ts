/**
 * auth.routes.test.ts
 *
 * Integration tests for /api/auth/* routes.
 * Mocks db, AuthService, and SharedAuthRateLimiter so no real DB or network calls.
 */

import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ── Mock the repository BEFORE importing anything that uses it ─────────────
jest.mock("../../data/repository", () => ({
  db: {
    deleteSessionToken: jest.fn(),
    findUserBySessionToken: jest.fn(),
  },
}));

// ── Mock authMiddleware to expose helpers we can drive ─────────────────────
jest.mock("../../auth/authMiddleware", () => {
  const AUTH_COOKIE_NAME = "hfe_session";
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
  return { AUTH_COOKIE_NAME, requireAuth, requireAdmin };
});

// ── Mock sharedAuthRateLimiter ─────────────────────────────────────────────
jest.mock("../../auth/sharedAuthRateLimiter");
jest.mock("../../auth/authCleanup");

import { db } from "../../data/repository";
import { createAuthRouter } from "../../routes/auth";
import { SharedAuthRateLimiter } from "../../auth/sharedAuthRateLimiter";

const mockedDb = db as jest.Mocked<typeof db>;

// ── Helpers ────────────────────────────────────────────────────────────────

const makeAuthService = () => ({
  register: jest.fn(),
  requestLogin: jest.fn(),
  verifyLogin: jest.fn(),
  getEmailSender: jest.fn().mockReturnValue({
    sendLoginCode: jest.fn(),
    sendContractorLeadNotification: jest.fn(),
    sendBetaWaitlistConfirmation: jest.fn(),
  }),
});

const makeLimiter = (allowed = true) => {
  const mock = new (SharedAuthRateLimiter as jest.MockedClass<
    typeof SharedAuthRateLimiter
  >)({} as any);
  mock.enforce = jest
    .fn()
    .mockResolvedValue({ allowed, retryAfterSec: allowed ? 0 : 60 });
  return mock;
};

const buildApp = (authService: ReturnType<typeof makeAuthService>, limiter: SharedAuthRateLimiter) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Attach authUser from cookie for /me and /logout tests
  app.use((req: express.Request, _res, next) => {
    const cookie = req.cookies?.["hfe_session"];
    if (cookie === "valid-token") {
      req.authUser = { id: "user-1", email: "user@example.com", role: "user" };
    }
    next();
  });
  app.use("/api/auth", createAuthRouter(authService as any, limiter));
  return app;
};

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/register", () => {
  let authService: ReturnType<typeof makeAuthService>;
  let limiter: SharedAuthRateLimiter;
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = makeAuthService();
    limiter = makeLimiter(true);
    app = buildApp(authService, limiter);
  });

  it("returns 201 on success", async () => {
    authService.register.mockResolvedValue(undefined);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("returns 201 even when user already exists (idempotent)", async () => {
    authService.register.mockResolvedValue(undefined);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "existing@example.com" });
    expect(res.status).toBe(201);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("returns 400 when email is invalid (no @)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "notanemail" });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    limiter = makeLimiter(false);
    app = buildApp(authService, limiter);
    authService.register.mockResolvedValue(undefined);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/request-login", () => {
  let authService: ReturnType<typeof makeAuthService>;
  let limiter: SharedAuthRateLimiter;
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = makeAuthService();
    limiter = makeLimiter(true);
    app = buildApp(authService, limiter);
  });

  it("returns 200 with ok:true on success", async () => {
    authService.requestLogin.mockResolvedValue(undefined);
    const res = await request(app)
      .post("/api/auth/request-login")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app).post("/api/auth/request-login").send({});
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    limiter = makeLimiter(false);
    app = buildApp(authService, limiter);
    const res = await request(app)
      .post("/api/auth/request-login")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(429);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/verify", () => {
  let authService: ReturnType<typeof makeAuthService>;
  let limiter: SharedAuthRateLimiter;
  let app: express.Express;

  const mockVerifiedResult = {
    token: "tok123",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: "u1", email: "user@example.com", role: "user" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authService = makeAuthService();
    limiter = makeLimiter(true);
    app = buildApp(authService, limiter);
  });

  it("returns 200 and sets a cookie on success", async () => {
    authService.verifyLogin.mockResolvedValue(mockVerifiedResult);
    const res = await request(app)
      .post("/api/auth/verify")
      .send({ email: "user@example.com", code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("user@example.com");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 400 on invalid code", async () => {
    authService.verifyLogin.mockRejectedValue(new Error("Invalid or expired code."));
    const res = await request(app)
      .post("/api/auth/verify")
      .send({ email: "user@example.com", code: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it("returns 400 when email or code is missing", async () => {
    const res = await request(app)
      .post("/api/auth/verify")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    limiter = makeLimiter(false);
    app = buildApp(authService, limiter);
    const res = await request(app)
      .post("/api/auth/verify")
      .send({ email: "user@example.com", code: "123456" });
    expect(res.status).toBe(429);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/auth/me", () => {
  let authService: ReturnType<typeof makeAuthService>;
  let limiter: SharedAuthRateLimiter;
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = makeAuthService();
    limiter = makeLimiter(true);
    app = buildApp(authService, limiter);
  });

  it("returns user when session cookie is valid", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "hfe_session=valid-token");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("user@example.com");
  });

  it("returns 401 without cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.user).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/logout", () => {
  let authService: ReturnType<typeof makeAuthService>;
  let limiter: SharedAuthRateLimiter;
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = makeAuthService();
    limiter = makeLimiter(true);
    app = buildApp(authService, limiter);
  });

  it("returns ok:true and clears the cookie", async () => {
    mockedDb.deleteSessionToken.mockResolvedValue(undefined as any);
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", "hfe_session=valid-token");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // The Set-Cookie header should contain the cleared cookie (max-age=0 or Expires in past)
    const rawCookieHeader: unknown = res.headers["set-cookie"];
    const setCookieHeader: string[] = Array.isArray(rawCookieHeader)
      ? (rawCookieHeader as string[])
      : rawCookieHeader
      ? [String(rawCookieHeader)]
      : [];
    const hasCleared = setCookieHeader.some(
      (header) =>
        header.includes("hfe_session") &&
        (header.includes("Expires=Thu, 01 Jan 1970") || header.includes("Max-Age=0"))
    );
    expect(hasCleared).toBe(true);
  });

  it("returns ok:true even without a cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
