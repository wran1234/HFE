import {
  CareNote,
  CareNoteAuthorRole,
  CareNoteSummary,
  CareNoteType,
  AssessmentReview,
  AssessmentReviewStatus,
  EvidenceUploaderRole,
  ExportablePreventionSummary,
  FollowUpCheckIn,
  FollowUpCheckInStatus,
  FollowUpCheckInType,
  IndependencePlanOwner,
  IndependencePlanPriority,
  PartnerOrganization,
  PartnerOrganizationType,
  PartnerReferral,
  PartnerReferralInviteType,
  PartnerReferralStatus,
  PilotCohort,
  PilotCohortStatus,
  RecommendationActionStatus,
  RecommendationEvidence,
  RecommendationEvidenceType,
  RoomId,
  SeniorProfile,
  ServiceRequest,
  ServiceRequesterRole,
  ServiceRequestStatus,
  ServiceType,
  SuggestedServiceRequest,
  ReviewConfidenceLevel,
} from "./types";

const jsonHeaders = { "Content-Type": "application/json", "x-hfe-csrf": "same-origin" };

type ApiFetchInit = RequestInit & { timeoutMs?: number };

export async function apiFetch(path: string, init?: ApiFetchInit): Promise<unknown> {
  const controller = new AbortController();
  const { timeoutMs = 10_000, ...requestInit } = init ?? {};
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      ...requestInit,
      headers: { ...jsonHeaders, ...(requestInit.headers ?? {}) },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Request failed: ${response.status}`);
    }
    return response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function createInspectionSession(payload: {
  residentAge: number;
  mobilityAid: "none" | "cane" | "walker" | "wheelchair";
  fallHistory: number;
  nightBathroomTrips: boolean;
  city?: string;
  seniorProfile?: Partial<SeniorProfile>;
  consent?: {
    consentAccepted: boolean;
    consentVersion?: string;
    recordingPermissionConfirmed: boolean;
    shareWithCareCoordinator: boolean;
    shareWithContractor: boolean;
    shareWithInsurer: boolean;
  };
  pilotCohortId?: string;
  referralId?: string;
}) {
  return apiFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ session: { id: string } }>;
}

export async function markRoomProgress(
  sessionId: string,
  roomType: RoomId,
  payload: {
    capturedViews: string[];
    missingViews: string[];
    coverageStatus: "not_started" | "in_progress" | "covered" | "skipped";
  }
) {
  const response = await fetch(`/api/sessions/${sessionId}/rooms/${roomType}/progress`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to update room progress");
  return response.json();
}

export async function fetchReport(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/report`);
  if (!response.ok) throw new Error("Report unavailable");
  return response.json() as Promise<{ report: unknown }>;
}

export async function uploadRoomPhotoEvidence(sessionId: string, input: {
  roomType: RoomId;
  viewKey: string;
  base64Image: string;
  concerns: string[];
}) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/photo-evidence`, {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 45_000,
  }) as Promise<{
    photo: { storageKey: string; publicUrl: string; evidenceAssetId: string };
    roomScan: unknown;
    observations: unknown[];
    detectedHazardCount: number;
  }>;
}

export async function finalizeInspectionSession(sessionId: string, allowIncomplete = false) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/finalize`, {
    method: "POST",
    body: JSON.stringify({ allowIncomplete }),
  }) as Promise<{ report: unknown }>;
}

export async function listSessions(params?: { limit?: number; cursor?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  return apiFetch(`/api/sessions${qs.size ? `?${qs}` : ""}`) as Promise<{
    sessions: Array<{
      id: string;
      createdAt: string;
      startedAt: string;
      status: string;
      city?: string;
      currentRoom?: string;
      overallRiskLevel?: string;
      reportAvailable: boolean;
    }>;
    nextCursor: string | null;
  }>;
}

export async function listReports(params?: { limit?: number; cursor?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  return apiFetch(`/api/reports${qs.size ? `?${qs}` : ""}`) as Promise<{
    reports: Array<{
      sessionId: string;
      createdAt: string;
      riskLevel?: string;
      hazardCount?: number;
      roomCount?: number;
      summary?: string;
    }>;
    nextCursor: string | null;
  }>;
}

export async function getRevenueSummary() {
  return apiFetch("/api/admin/revenue-summary") as Promise<{
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
  }>;
}

export async function listCareNotes(sessionId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/care-notes`) as Promise<{ notes: CareNote[] }>;
}

export async function addCareNote(sessionId: string, input: {
  noteType: CareNoteType;
  authorName?: string;
  authorRole: CareNoteAuthorRole;
  body: string;
  observedChanges?: string;
  concerns?: string;
  followUpNeeded: boolean;
}) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/care-notes`, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ note: CareNote }>;
}

export async function getCareNoteSummary(sessionId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/care-notes/summary`) as Promise<{ summary: CareNoteSummary }>;
}

export async function updateRecommendationStatus(
  sessionId: string,
  recommendationId: string,
  input: RecommendationActionStatus | {
    actionStatus?: RecommendationActionStatus;
    actionOwner?: IndependencePlanOwner;
    actionPriority?: IndependencePlanPriority;
    dueDate?: string | null;
    skippedReason?: string | null;
    estimatedPreventionImpact?: "low" | "medium" | "high";
  }
) {
  const body = typeof input === "string" ? { actionStatus: input } : input;
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/recommendations/${encodeURIComponent(recommendationId)}/status`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as Promise<{ ok: true }>;
}

export async function listRecommendationEvidence(sessionId: string, recommendationId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/recommendations/${encodeURIComponent(recommendationId)}/evidence`) as Promise<{ evidence: RecommendationEvidence[] }>;
}

export async function addRecommendationEvidence(sessionId: string, recommendationId: string, input: {
  evidenceType: RecommendationEvidenceType;
  note?: string;
  imageUrl?: string;
  uploadedByRole: EvidenceUploaderRole;
}) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/recommendations/${encodeURIComponent(recommendationId)}/evidence`, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ evidence: RecommendationEvidence }>;
}

export async function getPreventionSummary(sessionId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/prevention-summary`) as Promise<{ summary: ExportablePreventionSummary }>;
}

export async function listServiceRequests(sessionId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/service-requests`) as Promise<{ serviceRequests: ServiceRequest[] }>;
}

export async function createServiceRequest(sessionId: string, input: {
  recommendationActionId?: string;
  serviceType: ServiceType;
  title: string;
  description: string;
  priority: "immediate" | "this_week" | "this_month" | "monitor";
  requestedByRole: ServiceRequesterRole;
  requestedByName?: string;
  status?: ServiceRequestStatus;
  preferredDate?: string;
  scheduledAt?: string;
  providerName?: string;
  providerContact?: string;
  notes?: string;
}) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/service-requests`, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ serviceRequest: ServiceRequest }>;
}

export async function generateServiceRequestSuggestions(sessionId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/service-requests/generate-suggestions`, {
    method: "POST",
    body: JSON.stringify({}),
  }) as Promise<{ suggestions: SuggestedServiceRequest[]; existingRequests: ServiceRequest[] }>;
}

export async function updateServiceRequest(id: string, input: {
  status?: ServiceRequestStatus;
  priority?: "immediate" | "this_week" | "this_month" | "monitor";
  preferredDate?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  providerName?: string | null;
  providerContact?: string | null;
  notes?: string | null;
  serviceQualityRating?: number | null;
  familyFeedback?: string | null;
  providerFollowupNeeded?: boolean;
  completionVerified?: boolean;
  completionVerifiedAt?: string | null;
  completionVerifiedBy?: string | null;
}) {
  return apiFetch(`/api/service-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<{ serviceRequest: ServiceRequest }>;
}

export async function updateAssessmentReview(sessionId: string, input: {
  reviewStatus: AssessmentReviewStatus;
  confidenceLevel: ReviewConfidenceLevel;
  reviewerNotes?: string;
  reviewedBy?: string;
  flaggedIssues?: string[];
}) {
  return apiFetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/assessment-review`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<{ review: AssessmentReview }>;
}

export interface PilotCohortDashboardResponse {
  partnerOrganizations: PartnerOrganization[];
  unassignedSessions: Array<{ id: string; parentLabel: string; createdAt: string; riskLevel?: string }>;
  cohorts: Array<{
    partner: PartnerOrganization;
    cohort: PilotCohort;
    metrics: {
      totalHouseholds: number;
      assessmentsCompleted: number;
      highUrgentRiskPercentage: number;
      averageRecommendationsPerAssessment: number;
      actionCompletionRate: number;
      immediateActionCompletionRate: number;
      evidenceAttachmentRate: number;
      serviceRequestGenerationRate?: number;
      serviceRequestCompletionRate?: number;
      verifiedCompletionRate?: number;
      averageServiceRating?: number;
      careNoteUsageRate: number;
      memorySupportFlaggedPercentage: number;
      contractorLeadConversionRate: number;
      assessmentReviewCompletionRate: number;
      followUps: {
        scheduled: number;
        completed: number;
        missed: number;
        cancelled: number;
        selfReportedNewFalls: number;
        selfReportedNearFalls: number;
        selfReportedHospitalVisits: number;
        caregiverSupportAdded: number;
        majorHomeFixCompleted: number;
        medicationRoutineImproved: number;
        familiesFeelingSafer: number;
        familiesFeelingMorePrepared: number;
        careCoordinatorFollowupRequested: number;
      };
      intake?: {
        created: number;
        opened: number;
        startedOnboarding: number;
        consentCompleted: number;
        assessmentCompleted: number;
        reportGenerated: number;
        inactiveOrCancelled: number;
        openedToReportGeneratedRate: number;
      };
    };
    households: Array<{
      sessionId: string;
      parentLabel: string;
      riskLevel: string;
      topRiskDriver: string;
      pendingImmediateActions: number;
      lastCareNoteDate?: string;
      reportUrl: string;
      openServiceRequestsCount?: number;
      serviceStatusSummary?: string;
      reviewStatus?: AssessmentReviewStatus;
      consentAccepted: boolean;
      shareWithCareCoordinator: boolean;
      shareWithContractor: boolean;
      shareWithInsurer: boolean;
      sharingAuthorized: boolean;
      preventionSummaryUrl: string;
      upcomingFollowUpDate?: string;
      upcomingFollowUpId?: string;
      missedFollowUpCount: number;
    }>;
  }>;
}

export async function getPilotCohorts() {
  return apiFetch("/api/admin/pilot-cohorts") as Promise<PilotCohortDashboardResponse>;
}

export async function getDemoPilotShortcuts() {
  return apiFetch("/api/admin/demo-pilot") as Promise<
    | { demoAvailable: false }
    | {
        demoAvailable: true;
        partnerName: string;
        cohortName: string;
        cohortId: string;
        cohortReportUrl: string;
        referralUrl?: string;
        highRiskReportUrl?: string;
        completedImprovementReportUrl?: string;
      }
  >;
}

export async function getReferral(code: string) {
  return apiFetch(`/api/referrals/${encodeURIComponent(code)}`) as Promise<{ referral: PartnerReferral }>;
}

export async function updateReferralStatus(code: string, status: PartnerReferralStatus) {
  return apiFetch(`/api/referrals/${encodeURIComponent(code)}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  }) as Promise<{ referral: PartnerReferral }>;
}

export async function getPartnerReferrals() {
  return apiFetch("/api/admin/partner-referrals") as Promise<{
    referrals: Array<PartnerReferral & { partnerName: string; cohortName?: string; referralUrl: string }>;
    metrics: {
      created: number;
      opened: number;
      startedOnboarding: number;
      consentCompleted: number;
      assessmentCompleted: number;
      reportGenerated: number;
      inactiveOrCancelled: number;
      openedToReportGeneratedRate: number;
    };
  }>;
}

export async function createPartnerReferral(input: {
  partnerOrganizationId: string;
  pilotCohortId?: string;
  inviteType: PartnerReferralInviteType;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  seniorName?: string;
  sourceLabel?: string;
  notes?: string;
}) {
  return apiFetch("/api/admin/partner-referrals", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ referral: PartnerReferral; referralUrl: string }>;
}

export async function cancelPartnerReferral(id: string) {
  return apiFetch(`/api/admin/partner-referrals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled" }),
  }) as Promise<{ referral: PartnerReferral }>;
}

export async function createPartnerOrganization(input: {
  name: string;
  organizationType: PartnerOrganizationType;
  displayName?: string;
  logoUrl?: string;
  primaryContact?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}) {
  return apiFetch("/api/admin/partner-organizations", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ partner: PartnerOrganization }>;
}

export async function createPilotCohort(input: {
  partnerOrganizationId: string;
  name: string;
  status?: PilotCohortStatus;
  description?: string;
  startDate?: string;
  endDate?: string;
  targetHouseholds?: number;
  consentVersion?: string;
  notes?: string;
}) {
  return apiFetch("/api/admin/pilot-cohorts", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ cohort: PilotCohort }>;
}

export async function assignSessionToPilotCohort(sessionId: string, pilotCohortId: string | null) {
  return apiFetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/pilot-cohort`, {
    method: "PATCH",
    body: JSON.stringify({ pilotCohortId }),
  }) as Promise<{ session: unknown }>;
}

export async function scheduleFollowUpCheckIn(input: {
  sessionId: string;
  pilotCohortId?: string;
  checkInType: FollowUpCheckInType;
  scheduledFor: string;
  notes?: string;
}) {
  return apiFetch("/api/admin/follow-up-check-ins", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ followUp: FollowUpCheckIn }>;
}

export async function updateFollowUpCheckIn(id: string, input: {
  status?: FollowUpCheckInStatus;
  completedAt?: string | null;
  notes?: string | null;
  newFallsReported?: boolean | null;
  nearFallsReported?: boolean | null;
  newHospitalVisitReported?: boolean | null;
  newCaregiverSupportAdded?: boolean | null;
  majorHomeFixCompleted?: boolean | null;
  medicationRoutineImproved?: boolean | null;
  parentFeelsSafer?: "yes" | "somewhat" | "no" | "unsure" | null;
  familyFeelsMorePrepared?: "yes" | "somewhat" | "no" | "unsure" | null;
  currentBiggestConcern?: string | null;
  requestCareCoordinatorFollowup?: boolean;
}) {
  return apiFetch(`/api/admin/follow-up-check-ins/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<{ followUp: FollowUpCheckIn }>;
}

export async function listFamilyFollowUps(sessionId: string) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/follow-up-check-ins`) as Promise<{ followUps: FollowUpCheckIn[] }>;
}

export async function submitFamilyFollowUp(sessionId: string, followUpId: string, input: {
  anyNewFalls: boolean;
  anyNearFalls?: boolean;
  anyHospitalVisit: boolean;
  majorHomeFixCompleted: boolean;
  caregiverSupportAdded: boolean;
  medicationRoutineImproved?: boolean;
  parentFeelsSafer: "yes" | "somewhat" | "no" | "unsure";
  familyFeelsMorePrepared: "yes" | "somewhat" | "no" | "unsure";
  notes?: string;
  currentBiggestConcern?: string;
  requestCareCoordinatorFollowup: boolean;
}) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/follow-up-check-ins/${encodeURIComponent(followUpId)}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ followUp: FollowUpCheckIn }>;
}

export async function getFollowUpAttentionQueue() {
  return apiFetch("/api/admin/follow-up-attention-queue") as Promise<{ queue: Array<{
    followUpId: string;
    sessionId: string;
    cohortName?: string;
    riskLevel: string;
    checkInType: string;
    issueReported: string;
    lastSubmittedDate?: string;
    requestedFollowup: boolean;
    reportUrl: string;
  }> }>;
}

export async function trackAnalyticsEvent(input: {
  eventName: "report_viewed" | "affiliate_click_started" | "affiliate_click_saved" | "contractor_form_opened" | "contractor_lead_submitted" | "contractor_lead_saved" | "beta_waitlist_joined";
  sessionId?: string;
  reportId?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch("/api/analytics/events", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ ok: true }>;
}

export async function joinBetaWaitlist(input: {
  email: string;
  name?: string;
  role?: string;
  zipCode?: string;
  source?: string;
}) {
  return apiFetch("/api/beta-waitlist", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ ok: true; id: string; alreadyJoined?: boolean }>;
}

export async function deleteContractorLead(id: string) {
  return apiFetch(`/api/admin/contractor-leads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }) as Promise<{ ok: true }>;
}

export interface ContractorSuggestion {
  id: string;
  trade: string;
  zipCode: string;
  provider: string;
  name: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  phone?: string;
  websiteUrl?: string;
  profileUrl?: string;
  sourceUrl?: string;
  status: string;
  createdAt: string;
}

export async function findContractorSuggestions(sessionId: string, input: {
  zipCode: string;
  trades: string[];
  refresh?: boolean;
}) {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/contractor-suggestions`, {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 20_000,
  }) as Promise<{ suggestions: ContractorSuggestion[]; cached: boolean; source?: string }>;
}

export async function updateContractorLeadOps(
  id: string,
  input: {
    status?: "new" | "contacted" | "qualified" | "rejected" | "converted";
    internalNotes?: string;
  }
) {
  return apiFetch(`/api/admin/contractor-leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<{ ok: true }>;
}
