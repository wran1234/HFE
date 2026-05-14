import crypto from "crypto";
import express from "express";
import { AuthService } from "../auth/authService";
import { AUTH_COOKIE_NAME, requireAuth } from "../auth/authMiddleware";
import { clientIpFromRequest } from "../auth/rateLimit";
import { SharedAuthRateLimiter } from "../auth/sharedAuthRateLimiter";
import { runAuthCleanup } from "../auth/authCleanup";
import { db } from "../data/repository";

const IS_PROD = process.env.NODE_ENV === "production";
const AUTH_TOKEN_RETENTION_HOURS = Number(process.env.AUTH_TOKEN_RETENTION_HOURS || 48);
const AUTH_MAINTENANCE_KEY = process.env.AUTH_MAINTENANCE_KEY || "";

/**
 * /api/auth/* routes: register, request-login, verify, me, logout
 */
export function createAuthRouter(
  authService: AuthService,
  sharedAuthLimiter: SharedAuthRateLimiter,
) {
  const router = express.Router();

  const applyAuthRateLimit = async (
    req: express.Request,
    res: express.Response,
    email: string | undefined,
    strictOnProviderError: boolean,
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

  router.post("/register", async (req, res) => {
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

  router.post("/request-login", async (req, res) => {
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

  router.post("/verify", async (req, res) => {
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

  router.get("/me", async (req, res) => {
    if (!req.authUser) return res.status(401).json({ user: null });
    return res.json({ user: req.authUser });
  });

  router.post("/logout", async (req, res) => {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (token) await db.deleteSessionToken(token);
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    console.info("[AUTH] logout");
    return res.json({ ok: true });
  });

  return router;
}

/**
 * /api/maintenance/* routes: auth-cleanup
 */
export function createMaintenanceRouter() {
  const router = express.Router();

  const runCleanupWithLogs = async () => {
    const startedAt = new Date().toISOString();
    console.info(`[AUTH] cleanup start at=${startedAt}`);
    const result = await runAuthCleanup(AUTH_TOKEN_RETENTION_HOURS);
    const finishedAt = new Date().toISOString();
    console.info(`[AUTH] cleanup done at=${finishedAt} expiredSessions=${result.expiredSessionsDeleted} expiredTokens=${result.expiredTokensDeleted} usedTokens=${result.usedTokensDeleted}`);
    return { startedAt, finishedAt, result };
  };

  router.post("/auth-cleanup", async (req, res) => {
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

  return router;
}

/**
 * /api/leads/* routes: authenticated contractor lead submission with email notification
 */
export function createLeadsRouter(
  authService: AuthService,
  sharedAuthLimiter: SharedAuthRateLimiter,
) {
  const router = express.Router();

  router.post("/contractor", requireAuth, async (req, res) => {
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

  return router;
}
