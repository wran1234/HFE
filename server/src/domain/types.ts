import {
  CoverageStatus,
  HazardType,
  MobilityAid,
  ObservationStatus,
  RecommendationPriority,
  RoomType,
  SessionStatus,
  SeverityLevel,
} from "./enums";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface Home {
  id: string;
  userId: string;
  city?: string;
  createdAt: string;
}

export interface InspectionSession {
  id: string;
  userId: string;
  homeId: string;
  status: SessionStatus;
  residentAge: number;
  mobilityAid: MobilityAid;
  fallHistory: number;
  nightBathroomTrips: boolean;
  city?: string;
  startedAt: string;
  endedAt?: string;
  overallRiskLevel?: SeverityLevel;
  currentRoom?: RoomType;
  skippedRooms: RoomType[];
  conversationHistory?: Array<{ role: string; parts: Array<{ text?: string }> }>;
  consentAccepted?: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
  recordingPermissionConfirmed?: boolean;
  shareWithCareCoordinator?: boolean;
  shareWithContractor?: boolean;
  shareWithInsurer?: boolean;
  pilotCohortId?: string;
  referralId?: string;
}

export interface RoomScan {
  id: string;
  sessionId: string;
  roomType: RoomType;
  coverageStatus: CoverageStatus;
  requiredViews: string[];
  capturedViews: string[];
  missingViews: string[];
  notes?: string;
}

export interface HazardObservation {
  id: string;
  sessionId: string;
  roomScanId?: string;
  roomType: RoomType;
  hazardType: HazardType;
  severityHint: SeverityLevel;
  evidenceImagePath?: string;
  modelNote: string;
  followUpNeeded: boolean;
  status: ObservationStatus;
  createdAt: string;
}

export interface FinalHazard {
  id: string;
  sessionId: string;
  roomType: RoomType;
  hazardType: HazardType;
  severity: SeverityLevel;
  reason: string;
  priority: RecommendationPriority;
  evidenceImagePath?: string;
}

export interface Recommendation {
  id: string;
  sessionId: string;
  finalHazardId: string;
  hazardId: string;
  fixType: string;
  title: string;
  description: string;
  priority: RecommendationPriority;
  estimatedCostMin: number;
  estimatedCostMax: number;
  materials: string[];
  materialsJson: string[];
  installationComplexity: "easy" | "moderate" | "complex";
  actionStatus?: RecommendationActionStatus;
  actionOwner?: IndependencePlanOwner;
  actionPriority?: IndependencePlanPriority;
  dueDate?: string;
  completedAt?: string;
  skippedReason?: string;
  evidenceCount?: number;
  estimatedPreventionImpact?: EstimatedPreventionImpact;
}

export type SeniorAgeRange = "under_65" | "65_74" | "75_84" | "85_plus" | "unknown";
export type LivingArrangement = "alone" | "with_spouse" | "with_family" | "assisted_living" | "other" | "unknown";
export type SeniorMobilityLevel = "independent" | "cane_walker" | "needs_help" | "wheelchair" | "mostly_bedbound" | "unknown";
export type PriorFalls = "none" | "one" | "multiple" | "unknown";
export type ComplexityLevel = "low" | "medium" | "high" | "unknown";
export type MemoryConcerns = "none" | "mild" | "moderate" | "severe" | "unknown";
export type IndependenceRiskLevel = "low" | "moderate" | "high" | "urgent";
export type RecommendationActionStatus = "pending" | "in_progress" | "completed" | "skipped";
export type IndependencePlanPriority = "immediate" | "this_week" | "this_month" | "monitor";
export type IndependencePlanOwner = "family" | "caregiver" | "contractor" | "clinician" | "insurer_or_care_coordinator";
export type CareNoteType = "family_check_in" | "caregiver_visit" | "contractor_update" | "clinician_note" | "other";
export type CareNoteAuthorRole = "family" | "caregiver" | "contractor" | "clinician" | "admin" | "other";
export type EstimatedPreventionImpact = "low" | "medium" | "high";
export type RecommendationEvidenceType = "before_photo" | "after_photo" | "note" | "contractor_update" | "caregiver_update" | "other";
export type EvidenceUploaderRole = "family" | "caregiver" | "contractor" | "admin" | "other";
export type ServiceType = "home_modification" | "caregiver_visit" | "rehab_evaluation" | "smart_monitoring" | "clinician_followup" | "family_checkin" | "memory_support" | "other";
export type ServiceRequestStatus = "draft" | "requested" | "matched" | "scheduled" | "completed" | "cancelled";
export type ServiceRequesterRole = "family" | "care_coordinator" | "contractor" | "caregiver" | "admin" | "other";
export type AssessmentReviewStatus = "not_reviewed" | "reviewed" | "needs_followup" | "rejected";
export type ReviewConfidenceLevel = "low" | "medium" | "high";
export type PartnerOrganizationType = "insurer" | "home_care_agency" | "care_coordinator" | "contractor_partner" | "local_government" | "employer_benefit" | "other";
export type PilotCohortStatus = "draft" | "active" | "paused" | "completed";
export type FollowUpCheckInType = "thirty_day" | "sixty_day" | "ninety_day" | "custom";
export type FollowUpCheckInStatus = "scheduled" | "completed" | "missed" | "cancelled";
export type PartnerReferralInviteType = "general_link" | "family_invite" | "care_coordinator_invite" | "contractor_invite" | "employer_benefit" | "insurer_member" | "other";
export type PartnerReferralStatus = "created" | "sent" | "opened" | "started_onboarding" | "consent_completed" | "assessment_completed" | "report_generated" | "inactive" | "cancelled";

export interface ConsentState {
  consentAccepted: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
  recordingPermissionConfirmed: boolean;
  shareWithCareCoordinator: boolean;
  shareWithContractor: boolean;
  shareWithInsurer: boolean;
}

export interface SeniorProfile {
  sessionId: string;
  seniorName?: string;
  relationshipToUser?: string;
  ageRange: SeniorAgeRange;
  livingArrangement: LivingArrangement;
  mobilityLevel: SeniorMobilityLevel;
  priorFalls: PriorFalls;
  chronicConditions?: string[];
  medicationComplexity: ComplexityLevel;
  memoryConcerns: MemoryConcerns;
  visionConcerns?: boolean;
  hearingConcerns?: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  primaryCaregiver?: string;
}

export interface IndependenceRiskScore {
  overallIndependenceRisk: IndependenceRiskLevel;
  fallRisk: IndependenceRiskLevel;
  dailyLivingRisk: IndependenceRiskLevel;
  caregiverBurdenRisk: IndependenceRiskLevel;
  cognitiveSupportRisk: IndependenceRiskLevel;
  explanationBullets: string[];
  nonMedicalDisclaimer: string;
}

export interface IndependencePlanItem {
  id: string;
  section: string;
  title: string;
  whyItMatters: string;
  recommendedAction: string;
  priority: IndependencePlanPriority;
  owner: IndependencePlanOwner;
  status: RecommendationActionStatus;
  dueDate?: string;
  completedAt?: string;
  skippedReason?: string;
  evidenceCount?: number;
  estimatedPreventionImpact?: EstimatedPreventionImpact;
  relatedRoom?: RoomType;
  relatedObservationIds?: string[];
}

export interface MemorySupportChecklist {
  show: boolean;
  title: string;
  education: string;
  checklistItems: string[];
  routineSuggestions: string[];
  homeSafetySuggestions: string[];
  familyCommunicationTips: string[];
  disclaimer: string;
}

export interface PreventionSummary {
  audience: Array<"insurer" | "care_coordinator" | "home_care_agency" | "contractor" | "family">;
  seniorProfileSummary: string;
  topRiskDrivers: string[];
  topRecommendedInterventions: string[];
  interventionPriorityList: string[];
  estimatedServiceCategoriesNeeded: Array<
    "home_modification" | "caregiver_visit" | "rehab_evaluation" | "smart_monitoring" | "clinician_followup" | "family_checkin"
  >;
  beforeAfterSupport: {
    before: string;
    after: string;
  };
  disclaimer: string;
}

export interface FamilyDashboard {
  overallIndependenceRisk: IndependenceRiskLevel;
  topUrgentActions: IndependencePlanItem[];
  completedActionCount: number;
  pendingActionCount: number;
  roomRiskOverview: Array<{ roomType: RoomType; risk: IndependenceRiskLevel; openIssueCount: number }>;
  nextRecommendedFamilyCheckIn: string;
  emergencyPlanSummary: string;
  caregiverSupportSuggestions: string[];
  dignityFocusedCopy: string;
}

export interface CareNote {
  id: string;
  sessionId: string;
  noteType: CareNoteType;
  authorName?: string;
  authorRole: CareNoteAuthorRole;
  body: string;
  observedChanges?: string;
  concerns?: string;
  followUpNeeded: boolean;
  createdAt: string;
}

export interface CareNoteSummary {
  whatChanged: string[];
  whatNeedsAttention: string[];
  nextRecommendedAction: string;
  disclaimer: string;
}

export interface RecommendationEvidence {
  id: string;
  sessionId: string;
  recommendationActionId: string;
  evidenceType: RecommendationEvidenceType;
  imageUrl?: string;
  note?: string;
  uploadedByRole: EvidenceUploaderRole;
  createdAt: string;
}

export interface ExportablePreventionSummary {
  sessionId: string;
  generatedAt: string;
  seniorProfileSummary: string;
  risks: {
    overallIndependenceRisk: IndependenceRiskLevel;
    fallRisk: IndependenceRiskLevel;
    dailyLivingRisk: IndependenceRiskLevel;
    cognitiveSupportRisk: IndependenceRiskLevel;
    caregiverBurdenRisk: IndependenceRiskLevel;
  };
  topRiskDrivers: string[];
  topRecommendedActions: IndependencePlanItem[];
  completedActionCount: number;
  pendingActionCount: number;
  careNotesSummary: CareNoteSummary;
  contractorHomeModificationNeeds: string[];
  caregiverProfessionalSupportNeeds: string[];
  recommendedServiceCategories?: ServiceType[];
  activeServiceRequests?: ServiceRequest[];
  scheduledOrCompletedServiceRequests?: ServiceRequest[];
  consent?: ConsentState;
  assessmentReview?: AssessmentReview;
  latestFamilyFollowUp?: FollowUpCheckIn;
  progressSummary?: {
    completedActionsCount: number;
    openImmediateActionsCount: number;
    serviceRequestsCompleted: number;
    lastFollowUpStatus?: string;
    currentBiggestConcern?: string;
    suggestedNextStep: string;
  };
  nonMedicalDisclaimer: string;
  consentPrivacyNote: string;
}

export interface ServiceRequest {
  id: string;
  sessionId: string;
  recommendationActionId?: string;
  serviceType: ServiceType;
  title: string;
  description: string;
  priority: IndependencePlanPriority;
  requestedByRole: ServiceRequesterRole;
  requestedByName?: string;
  status: ServiceRequestStatus;
  preferredDate?: string;
  scheduledAt?: string;
  completedAt?: string;
  providerName?: string;
  providerContact?: string;
  notes?: string;
  serviceQualityRating?: number;
  familyFeedback?: string;
  providerFollowupNeeded: boolean;
  completionVerified: boolean;
  completionVerifiedAt?: string;
  completionVerifiedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentReview {
  sessionId: string;
  reviewStatus: AssessmentReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  confidenceLevel: ReviewConfidenceLevel;
  flaggedIssues?: string[];
}

export interface SuggestedServiceRequest {
  serviceType: ServiceType;
  title: string;
  description: string;
  priority: IndependencePlanPriority;
  recommendationActionId?: string;
  whyThisHelps: string;
}

export interface PilotMetrics {
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
}

export interface CareCoordinationRow {
  sessionId: string;
  parentLabel: string;
  riskLevel: IndependenceRiskLevel | string;
  fallRiskLevel?: IndependenceRiskLevel;
  topRiskDriver: string;
  pendingImmediateActions: number;
  lastCareNoteDate?: string;
  contractorLeadStatus?: string;
  reportUrl: string;
  openServiceRequestsCount?: number;
  nextScheduledServiceDate?: string;
  serviceStatusSummary?: string;
  reviewStatus?: AssessmentReviewStatus | string;
  reviewConfidenceLevel?: ReviewConfidenceLevel;
}

export interface PartnerOrganization {
  id: string;
  name: string;
  organizationType: PartnerOrganizationType;
  displayName?: string;
  logoUrl?: string;
  primaryContact?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PilotCohort {
  id: string;
  partnerOrganizationId: string;
  partnerOrganization?: PartnerOrganization;
  name: string;
  description?: string;
  status: PilotCohortStatus;
  startDate?: string;
  endDate?: string;
  targetHouseholds?: number;
  consentVersion?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpCheckIn {
  id: string;
  sessionId: string;
  pilotCohortId?: string;
  checkInType: FollowUpCheckInType;
  status: FollowUpCheckInStatus;
  scheduledFor: string;
  completedAt?: string;
  notes?: string;
  newFallsReported?: boolean;
  nearFallsReported?: boolean;
  newHospitalVisitReported?: boolean;
  newCaregiverSupportAdded?: boolean;
  majorHomeFixCompleted?: boolean;
  medicationRoutineImproved?: boolean;
  parentFeelsSafer?: "yes" | "somewhat" | "no" | "unsure";
  familyFeelsMorePrepared?: "yes" | "somewhat" | "no" | "unsure";
  currentBiggestConcern?: string;
  requestCareCoordinatorFollowup?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerReferral {
  id: string;
  partnerOrganizationId: string;
  pilotCohortId?: string;
  referralCode: string;
  inviteType: PartnerReferralInviteType;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  seniorName?: string;
  status: PartnerReferralStatus;
  sourceLabel?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  startedAt?: string;
  consentCompletedAt?: string;
  assessmentCompletedAt?: string;
  reportGeneratedAt?: string;
}

export interface CohortHouseholdRow extends CareCoordinationRow {
  consentAccepted: boolean;
  shareWithCareCoordinator: boolean;
  shareWithContractor: boolean;
  shareWithInsurer: boolean;
  sharingAuthorized: boolean;
  preventionSummaryUrl: string;
  upcomingFollowUpDate?: string;
  upcomingFollowUpId?: string;
  missedFollowUpCount: number;
}

export interface FollowUpMetrics {
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
}

export interface CohortMetrics extends PilotMetrics {
  totalHouseholds: number;
  assessmentsCompleted: number;
  assessmentReviewCompletionRate: number;
  followUps: FollowUpMetrics;
  intake?: ReferralFunnelMetrics;
}

export interface ReferralFunnelMetrics {
  created: number;
  opened: number;
  startedOnboarding: number;
  consentCompleted: number;
  assessmentCompleted: number;
  reportGenerated: number;
  inactiveOrCancelled: number;
  openedToReportGeneratedRate: number;
}

export interface PilotCohortDashboard {
  cohorts: Array<{
    cohort: PilotCohort;
    partner: PartnerOrganization;
    metrics: CohortMetrics;
    households: CohortHouseholdRow[];
  }>;
  partnerOrganizations: PartnerOrganization[];
}

export interface AssessmentResult {
  sessionId: string;
  overallRiskLevel: SeverityLevel;
  finalHazards: FinalHazard[];
  recommendations: Recommendation[];
  summary: string;
}

export interface SessionContextUpdate {
  residentAge?: number;
  mobilityAid?: MobilityAid;
  fallHistory?: number;
  nightBathroomTrips?: boolean;
  city?: string;
  seniorProfile?: Partial<SeniorProfile>;
  consent?: Partial<ConsentState>;
}

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  role: "user" | "admin";
}

export interface ReportPayload {
  sessionId: string;
  generatedAt: string;
  overallRiskSummary: {
    level: SeverityLevel;
    totalHazards: number;
    highPriorityCount: number;
    summary: string;
  };
  roomBreakdown: Array<{
    roomType: RoomType;
    hazards: FinalHazard[];
  }>;
  recommendations: Recommendation[];
  evidenceImages: Array<{
    hazardId: string;
    imagePath: string;
    roomType: RoomType;
  }>;
  plainLanguageSummary: string;
  seniorProfile?: SeniorProfile;
  independenceRiskScore?: IndependenceRiskScore;
  independencePlan?: IndependencePlanItem[];
  familyDashboard?: FamilyDashboard;
  memorySupportChecklist?: MemorySupportChecklist;
  preventionSummary?: PreventionSummary;
  exportablePreventionSummary?: ExportablePreventionSummary;
  assessmentReview?: AssessmentReview;
  consent?: ConsentState;
  export: {
    schemaVersion: string;
    canRenderPdf: boolean;
  };
}
