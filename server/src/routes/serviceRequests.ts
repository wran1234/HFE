import express from "express";
import { requireAuth } from "../auth/authMiddleware";
import { db } from "../data/repository";
import { ServiceRequestStatus } from "../domain/types";
import {
  VALID_SERVICE_STATUS,
  VALID_ACTION_PRIORITY,
  optionalString,
} from "./shared";

export function createServiceRequestsRouter() {
  const router = express.Router();

  router.patch("/:id", requireAuth, async (req, res) => {
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

  return router;
}
