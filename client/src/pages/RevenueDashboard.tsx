import { useEffect, useState } from "react";
import {
  assignSessionToPilotCohort,
  createPartnerOrganization,
  createPartnerReferral,
  createPilotCohort,
  cancelPartnerReferral,
  deleteContractorLead,
  getFollowUpAttentionQueue,
  getDemoPilotShortcuts,
  getPartnerReferrals,
  getPilotCohorts,
  getRevenueSummary,
  scheduleFollowUpCheckIn,
  updateFollowUpCheckIn,
  updateAssessmentReview,
  updateContractorLeadOps,
} from "../lib/apiClient";
import type { AssessmentReviewStatus, PartnerOrganizationType, PartnerReferralInviteType, PilotCohortStatus, ReviewConfidenceLevel } from "../lib/types";
import type { PilotCohortDashboardResponse } from "../lib/apiClient";

interface RevenueSummary {
  totalAffiliateClicks: number;
  totalContractorLeads: number;
  betaWaitlist: {
    total: number;
    last7Days: number;
    byZipCode: Array<{ zipCode: string; count: number }>;
    recent: Array<{
      id: string;
      email: string;
      name?: string;
      role?: string;
      zipCode?: string;
      source?: string;
      createdAt: string;
    }>;
  };
  funnelCounts: {
    reportViewed: number;
    affiliateClickStarted: number;
    affiliateClickSaved: number;
    contractorFormOpened: number;
    contractorLeadSubmitted: number;
    contractorLeadSaved: number;
  };
  funnelConversion: {
    reportToAffiliatePercent: number;
    reportToContractorPercent: number;
  };
  clicksByProductCategory: Array<{ productName: string; category: string; count: number }>;
  leadsByZipCode: Array<{ zipCode: string; count: number }>;
  recentContractorLeads: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string;
    zipCode: string;
    preferredContact: string;
    notes?: string;
    status: "new" | "contacted" | "qualified" | "rejected" | "converted";
    internalNotes?: string;
    projectUrgency?: "immediately" | "within_30_days" | "within_3_months" | "just_researching";
    estimatedBudget?: "under_500" | "500_2000" | "2000_5000" | "over_5000" | "unsure";
    createdAt: string;
    sessionId?: string;
  }>;
  parentSafety: {
    totalAssessments: number;
    independenceRiskCounts: Array<{ riskLevel: string; count: number }>;
    fallRiskCounts: Array<{ riskLevel: string; count: number }>;
    mostCommonHazards: Array<{ hazardType: string; count: number }>;
    completedRecommendationRate: number;
    evidenceAttachmentRate: number;
    careNoteCount: number;
    highRiskSessionsNeedingFollowUp: number;
    sessionsWithIncompleteImmediateActions: number;
    sessionsWithMemorySupportConcerns: number;
    sessionsWithNoRecentCareNote: number;
    pilotMetrics: {
      totalAssessments: number;
      highUrgentRiskPercentage: number;
      mostCommonHazardCategories: Array<{ hazardType: string; count: number }>;
      averageRecommendationsPerAssessment: number;
      actionCompletionRate: number;
      immediateActionCompletionRate: number;
      evidenceAttachmentRate: number;
      contractorLeadConversionRate: number;
      careNoteUsageRate: number;
      memorySupportFlaggedPercentage: number;
      totalServiceRequests?: number;
      openServiceRequests?: number;
      scheduledServiceRequests?: number;
      completedServiceRequests?: number;
      highPriorityOpenServiceRequests?: number;
      sessionsWithUrgentRiskAndNoServiceRequest?: number;
      serviceRequestGenerationRate?: number;
      serviceRequestCompletionRate?: number;
      verifiedCompletionRate?: number;
      averageServiceRating?: number;
      providerFollowupNeededCount?: number;
      providerCompletedCounts?: Array<{ providerName: string; count: number }>;
    };
    careCoordinationRows: Array<{
      sessionId: string;
      parentLabel: string;
      riskLevel: string;
      fallRiskLevel?: string;
      topRiskDriver: string;
      pendingImmediateActions: number;
      lastCareNoteDate?: string;
      contractorLeadStatus?: string;
      reportUrl: string;
      openServiceRequestsCount?: number;
      nextScheduledServiceDate?: string;
      serviceStatusSummary?: string;
      reviewStatus?: AssessmentReviewStatus;
      reviewConfidenceLevel?: ReviewConfidenceLevel;
    }>;
    serviceRequests: {
      total: number;
      byType: Array<{ serviceType: string; count: number }>;
      open: number;
      scheduled: number;
      completed: number;
      highPriorityOpen: number;
      urgentRiskNoServiceRequest: number;
    };
  };
}

export default function RevenueDashboardPage() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [leadDrafts, setLeadDrafts] = useState<Record<string, { status: "new" | "contacted" | "qualified" | "rejected" | "converted"; internalNotes: string }>>({});
  const [savingReviewSessionId, setSavingReviewSessionId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { reviewStatus: AssessmentReviewStatus; confidenceLevel: ReviewConfidenceLevel; reviewerNotes: string }>>({});
  const [cohortDashboard, setCohortDashboard] = useState<PilotCohortDashboardResponse | null>(null);
  const [followUpQueue, setFollowUpQueue] = useState<Array<{ followUpId: string; sessionId: string; cohortName?: string; riskLevel: string; checkInType: string; issueReported: string; lastSubmittedDate?: string; requestedFollowup: boolean; reportUrl: string }>>([]);
  const [referralDashboard, setReferralDashboard] = useState<Awaited<ReturnType<typeof getPartnerReferrals>> | null>(null);
  const [demoPilot, setDemoPilot] = useState<Awaited<ReturnType<typeof getDemoPilotShortcuts>> | null>(null);
  const [partnerDraft, setPartnerDraft] = useState({ name: "", organizationType: "care_coordinator" as PartnerOrganizationType, displayName: "", logoUrl: "" });
  const [cohortDraft, setCohortDraft] = useState({ partnerOrganizationId: "", name: "", status: "draft" as PilotCohortStatus, targetHouseholds: "" });
  const [assignmentDraft, setAssignmentDraft] = useState({ sessionId: "", pilotCohortId: "" });
  const [followUpDraft, setFollowUpDraft] = useState({ sessionId: "", pilotCohortId: "", scheduledFor: "", notes: "" });
  const [referralDraft, setReferralDraft] = useState({ partnerOrganizationId: "", pilotCohortId: "", inviteType: "general_link" as PartnerReferralInviteType, recipientName: "", recipientEmail: "", seniorName: "" });
  const [copiedReferralId, setCopiedReferralId] = useState<string | null>(null);

  const loadSummary = async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const data = await getRevenueSummary();
      setSummary(data);
      const cohorts = await getPilotCohorts().catch(() => null);
      setCohortDashboard(cohorts);
      const queue = await getFollowUpAttentionQueue().catch(() => ({ queue: [] }));
      setFollowUpQueue(queue.queue);
      const referrals = await getPartnerReferrals().catch(() => null);
      setReferralDashboard(referrals);
      const demo = await getDemoPilotShortcuts().catch(() => null);
      setDemoPilot(demo);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("authentication")) {
        setError("You are not authorized to view revenue data. Please log in again.");
      } else {
        setError("Unable to load revenue dashboard right now. Please try refreshing.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    const confirmed = window.confirm("Delete this contractor lead?");
    if (!confirmed) return;
    setDeletingLeadId(leadId);
    setError(null);
    try {
      await deleteContractorLead(leadId);
      await loadSummary("refresh");
    } catch {
      setError("Unable to delete contractor lead right now. Please try again.");
    } finally {
      setDeletingLeadId(null);
    }
  };

  const ensureLeadDraft = (lead: RevenueSummary["recentContractorLeads"][number]) =>
    leadDrafts[lead.id] ?? {
      status: lead.status,
      internalNotes: lead.internalNotes ?? "",
    };

  const updateLeadDraft = (
    leadId: string,
    updates: Partial<{ status: "new" | "contacted" | "qualified" | "rejected" | "converted"; internalNotes: string }>
  ) => {
    setLeadDrafts((current) => {
      const existing = current[leadId] ?? { status: "new" as const, internalNotes: "" };
      return {
        ...current,
        [leadId]: { ...existing, ...updates },
      };
    });
  };

  const handleSaveLeadOps = async (leadId: string) => {
    const draft = leadDrafts[leadId];
    if (!draft) return;
    setSavingLeadId(leadId);
    setError(null);
    try {
      await updateContractorLeadOps(leadId, {
        status: draft.status,
        internalNotes: draft.internalNotes,
      });
      await loadSummary("refresh");
    } catch {
      setError("Unable to save lead updates right now. Please try again.");
    } finally {
      setSavingLeadId(null);
    }
  };

  const ensureReviewDraft = (row: RevenueSummary["parentSafety"]["careCoordinationRows"][number]) =>
    reviewDrafts[row.sessionId] ?? {
      reviewStatus: row.reviewStatus ?? "not_reviewed",
      confidenceLevel: row.reviewConfidenceLevel ?? "medium",
      reviewerNotes: "",
    };

  const updateReviewDraft = (
    sessionId: string,
    updates: Partial<{ reviewStatus: AssessmentReviewStatus; confidenceLevel: ReviewConfidenceLevel; reviewerNotes: string }>
  ) => {
    setReviewDrafts((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] ?? { reviewStatus: "not_reviewed" as const, confidenceLevel: "medium" as const, reviewerNotes: "" }),
        ...updates,
      },
    }));
  };

  const handleSaveReview = async (sessionId: string) => {
    const row = summary?.parentSafety.careCoordinationRows.find((item) => item.sessionId === sessionId);
    const draft = reviewDrafts[sessionId] ?? (row ? ensureReviewDraft(row) : undefined);
    if (!draft) return;
    setSavingReviewSessionId(sessionId);
    setError(null);
    try {
      await updateAssessmentReview(sessionId, draft);
      await loadSummary("refresh");
    } catch {
      setError("Unable to save assessment review right now. Please try again.");
    } finally {
      setSavingReviewSessionId(null);
    }
  };

  const refreshCohorts = async () => {
    setCohortDashboard(await getPilotCohorts());
  };

  const handleCreatePartner = async () => {
    if (!partnerDraft.name.trim()) return;
    await createPartnerOrganization({
      name: partnerDraft.name,
      organizationType: partnerDraft.organizationType,
      displayName: partnerDraft.displayName || undefined,
      logoUrl: partnerDraft.logoUrl || undefined,
    });
    setPartnerDraft({ name: "", organizationType: "care_coordinator", displayName: "", logoUrl: "" });
    await refreshCohorts();
  };

  const handleCreateCohort = async () => {
    if (!cohortDraft.partnerOrganizationId || !cohortDraft.name.trim()) return;
    await createPilotCohort({
      partnerOrganizationId: cohortDraft.partnerOrganizationId,
      name: cohortDraft.name,
      status: cohortDraft.status,
      targetHouseholds: cohortDraft.targetHouseholds ? Number(cohortDraft.targetHouseholds) : undefined,
    });
    setCohortDraft({ partnerOrganizationId: "", name: "", status: "draft", targetHouseholds: "" });
    await refreshCohorts();
  };

  const handleAssignSession = async () => {
    if (!assignmentDraft.sessionId || !assignmentDraft.pilotCohortId) return;
    await assignSessionToPilotCohort(assignmentDraft.sessionId, assignmentDraft.pilotCohortId);
    setAssignmentDraft({ sessionId: "", pilotCohortId: "" });
    await refreshCohorts();
  };

  const handleScheduleFollowUp = async () => {
    if (!followUpDraft.sessionId || !followUpDraft.pilotCohortId || !followUpDraft.scheduledFor) return;
    await scheduleFollowUpCheckIn({
      sessionId: followUpDraft.sessionId,
      pilotCohortId: followUpDraft.pilotCohortId,
      checkInType: "thirty_day",
      scheduledFor: followUpDraft.scheduledFor,
      notes: followUpDraft.notes || undefined,
    });
    setFollowUpDraft({ sessionId: "", pilotCohortId: "", scheduledFor: "", notes: "" });
    await refreshCohorts();
  };

  const handleCreateReferral = async () => {
    if (!referralDraft.partnerOrganizationId) return;
    await createPartnerReferral({
      partnerOrganizationId: referralDraft.partnerOrganizationId,
      pilotCohortId: referralDraft.pilotCohortId || undefined,
      inviteType: referralDraft.inviteType,
      recipientName: referralDraft.recipientName || undefined,
      recipientEmail: referralDraft.recipientEmail || undefined,
      seniorName: referralDraft.seniorName || undefined,
    });
    setReferralDraft({ partnerOrganizationId: "", pilotCohortId: "", inviteType: "general_link", recipientName: "", recipientEmail: "", seniorName: "" });
    setReferralDashboard(await getPartnerReferrals());
  };

  const copyReferralText = async (referralId: string, text: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedReferralId(referralId);
    window.setTimeout(() => setCopiedReferralId((current) => (current === referralId ? null : current)), 1800);
  };

  const handleCompleteFollowUp = async (followUpId: string) => {
    await updateFollowUpCheckIn(followUpId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      newFallsReported: false,
      newHospitalVisitReported: false,
      newCaregiverSupportAdded: false,
      majorHomeFixCompleted: false,
      notes: "Completed from cohort dashboard. Self-reported pilot tracking only.",
    });
    await refreshCohorts();
  };

  useEffect(() => {
    void loadSummary("initial");
  }, []);

  return (
    <div className="min-h-screen bg-warm-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-warm-900">Revenue Dashboard</h1>
            <p className="text-sm text-warm-500 mt-1">Internal-only revenue operations view.</p>
            <p className="text-xs text-warm-400 mt-1">
              Last updated at{" "}
              {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSummary("refresh")}
              disabled={loading || refreshing}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-warm-200 bg-white hover:bg-warm-50 text-warm-800 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <a
              href="/api/admin/pilot-report.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center px-4 py-2 rounded-lg border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-800 text-sm font-semibold transition-colors"
            >
              Export Pilot Report
            </a>
            <a
              href="/api/admin/partner-overview.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center px-4 py-2 rounded-lg border border-brand-200 bg-white hover:bg-brand-50 text-brand-800 text-sm font-semibold transition-colors"
            >
              Export Partner Overview
            </a>
            <a
              href="/api/admin/contractor-leads.csv"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
            >
              Export Contractor Leads CSV
            </a>
          </div>
        </div>

        {loading && <div className="bg-white border border-warm-200 rounded-2xl p-6 text-warm-500">Loading revenue metrics...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">{error}</div>}

        {summary && (
          <>
            {demoPilot?.demoAvailable && (
              <section className="bg-white border border-brand-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-warm-900">Demo Pilot</h2>
                    <p className="text-sm text-warm-500 mt-1">{demoPilot.partnerName} · {demoPilot.cohortName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/admin/pilot-cohorts/${demoPilot.cohortId}/report.html`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 hover:text-brand-800">Open demo cohort report</a>
                    {demoPilot.referralUrl && <a href={demoPilot.referralUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 hover:text-brand-800">Open demo referral link</a>}
                    {demoPilot.highRiskReportUrl && <a href={demoPilot.highRiskReportUrl} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Open high-risk household</a>}
                    {demoPilot.completedImprovementReportUrl && <a href={demoPilot.completedImprovementReportUrl} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Open completed-improvement household</a>}
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  {[
                    "Open referral link",
                    "Complete onboarding",
                    "Generate report",
                    "Add service request",
                    "Submit follow-up",
                    "Export prevention summary",
                    "Export cohort report",
                    "Export partner overview",
                  ].map((item) => (
                    <div key={item} className="rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-warm-700">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <p className="text-sm text-warm-500">Total Affiliate Clicks</p>
                <p className="text-3xl font-bold text-warm-900 mt-1">{summary.totalAffiliateClicks}</p>
                {summary.totalAffiliateClicks === 0 && (
                  <p className="text-xs text-warm-400 mt-2">No affiliate clicks yet.</p>
                )}
              </div>
              <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <p className="text-sm text-warm-500">Total Contractor Leads</p>
                <p className="text-3xl font-bold text-warm-900 mt-1">{summary.totalContractorLeads}</p>
                {summary.totalContractorLeads === 0 && (
                  <p className="text-xs text-warm-400 mt-2">No contractor leads yet.</p>
                )}
              </div>
              <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <p className="text-sm text-warm-500">Beta Waitlist</p>
                <p className="text-3xl font-bold text-warm-900 mt-1">{summary.betaWaitlist.total}</p>
                <p className="text-xs text-warm-400 mt-2">{summary.betaWaitlist.last7Days} joined in the last 7 days.</p>
              </div>
            </div>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-warm-900">Partner Readiness</h2>
                  <p className="text-sm text-warm-500 mt-1">
                    These metrics help demonstrate whether the platform can identify preventable risks, convert them into actions, and coordinate follow-through.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Assessments completed</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.totalAssessments}</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">High-risk homes identified</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.highUrgentRiskPercentage}%</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Actions completed</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.completedRecommendationRate}%</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Services requested</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.serviceRequests.total}</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Services completed</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.serviceRequests.completed}</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Completion verified</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.verifiedCompletionRate ?? 0}%</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Families using care notes</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.careNoteUsageRate}%</p>
                </div>
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Contractor leads generated</p>
                  <p className="text-xl font-bold text-warm-900">{summary.totalContractorLeads}</p>
                </div>
              </div>
              <h2 className="text-lg font-semibold text-warm-900 mb-4">Parent Safety Platform</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Assessments</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.totalAssessments}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Completed Actions</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.completedRecommendationRate}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Evidence Attached</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.evidenceAttachmentRate}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Care Notes</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.careNoteCount}</p>
                </div>
                <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                  <p className="text-xs text-red-700">High-risk Follow-up</p>
                  <p className="text-xl font-bold text-red-700">{summary.parentSafety.highRiskSessionsNeedingFollowUp}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">High/Urgent Risk</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.highUrgentRiskPercentage}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Avg Actions / Assessment</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.averageRecommendationsPerAssessment}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Immediate Completion</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.immediateActionCompletionRate}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Memory Support Flagged</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.memorySupportFlaggedPercentage}%</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Service Requests</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.serviceRequests.total}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Open Requests</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.serviceRequests.open}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Scheduled Requests</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.serviceRequests.scheduled}</p>
                </div>
                <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                  <p className="text-xs text-red-700">Urgent No Service</p>
                  <p className="text-xl font-bold text-red-700">{summary.parentSafety.serviceRequests.urgentRiskNoServiceRequest}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Service Generation</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.serviceRequestGenerationRate ?? 0}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Service Completion</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.serviceRequestCompletionRate ?? 0}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Verified Completion</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.verifiedCompletionRate ?? 0}%</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Avg Service Rating</p>
                  <p className="text-xl font-bold text-warm-900">{summary.parentSafety.pilotMetrics.averageServiceRating || "n/a"}</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-warm-900 mb-2">Independence Risk Levels</p>
                  <div className="space-y-2">
                    {summary.parentSafety.independenceRiskCounts.length === 0 && <p className="text-sm text-warm-500">No completed risk data yet.</p>}
                    {summary.parentSafety.independenceRiskCounts.map((item) => (
                      <div key={item.riskLevel} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                        <span className="text-sm text-warm-700">{item.riskLevel}</span>
                        <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-warm-900 mb-2">Fall Risk Levels</p>
                  <div className="space-y-2">
                    {summary.parentSafety.fallRiskCounts.length === 0 && <p className="text-sm text-warm-500">No fall risk data yet.</p>}
                    {summary.parentSafety.fallRiskCounts.map((item) => (
                      <div key={item.riskLevel} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                        <span className="text-sm text-warm-700">{item.riskLevel}</span>
                        <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-sm font-semibold text-warm-900 mb-2">Most Common Hazard Categories</p>
                  <div className="space-y-2">
                    {summary.parentSafety.mostCommonHazards.length === 0 && <p className="text-sm text-warm-500">No hazard data yet.</p>}
                    {summary.parentSafety.mostCommonHazards.map((item) => (
                      <div key={item.hazardType} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                        <span className="text-sm text-warm-700">{item.hazardType.replace(/_/g, " ")}</span>
                        <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-warm-900 mb-2">Care Coordination Flags</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                      <span className="text-sm text-warm-700">Incomplete immediate actions</span>
                      <span className="text-sm font-semibold text-brand-700">{summary.parentSafety.sessionsWithIncompleteImmediateActions}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                      <span className="text-sm text-warm-700">Memory-support concerns</span>
                      <span className="text-sm font-semibold text-brand-700">{summary.parentSafety.sessionsWithMemorySupportConcerns}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                      <span className="text-sm text-warm-700">No recent care note</span>
                      <span className="text-sm font-semibold text-brand-700">{summary.parentSafety.sessionsWithNoRecentCareNote}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-warm-900 mb-2">Requests by Type</p>
                  <div className="space-y-2">
                    {summary.parentSafety.serviceRequests.byType.length === 0 && <p className="text-sm text-warm-500">No service request data yet.</p>}
                    {summary.parentSafety.serviceRequests.byType.map((item) => (
                      <div key={item.serviceType} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                        <span className="text-sm text-warm-700">{item.serviceType.replace(/_/g, " ")}</span>
                        <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-warm-900 mb-2">Provider / Service Quality</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                      <span className="text-sm text-warm-700">Provider follow-up needed</span>
                      <span className="text-sm font-semibold text-brand-700">{summary.parentSafety.pilotMetrics.providerFollowupNeededCount ?? 0}</span>
                    </div>
                    {(summary.parentSafety.pilotMetrics.providerCompletedCounts ?? []).length === 0 && <p className="text-sm text-warm-500">No provider completions yet.</p>}
                    {(summary.parentSafety.pilotMetrics.providerCompletedCounts ?? []).slice(0, 5).map((item) => (
                      <div key={item.providerName} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                        <span className="text-sm text-warm-700">{item.providerName}</span>
                        <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-warm-900 mb-3">Care Coordination</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm-200 text-left text-warm-500">
                        <th className="py-2 pr-4">Session / Report</th>
                        <th className="py-2 pr-4">Parent</th>
                        <th className="py-2 pr-4">Risk</th>
                        <th className="py-2 pr-4">Top Driver</th>
                        <th className="py-2 pr-4">Pending Immediate</th>
                        <th className="py-2 pr-4">Last Care Note</th>
                        <th className="py-2 pr-4">Lead Status</th>
                        <th className="py-2 pr-4">Service Requests</th>
                        <th className="py-2 pr-4">Next Service</th>
                        <th className="py-2 pr-4">Review</th>
                        <th className="py-2">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.parentSafety.careCoordinationRows.length === 0 && (
                        <tr><td colSpan={11} className="py-3 text-warm-500">No care coordination rows yet.</td></tr>
                      )}
                      {summary.parentSafety.careCoordinationRows.map((row) => {
                        const draft = ensureReviewDraft(row);
                        return (
                          <tr key={row.sessionId} className="border-b border-warm-100 align-top">
                            <td className="py-2 pr-4 text-warm-700 font-mono text-xs">{row.sessionId.slice(0, 10)}</td>
                            <td className="py-2 pr-4 text-warm-900">{row.parentLabel}</td>
                            <td className="py-2 pr-4 text-warm-700">{row.riskLevel}{row.fallRiskLevel ? ` / fall ${row.fallRiskLevel}` : ""}</td>
                            <td className="py-2 pr-4 text-warm-700 max-w-xs">{row.topRiskDriver}</td>
                            <td className="py-2 pr-4 text-warm-700">{row.pendingImmediateActions}</td>
                            <td className="py-2 pr-4 text-warm-700">{row.lastCareNoteDate ? new Date(row.lastCareNoteDate).toLocaleDateString() : "-"}</td>
                            <td className="py-2 pr-4 text-warm-700">{row.contractorLeadStatus || "-"}</td>
                            <td className="py-2 pr-4 text-warm-700">{row.serviceStatusSummary || `${row.openServiceRequestsCount ?? 0} open`}</td>
                            <td className="py-2 pr-4 text-warm-700">{row.nextScheduledServiceDate ? new Date(row.nextScheduledServiceDate).toLocaleDateString() : "-"}</td>
                            <td className="py-2 pr-4 min-w-64">
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <select
                                    value={draft.reviewStatus}
                                    onChange={(e) => updateReviewDraft(row.sessionId, { reviewStatus: e.target.value as AssessmentReviewStatus })}
                                    className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-1.5"
                                  >
                                    <option value="not_reviewed">Not reviewed</option>
                                    <option value="reviewed">Reviewed</option>
                                    <option value="needs_followup">Needs follow-up</option>
                                    <option value="rejected">Rejected</option>
                                  </select>
                                  <select
                                    value={draft.confidenceLevel}
                                    onChange={(e) => updateReviewDraft(row.sessionId, { confidenceLevel: e.target.value as ReviewConfidenceLevel })}
                                    className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-1.5"
                                  >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </div>
                                <textarea
                                  value={draft.reviewerNotes}
                                  onChange={(e) => updateReviewDraft(row.sessionId, { reviewerNotes: e.target.value })}
                                  placeholder="Reviewer notes"
                                  className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-1.5 min-h-12"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleSaveReview(row.sessionId)}
                                  disabled={savingReviewSessionId === row.sessionId}
                                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-60"
                                >
                                  {savingReviewSessionId === row.sessionId ? "Saving..." : "Save review"}
                                </button>
                              </div>
                            </td>
                            <td className="py-2">
                              <a className="text-brand-700 hover:text-brand-800 font-semibold" href={row.reportUrl}>Open report</a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-warm-900 mb-1">Partner Intake</h2>
              <p className="text-sm text-warm-500 mb-4">Referral links and invitation copy for prevention pilot enrollment.</p>
              <div className="grid md:grid-cols-6 gap-2 mb-4">
                <select value={referralDraft.partnerOrganizationId} onChange={(e) => setReferralDraft((d) => ({ ...d, partnerOrganizationId: e.target.value }))} className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                  <option value="">Partner</option>
                  {cohortDashboard?.partnerOrganizations.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                </select>
                <select value={referralDraft.pilotCohortId} onChange={(e) => setReferralDraft((d) => ({ ...d, pilotCohortId: e.target.value }))} className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                  <option value="">Optional cohort</option>
                  {cohortDashboard?.cohorts.map((card) => <option key={card.cohort.id} value={card.cohort.id}>{card.cohort.name}</option>)}
                </select>
                <select value={referralDraft.inviteType} onChange={(e) => setReferralDraft((d) => ({ ...d, inviteType: e.target.value as PartnerReferralInviteType }))} className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                  <option value="general_link">General link</option>
                  <option value="family_invite">Family invite</option>
                  <option value="care_coordinator_invite">Care coordinator</option>
                  <option value="contractor_invite">Contractor</option>
                  <option value="employer_benefit">Employer benefit</option>
                  <option value="insurer_member">Insurer member</option>
                  <option value="other">Other</option>
                </select>
                <input value={referralDraft.recipientName} onChange={(e) => setReferralDraft((d) => ({ ...d, recipientName: e.target.value }))} placeholder="Recipient" className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                <input value={referralDraft.seniorName} onChange={(e) => setReferralDraft((d) => ({ ...d, seniorName: e.target.value }))} placeholder="Parent name" className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                <button type="button" onClick={() => void handleCreateReferral()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Create referral</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-4">
                {referralDashboard && [
                  ["Created", referralDashboard.metrics.created],
                  ["Opened", referralDashboard.metrics.opened],
                  ["Started", referralDashboard.metrics.startedOnboarding],
                  ["Consent", referralDashboard.metrics.consentCompleted],
                  ["Assessment", referralDashboard.metrics.assessmentCompleted],
                  ["Report", referralDashboard.metrics.reportGenerated],
                  ["Open to report", `${referralDashboard.metrics.openedToReportGeneratedRate}%`],
                ].map(([label, value]) => (
                  <div key={label} className="p-2 rounded-lg border border-warm-200 bg-warm-50"><p className="text-[11px] text-warm-500">{label}</p><p className="text-sm font-bold text-warm-900">{value}</p></div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead><tr className="text-left text-warm-500 border-b border-warm-200"><th className="py-2 pr-4">Referral</th><th className="py-2 pr-4">Partner</th><th className="py-2 pr-4">Cohort</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Invite Copy</th><th className="py-2">Action</th></tr></thead>
                  <tbody>
                    {referralDashboard?.referrals.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-3 text-warm-500">
                          No referrals yet. Create a general link or family invite above to start tracking pilot enrollment from invitation to completed report.
                        </td>
                      </tr>
                    )}
                    {referralDashboard?.referrals.slice(0, 25).map((referral) => {
                      const link = `${window.location.origin}${referral.referralUrl}`;
                      const name = referral.recipientName || "[Name]";
                      const sms = `Hi ${name}, ${referral.partnerName} is offering a parent safety assessment to help identify practical ways to support aging safely at home. This is prevention support, not medical advice. Start here: ${link}`;
                      const email = `Subject: Parent safety assessment from ${referral.partnerName}\n\nHi ${name},\n\n${referral.partnerName} is offering a parent safety assessment to help identify practical ways to support aging safely at home. This is prevention and care-coordination support, not medical advice or a diagnosis.\n\nYou can choose whether to share your results with the care partner during consent.\n\nStart here: ${link}`;
                      const script = `Care coordinator script: ${referral.partnerName} is offering a parent safety assessment focused on prevention support, family safety, and aging-at-home assistance. The assessment is not medical advice or a diagnosis. Before recording any home or living space, please confirm permission and consent. Start link: ${link}`;
                      const templateText = `${sms}\n\n${email}\n\n${script}`;
                      return (
                        <tr key={referral.id} className="border-b border-warm-100 align-top">
                          <td className="py-2 pr-4 text-warm-700">
                            <a className="text-brand-700 font-semibold font-mono" href={referral.referralUrl} target="_blank" rel="noreferrer">{referral.referralCode}</a>
                            <div className="mt-1 flex gap-2">
                              <button type="button" onClick={() => void copyReferralText(referral.id, link)} className="text-[11px] font-semibold text-brand-700 hover:text-brand-800">
                                {copiedReferralId === referral.id ? "Copied" : "Copy link"}
                              </button>
                              <button type="button" onClick={() => void copyReferralText(referral.id, templateText)} className="text-[11px] font-semibold text-brand-700 hover:text-brand-800">
                                Copy invite copy
                              </button>
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-warm-700">{referral.partnerName}</td>
                          <td className="py-2 pr-4 text-warm-700">{referral.cohortName || "-"}</td>
                          <td className="py-2 pr-4 text-warm-700">{referral.status}</td>
                          <td className="py-2 pr-4 text-warm-700 max-w-md">
                            <details>
                              <summary className="cursor-pointer font-semibold text-brand-700">SMS, email, and script</summary>
                              <div className="mt-2 whitespace-pre-wrap text-warm-700">{templateText}</div>
                            </details>
                          </td>
                          <td className="py-2"><button type="button" onClick={() => void cancelPartnerReferral(referral.id).then(() => getPartnerReferrals().then(setReferralDashboard))} className="text-red-700 font-semibold">Cancel</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-warm-900 mb-1">Follow-ups Needing Attention</h2>
              <p className="text-sm text-warm-500 mb-4">Self-reported follow-up data that may need care coordination review.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200 text-left text-warm-500">
                      <th className="py-2 pr-4">Session</th>
                      <th className="py-2 pr-4">Cohort</th>
                      <th className="py-2 pr-4">Risk</th>
                      <th className="py-2 pr-4">Follow-up</th>
                      <th className="py-2 pr-4">Issue reported</th>
                      <th className="py-2 pr-4">Submitted</th>
                      <th className="py-2 pr-4">Requested</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUpQueue.length === 0 && <tr><td colSpan={8} className="py-3 text-warm-500">No follow-ups need attention right now.</td></tr>}
                    {followUpQueue.map((row) => (
                      <tr key={`${row.sessionId}:${row.followUpId || row.issueReported}`} className="border-b border-warm-100 align-top">
                        <td className="py-2 pr-4 font-mono text-xs text-warm-700">{row.sessionId.slice(0, 10)}</td>
                        <td className="py-2 pr-4 text-warm-700">{row.cohortName || "-"}</td>
                        <td className="py-2 pr-4 text-warm-700">{row.riskLevel}</td>
                        <td className="py-2 pr-4 text-warm-700">{row.checkInType.replace(/_/g, " ")}</td>
                        <td className="py-2 pr-4 text-warm-700">{row.issueReported}</td>
                        <td className="py-2 pr-4 text-warm-700">{row.lastSubmittedDate ? new Date(row.lastSubmittedDate).toLocaleDateString() : "-"}</td>
                        <td className="py-2 pr-4 text-warm-700">{row.requestedFollowup ? "Yes" : "No"}</td>
                        <td className="py-2"><a className="text-brand-700 hover:text-brand-800 font-semibold" href={row.reportUrl}>Review</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-warm-900">Partner Pilot Cohorts</h2>
                  <p className="text-sm text-warm-500 mt-1">Prevention pilot enrollment, cohort metrics, and self-reported follow-up tracking.</p>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-3 mb-6">
                <div className="p-4 rounded-xl border border-warm-200 bg-warm-50 space-y-2">
                  <p className="text-sm font-semibold text-warm-900">Create Partner Organization</p>
                  <input value={partnerDraft.name} onChange={(e) => setPartnerDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Partner name" className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                  <select value={partnerDraft.organizationType} onChange={(e) => setPartnerDraft((d) => ({ ...d, organizationType: e.target.value as PartnerOrganizationType }))} className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                    <option value="insurer">Insurer</option>
                    <option value="home_care_agency">Home-care agency</option>
                    <option value="care_coordinator">Care coordinator</option>
                    <option value="contractor_partner">Contractor partner</option>
                    <option value="local_government">Local government</option>
                    <option value="employer_benefit">Employer benefit</option>
                    <option value="other">Other</option>
                  </select>
                  <input value={partnerDraft.displayName} onChange={(e) => setPartnerDraft((d) => ({ ...d, displayName: e.target.value }))} placeholder="Display name" className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                  <input value={partnerDraft.logoUrl} onChange={(e) => setPartnerDraft((d) => ({ ...d, logoUrl: e.target.value }))} placeholder="Logo URL" className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                  <button type="button" onClick={() => void handleCreatePartner()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Create partner</button>
                </div>

                <div className="p-4 rounded-xl border border-warm-200 bg-warm-50 space-y-2">
                  <p className="text-sm font-semibold text-warm-900">Create Pilot Cohort</p>
                  <select value={cohortDraft.partnerOrganizationId} onChange={(e) => setCohortDraft((d) => ({ ...d, partnerOrganizationId: e.target.value }))} className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                    <option value="">Select partner</option>
                    {cohortDashboard?.partnerOrganizations.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                  </select>
                  <input value={cohortDraft.name} onChange={(e) => setCohortDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Cohort name" className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                  <select value={cohortDraft.status} onChange={(e) => setCohortDraft((d) => ({ ...d, status: e.target.value as PilotCohortStatus }))} className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                  <input value={cohortDraft.targetHouseholds} onChange={(e) => setCohortDraft((d) => ({ ...d, targetHouseholds: e.target.value }))} placeholder="Target households" className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                  <button type="button" onClick={() => void handleCreateCohort()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Create cohort</button>
                </div>

                <div className="p-4 rounded-xl border border-warm-200 bg-warm-50 space-y-2">
                  <p className="text-sm font-semibold text-warm-900">Enroll Household</p>
                  <select value={assignmentDraft.sessionId} onChange={(e) => setAssignmentDraft((d) => ({ ...d, sessionId: e.target.value }))} className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                    <option value="">Select unassigned session</option>
                    {cohortDashboard?.unassignedSessions.map((session) => <option key={session.id} value={session.id}>{session.parentLabel} · {session.id.slice(0, 8)}</option>)}
                  </select>
                  <select value={assignmentDraft.pilotCohortId} onChange={(e) => setAssignmentDraft((d) => ({ ...d, pilotCohortId: e.target.value }))} className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                    <option value="">Select cohort</option>
                    {cohortDashboard?.cohorts.map((card) => <option key={card.cohort.id} value={card.cohort.id}>{card.partner.name} · {card.cohort.name}</option>)}
                  </select>
                  <button type="button" onClick={() => void handleAssignSession()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Assign to cohort</button>
                </div>
              </div>

              <div className="space-y-4">
                {cohortDashboard?.cohorts.length === 0 && <p className="text-sm text-warm-500">No pilot cohorts yet. Create a partner and cohort above, then use Partner Intake to invite families into a prevention pilot.</p>}
                {cohortDashboard?.cohorts.map((card) => (
                  <div key={card.cohort.id} className="border border-warm-200 rounded-xl p-4 bg-white">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-base font-semibold text-warm-900">{card.partner.displayName || card.partner.name} · {card.cohort.name}</p>
                        <p className="text-xs text-warm-500">{card.partner.organizationType.replace(/_/g, " ")} · {card.cohort.status}</p>
                      </div>
                      <a href={`/api/admin/pilot-cohorts/${card.cohort.id}/report.html`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 hover:text-brand-800">Export Cohort Report</a>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
                      {[
                        ["Households", card.metrics.totalHouseholds],
                        ["High / urgent", `${card.metrics.highUrgentRiskPercentage}%`],
                        ["Actions", `${card.metrics.actionCompletionRate}%`],
                        ["Services", `${card.metrics.serviceRequestGenerationRate ?? 0}%`],
                        ["Verified", `${card.metrics.verifiedCompletionRate ?? 0}%`],
                        ["Reviews", `${card.metrics.assessmentReviewCompletionRate}%`],
                        ["Follow-ups scheduled", card.metrics.followUps.scheduled],
                        ["Follow-ups completed", card.metrics.followUps.completed],
                        ["Missed", card.metrics.followUps.missed],
                        ["Self-reported falls", card.metrics.followUps.selfReportedNewFalls],
                        ["Near-falls", card.metrics.followUps.selfReportedNearFalls],
                        ["Hospital visits", card.metrics.followUps.selfReportedHospitalVisits],
                        ["Home fixes", card.metrics.followUps.majorHomeFixCompleted],
                        ["Feeling safer", card.metrics.followUps.familiesFeelingSafer],
                        ["More prepared", card.metrics.followUps.familiesFeelingMorePrepared],
                        ["CC follow-up", card.metrics.followUps.careCoordinatorFollowupRequested],
                        ["Referrals", card.metrics.intake?.created ?? 0],
                        ["Referral open", `${card.metrics.intake?.openedToReportGeneratedRate ?? 0}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="p-2 rounded-lg border border-warm-200 bg-warm-50">
                          <p className="text-[11px] text-warm-500">{label}</p>
                          <p className="text-sm font-bold text-warm-900">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid md:grid-cols-4 gap-2 mb-4">
                      <select value={followUpDraft.pilotCohortId === card.cohort.id ? followUpDraft.sessionId : ""} onChange={(e) => setFollowUpDraft((d) => ({ ...d, pilotCohortId: card.cohort.id, sessionId: e.target.value }))} className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2">
                        <option value="">Schedule follow-up for household</option>
                        {card.households.map((row) => <option key={row.sessionId} value={row.sessionId}>{row.parentLabel}</option>)}
                      </select>
                      <input type="date" value={followUpDraft.pilotCohortId === card.cohort.id ? followUpDraft.scheduledFor : ""} onChange={(e) => setFollowUpDraft((d) => ({ ...d, pilotCohortId: card.cohort.id, scheduledFor: e.target.value }))} className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                      <input value={followUpDraft.pilotCohortId === card.cohort.id ? followUpDraft.notes : ""} onChange={(e) => setFollowUpDraft((d) => ({ ...d, pilotCohortId: card.cohort.id, notes: e.target.value }))} placeholder="Follow-up notes" className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2" />
                      <button type="button" onClick={() => void handleScheduleFollowUp()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Schedule 30-day check-in</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead><tr className="text-left text-warm-500 border-b border-warm-200"><th className="py-2 pr-4">Household</th><th className="py-2 pr-4">Risk</th><th className="py-2 pr-4">Review</th><th className="py-2 pr-4">Immediate</th><th className="py-2 pr-4">Services</th><th className="py-2 pr-4">Consent / Sharing</th><th className="py-2 pr-4">Follow-up</th><th className="py-2">Links</th></tr></thead>
                        <tbody>
                          {card.households.length === 0 && (
                            <tr>
                              <td colSpan={8} className="py-3 text-warm-500">
                                No households enrolled yet. Create referral links for this cohort or assign an existing session to begin tracking pilot outcomes.
                              </td>
                            </tr>
                          )}
                          {card.households.map((row) => (
                            <tr key={row.sessionId} className="border-b border-warm-100 align-top">
                              <td className="py-2 pr-4 text-warm-900">{row.parentLabel}<br /><span className="font-mono text-warm-400">{row.sessionId.slice(0, 8)}</span></td>
                              <td className="py-2 pr-4 text-warm-700">{row.riskLevel}<br />{row.topRiskDriver}</td>
                              <td className="py-2 pr-4 text-warm-700">{row.reviewStatus ?? "not_reviewed"}</td>
                              <td className="py-2 pr-4 text-warm-700">{row.pendingImmediateActions}</td>
                              <td className="py-2 pr-4 text-warm-700">{row.serviceStatusSummary}</td>
                              <td className="py-2 pr-4 text-warm-700">{row.sharingAuthorized ? "Sharing authorized" : "Sharing not authorized"}<br />CC {row.shareWithCareCoordinator ? "yes" : "no"} · Contractor {row.shareWithContractor ? "yes" : "no"} · Insurer {row.shareWithInsurer ? "yes" : "no"}</td>
                              <td className="py-2 pr-4 text-warm-700">
                                {row.upcomingFollowUpDate ? new Date(row.upcomingFollowUpDate).toLocaleDateString() : "-"}{row.missedFollowUpCount ? ` · ${row.missedFollowUpCount} missed` : ""}
                                {row.upcomingFollowUpId && (
                                  <button type="button" onClick={() => void handleCompleteFollowUp(row.upcomingFollowUpId!)} className="block mt-1 text-brand-700 font-semibold">Mark completed</button>
                                )}
                              </td>
                              <td className="py-2"><a className="text-brand-700 font-semibold" href={row.reportUrl}>Report</a><br /><a className="text-brand-700 font-semibold" href={row.preventionSummaryUrl} target="_blank" rel="noreferrer">Prevention Summary</a></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">Funnel Analytics</h2>
              {summary.funnelCounts.reportViewed +
                summary.funnelCounts.affiliateClickStarted +
                summary.funnelCounts.affiliateClickSaved +
                summary.funnelCounts.contractorFormOpened +
                summary.funnelCounts.contractorLeadSubmitted +
                summary.funnelCounts.contractorLeadSaved === 0 && (
                <p className="text-sm text-warm-500 mb-4">No analytics events yet.</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Report Viewed</p>
                  <p className="text-xl font-bold text-warm-900">{summary.funnelCounts.reportViewed}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Affiliate Click Started</p>
                  <p className="text-xl font-bold text-warm-900">{summary.funnelCounts.affiliateClickStarted}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Affiliate Click Saved</p>
                  <p className="text-xl font-bold text-warm-900">{summary.funnelCounts.affiliateClickSaved}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Contractor Form Opened</p>
                  <p className="text-xl font-bold text-warm-900">{summary.funnelCounts.contractorFormOpened}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Contractor Lead Submitted</p>
                  <p className="text-xl font-bold text-warm-900">{summary.funnelCounts.contractorLeadSubmitted}</p>
                </div>
                <div className="p-3 rounded-lg border border-warm-200 bg-warm-50">
                  <p className="text-xs text-warm-500">Contractor Lead Saved</p>
                  <p className="text-xl font-bold text-warm-900">{summary.funnelCounts.contractorLeadSaved}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="p-4 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Report views → affiliate clicks</p>
                  <p className="text-2xl font-bold text-brand-700 mt-1">{summary.funnelConversion.reportToAffiliatePercent}%</p>
                </div>
                <div className="p-4 rounded-lg border border-brand-200 bg-brand-50">
                  <p className="text-xs text-warm-500">Report views → contractor leads</p>
                  <p className="text-2xl font-bold text-brand-700 mt-1">{summary.funnelConversion.reportToContractorPercent}%</p>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-warm-900 mb-4">Clicks by Product / Category</h2>
                <div className="space-y-2 max-h-80 overflow-auto">
                  {summary.clicksByProductCategory.length === 0 && (
                    <p className="text-sm text-warm-500">No affiliate clicks yet.</p>
                  )}
                  {summary.clicksByProductCategory.map((item) => (
                    <div key={`${item.category}:${item.productName}`} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                      <div>
                        <p className="text-sm font-medium text-warm-900">{item.productName}</p>
                        <p className="text-xs text-warm-500">{item.category}</p>
                      </div>
                      <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-warm-900 mb-4">Leads by Zip Code</h2>
                <div className="space-y-2 max-h-80 overflow-auto">
                  {summary.leadsByZipCode.length === 0 && (
                    <p className="text-sm text-warm-500">No contractor leads yet.</p>
                  )}
                  {summary.leadsByZipCode.map((item) => (
                    <div key={item.zipCode} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                      <span className="text-sm font-medium text-warm-900">{item.zipCode}</span>
                      <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-warm-900 mb-4">Beta Waitlist Interest</h2>
                  {summary.betaWaitlist.recent.length === 0 && (
                    <p className="text-sm text-warm-500">No beta waitlist signups yet.</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-warm-200 text-left text-warm-500">
                          <th className="py-2 pr-4">Email</th>
                          <th className="py-2 pr-4">Name</th>
                          <th className="py-2 pr-4">Role</th>
                          <th className="py-2 pr-4">Zip</th>
                          <th className="py-2">Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.betaWaitlist.recent.map((signup) => (
                          <tr key={signup.id} className="border-b border-warm-100">
                            <td className="py-2 pr-4 text-warm-900">{signup.email}</td>
                            <td className="py-2 pr-4 text-warm-700">{signup.name || "-"}</td>
                            <td className="py-2 pr-4 text-warm-700">{signup.role || "-"}</td>
                            <td className="py-2 pr-4 text-warm-700">{signup.zipCode || "-"}</td>
                            <td className="py-2 text-warm-700">{new Date(signup.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="w-full md:w-72">
                  <h3 className="text-sm font-semibold text-warm-900 mb-3">Waitlist by Zip Code</h3>
                  <div className="space-y-2 max-h-72 overflow-auto">
                    {summary.betaWaitlist.byZipCode.length === 0 && (
                      <p className="text-sm text-warm-500">No ZIP data yet.</p>
                    )}
                    {summary.betaWaitlist.byZipCode.map((item) => (
                      <div key={item.zipCode} className="flex items-center justify-between p-3 rounded-lg border border-warm-200 bg-warm-50">
                        <span className="text-sm font-medium text-warm-900">{item.zipCode}</span>
                        <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">Recent Contractor Leads</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200 text-left text-warm-500">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2 pr-4">Zip</th>
                      <th className="py-2 pr-4">Preferred</th>
                      <th className="py-2 pr-4">Session</th>
                      <th className="py-2">Ops</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentContractorLeads.length === 0 && (
                      <tr>
                        <td className="py-3 text-warm-500" colSpan={7}>
                          No recent leads.
                        </td>
                      </tr>
                    )}
                    {summary.recentContractorLeads.map((lead) => (
                      <tr key={lead.id} className="border-b border-warm-100 align-top">
                        <td className="py-2 pr-4 text-warm-900">{lead.name}</td>
                        <td className="py-2 pr-4 text-warm-700">{lead.email}</td>
                        <td className="py-2 pr-4 text-warm-700">{lead.phone || "-"}</td>
                        <td className="py-2 pr-4 text-warm-700">{lead.zipCode}</td>
                        <td className="py-2 pr-4 text-warm-700">{lead.preferredContact}</td>
                        <td className="py-2 pr-4 text-warm-700">{lead.sessionId || "-"}</td>
                        <td className="py-2 text-warm-700">
                          <div className="space-y-2 min-w-[280px]">
                            <p>{new Date(lead.createdAt).toLocaleString()}</p>
                            <p className="text-xs text-warm-500">
                              Urgency: {lead.projectUrgency || "-"} | Budget: {lead.estimatedBudget || "-"}
                            </p>
                            <div className="flex items-center gap-2">
                              <select
                                value={ensureLeadDraft(lead).status}
                                onChange={(e) =>
                                  updateLeadDraft(lead.id, {
                                    status: e.target.value as "new" | "contacted" | "qualified" | "rejected" | "converted",
                                  })
                                }
                                className="text-xs border border-warm-200 rounded px-2 py-1 bg-white"
                              >
                                <option value="new">new</option>
                                <option value="contacted">contacted</option>
                                <option value="qualified">qualified</option>
                                <option value="rejected">rejected</option>
                                <option value="converted">converted</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => void handleSaveLeadOps(lead.id)}
                                disabled={savingLeadId === lead.id}
                                className="text-xs text-brand-700 hover:text-brand-800 disabled:opacity-60"
                              >
                                {savingLeadId === lead.id ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLead(lead.id)}
                                disabled={deletingLeadId === lead.id}
                                className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                              >
                                {deletingLeadId === lead.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                            <textarea
                              value={ensureLeadDraft(lead).internalNotes}
                              onChange={(e) => updateLeadDraft(lead.id, { internalNotes: e.target.value })}
                              placeholder="Internal notes..."
                              className="w-full text-xs border border-warm-200 rounded px-2 py-1.5 bg-white"
                              rows={2}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
