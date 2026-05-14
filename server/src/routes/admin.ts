import express from "express";
import { requireAdmin } from "../auth/authMiddleware";
import { db } from "../data/repository";
import {
  AssessmentReviewStatus,
  ReviewConfidenceLevel,
  PartnerOrganizationType,
  PartnerReferralInviteType,
  PartnerReferralStatus,
  PilotCohortStatus,
  FollowUpCheckInType,
  FollowUpCheckInStatus,
} from "../domain/types";
import {
  VALID_REVIEW_STATUS,
  VALID_REVIEW_CONFIDENCE,
  VALID_PARTNER_ORG_TYPE,
  VALID_PILOT_COHORT_STATUS,
  VALID_FOLLOW_UP_TYPE,
  VALID_FOLLOW_UP_STATUS,
  VALID_REFERRAL_INVITE_TYPE,
  VALID_REFERRAL_STATUS,
  VALID_LEAD_STATUS,
  optionalString,
  escapeHtml,
  pct,
  toCsvCell,
} from "./shared";

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
    <p class="sub">Rows marked "Sharing not authorized" are excluded from partner household detail because consent/share preferences do not authorize sharing for this partner type.</p>
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

export function createAdminRouter() {
  const router = express.Router();

  router.get("/revenue-summary", requireAdmin, async (_req, res) => {
    try {
      const summary = await db.getRevenueSummary();
      return res.json(summary);
    } catch (error) {
      console.error("[REVENUE] summary_failed", { error: String(error) });
      return res.status(500).json({ error: "Unable to load revenue summary." });
    }
  });

  router.get("/pilot-report.html", requireAdmin, async (_req, res) => {
    try {
      const summary = await db.getRevenueSummary();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(renderPilotReportHtml(summary));
    } catch (error) {
      console.error("[PILOT] report_failed", { error: String(error) });
      return res.status(500).send("Unable to generate pilot report.");
    }
  });

  router.get("/partner-overview.html", requireAdmin, async (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderPartnerOverviewHtml());
  });

  router.patch("/sessions/:id/assessment-review", requireAdmin, async (req, res) => {
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

  router.get("/pilot-cohorts", requireAdmin, async (_req, res) => {
    try {
      return res.json(await db.getPilotCohortDashboard());
    } catch (error) {
      console.error("[PILOT] cohorts_failed", { error: String(error) });
      return res.status(500).json({ error: "Unable to load pilot cohorts." });
    }
  });

  router.get("/demo-pilot", requireAdmin, async (_req, res) => {
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

  router.get("/follow-up-attention-queue", requireAdmin, async (_req, res) => {
    try {
      return res.json({ queue: await db.getFollowUpAttentionQueue() });
    } catch (error) {
      console.error("[PILOT] follow_up_queue_failed", { error: String(error) });
      return res.status(500).json({ error: "Unable to load follow-up attention queue." });
    }
  });

  router.get("/partner-referrals", requireAdmin, async (_req, res) => {
    return res.json(await db.listPartnerReferrals());
  });

  router.post("/partner-referrals", requireAdmin, async (req, res) => {
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

  router.patch("/partner-referrals/:id", requireAdmin, async (req, res) => {
    const status = String(req.body.status ?? "");
    if (!VALID_REFERRAL_STATUS.has(status)) return res.status(400).json({ error: "Invalid referral status." });
    const referral = await db.updatePartnerReferralStatus(String(req.params.id), status as PartnerReferralStatus);
    if (!referral) return res.status(404).json({ error: "Referral not found." });
    return res.json({ referral });
  });

  router.post("/partner-organizations", requireAdmin, async (req, res) => {
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

  router.post("/pilot-cohorts", requireAdmin, async (req, res) => {
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

  router.patch("/sessions/:id/pilot-cohort", requireAdmin, async (req, res) => {
    const pilotCohortId = req.body.pilotCohortId === null ? null : optionalString(req.body.pilotCohortId, 120);
    const session = await db.assignSessionToPilotCohort(String(req.params.id), pilotCohortId ?? null);
    if (!session) return res.status(404).json({ error: "Session not found." });
    return res.json({ session });
  });

  router.post("/follow-up-check-ins", requireAdmin, async (req, res) => {
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

  router.patch("/follow-up-check-ins/:id", requireAdmin, async (req, res) => {
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

  router.get("/pilot-cohorts/:id/report.html", requireAdmin, async (req, res) => {
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

  router.get("/contractor-leads.csv", requireAdmin, async (_req, res) => {
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

  router.delete("/contractor-leads/:id", requireAdmin, async (req, res) => {
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

  router.patch("/contractor-leads/:id", requireAdmin, async (req, res) => {
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

  return router;
}
