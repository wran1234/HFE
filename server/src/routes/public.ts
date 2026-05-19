import express from "express";
import { AuthService } from "../auth/authService";
import { clientIpFromRequest } from "../auth/rateLimit";
import { SharedAuthRateLimiter } from "../auth/sharedAuthRateLimiter";
import { db } from "../data/repository";
import { PartnerReferralStatus } from "../domain/types";
import {
  VALID_ANALYTICS_EVENT_NAMES,
  VALID_PROJECT_URGENCY,
  VALID_ESTIMATED_BUDGET,
  VALID_REFERRAL_STATUS,
  optionalString,
} from "./shared";

export function createPublicRouter(
  authService: AuthService,
  sharedAuthLimiter: SharedAuthRateLimiter,
) {
  const router = express.Router();

  router.post("/affiliate-clicks", async (req, res) => {
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

  router.post("/contractor-leads", async (req, res) => {
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

  router.post("/beta-waitlist", async (req, res) => {
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

  router.post("/analytics/events", async (req, res) => {
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

  router.get("/referrals/:code", async (req, res) => {
    const referral = await db.getPartnerReferralByCode(String(req.params.code));
    if (!referral || referral.status === "cancelled") return res.status(404).json({ error: "Referral not found." });
    if (referral.status === "created" || referral.status === "sent") {
      await db.updatePartnerReferralStatus(referral.id, "opened");
    }
    return res.json({ referral });
  });

  router.post("/referrals/:code/status", async (req, res) => {
    const status = String(req.body.status ?? "");
    if (!VALID_REFERRAL_STATUS.has(status)) return res.status(400).json({ error: "Invalid referral status." });
    const referral = await db.updatePartnerReferralStatus(String(req.params.code), status as PartnerReferralStatus);
    if (!referral) return res.status(404).json({ error: "Referral not found." });
    return res.json({ referral });
  });

  return router;
}
