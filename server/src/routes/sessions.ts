import express from "express";
import { requireAuth } from "../auth/authMiddleware";
import { runAssessmentEngine } from "../assessment/assessmentEngine";
import { analyzePhotoForHazards } from "../assessment/photoHazardVision";
import { generateServiceRequestSuggestions } from "../assessment/serviceRequestEngine";
import { searchContractorsNearZip } from "../contractors/contractorSearch";
import { db } from "../data/repository";
import { RoomType } from "../domain/enums";
import { REQUIRED_ROOM_ORDER } from "../domain/roomChecklists";
import {
  CareNoteAuthorRole,
  CareNoteType,
  EvidenceUploaderRole,
  RecommendationEvidenceType,
  ReportPayload,
  SeniorProfile,
  ServiceRequesterRole,
  ServiceRequestStatus,
  ServiceType,
  SessionContextUpdate,
  HazardObservation,
} from "../domain/types";
import { buildExportablePreventionSummary, estimatePreventionImpact } from "../domain/independenceRisk";
import { buildReportPayload, persistReportPayload } from "../reporting/reportBuilder";
import { StorageAdapter } from "../storage/storageAdapter";
import {
  VALID_ROOM_TYPES_SET,
  VALID_HAZARD_TYPES_SET,
  VALID_SEVERITY_SET,
  VALID_STATUS_SET,
  VALID_AGE_RANGE,
  VALID_LIVING_ARRANGEMENT,
  VALID_SENIOR_MOBILITY,
  VALID_PRIOR_FALLS,
  VALID_COMPLEXITY,
  VALID_MEMORY_CONCERNS,
  VALID_CARE_NOTE_TYPE,
  VALID_CARE_AUTHOR_ROLE,
  VALID_ACTION_STATUS,
  VALID_ACTION_OWNER,
  VALID_ACTION_PRIORITY,
  VALID_PREVENTION_IMPACT,
  VALID_EVIDENCE_TYPE,
  VALID_EVIDENCE_UPLOADER_ROLE,
  VALID_SERVICE_TYPE,
  VALID_SERVICE_REQUESTER_ROLE,
  VALID_SERVICE_STATUS,
  PHOTO_VIEW_LABELS,
  PHOTO_CONCERN_LABELS,
  PHOTO_CONCERN_DEFAULT_SEVERITY,
  optionalString,
  parseConsentState,
  consentStateFromSession,
  parseSeniorProfile,
  resolveReportEvidenceUrls,
  hasMinimumAssessmentCoverage,
  escapeHtml,
} from "./shared";

export function createSessionsRouter(
  storage: StorageAdapter,
  geminiApiKey: string,
  geminiPhotoHazardModel: string,
  googlePlacesApiKey: string,
) {
  const router = express.Router();

  router.get("/", requireAuth, async (req, res) => {
    const limit = Math.min(Math.max(1, Number(req.query.limit ?? 20)), 100);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    try {
      const { sessions, nextCursor } = await db.listSessionsForUser(req.authUser!.id, { limit, cursor });
      return res.json({ sessions, nextCursor });
    } catch {
      return res.status(400).json({ error: "Invalid cursor." });
    }
  });

  router.post("/", requireAuth, async (req, res) => {
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

  router.get("/:id", requireAuth, async (req, res) => {
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

  router.post("/:id/context", requireAuth, async (req, res) => {
    const existing = await db.getSession(req.params.id);
    if (!existing) return res.status(404).json({ error: "Session not found." });
    if (existing.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    const update = req.body as SessionContextUpdate;
    const session = await db.updateSessionContext(req.params.id, update);
    if (!session) return res.status(404).json({ error: "Session not found." });
    return res.json({ session, seniorProfile: await db.getSeniorProfile(session.id) });
  });

  router.post("/:id/observations", requireAuth, async (req, res) => {
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

  router.post("/:id/rooms/:roomType/progress", requireAuth, async (req, res) => {
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

  router.post("/:id/photo-evidence", requireAuth, async (req, res) => {
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
      apiKey: geminiApiKey,
      model: geminiPhotoHazardModel,
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

  router.post("/:id/finalize", requireAuth, async (req, res) => {
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
    const resolved = await resolveReportEvidenceUrls(report, storage);
    return res.json({ assessment, report: resolved });
  });

  router.post("/:id/assessment", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    const assessment = await runAssessmentEngine(session);
    return res.json({ assessment });
  });

  router.get("/:id/report", requireAuth, async (req, res) => {
    const report = await db.getReport(req.params.id, req.authUser!.role === "admin" ? undefined : req.authUser!.id);
    if (!report) return res.status(404).json({ error: "Report not found." });
    const resolved = await resolveReportEvidenceUrls(report, storage);
    return res.json({ report: resolved });
  });

  // Prevention summary helpers
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

  router.get("/:id/prevention-summary", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    const summary = await getExportableSummaryForSession(session.id, req.authUser!.id);
    if (!summary) return res.status(404).json({ error: "Prevention Summary not found." });
    return res.json({ summary });
  });

  router.get("/:id/prevention-summary.html", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).send("Session not found.");
    if (session.userId !== req.authUser!.id) return res.status(403).send("Forbidden");
    const summary = await getExportableSummaryForSession(session.id, req.authUser!.id);
    if (!summary) return res.status(404).send("Prevention Summary not found.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderPreventionSummaryHtml(summary));
  });

  router.get("/:id/care-notes", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    return res.json({ notes: await db.listCareNotes(session.id) });
  });

  router.post("/:id/care-notes", requireAuth, async (req, res) => {
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

  router.get("/:id/care-notes/summary", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    return res.json({ summary: await db.buildCareNoteSummary(session.id) });
  });

  router.get("/:id/recommendations/:recommendationId/evidence", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    return res.json({ evidence: await db.listRecommendationEvidence(session.id, String(req.params.recommendationId)) });
  });

  router.post("/:id/recommendations/:recommendationId/evidence", requireAuth, async (req, res) => {
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

  router.get("/:id/service-requests", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    return res.json({ serviceRequests: await db.listServiceRequests(session.id) });
  });

  router.post("/:id/service-requests", requireAuth, async (req, res) => {
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

  router.post("/:id/service-requests/generate-suggestions", requireAuth, async (req, res) => {
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

  router.patch("/:id/recommendations/:recommendationId/status", requireAuth, async (req, res) => {
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

  router.post("/:id/contractor-suggestions", requireAuth, async (req, res) => {
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
            apiKey: googlePlacesApiKey,
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
        source: googlePlacesApiKey ? "google_places" : "google_maps_search",
      });
    } catch (error) {
      console.error("[CONTRACTOR] suggestions_failed", { error: String(error) });
      return res.status(500).json({ error: "Unable to find contractor suggestions right now." });
    }
  });

  router.get("/:id/follow-up-check-ins", requireAuth, async (req, res) => {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.authUser!.id) return res.status(403).json({ error: "Forbidden" });
    return res.json({ followUps: await db.listFollowUpCheckInsForSession(session.id) });
  });

  router.post("/:id/follow-up-check-ins/:followUpId/submit", requireAuth, async (req, res) => {
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

  return router;
}
