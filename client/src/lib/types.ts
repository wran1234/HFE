export type MobilityLevel = "independent" | "cane" | "walker" | "wheelchair";
export type UrgencyLevel = "immediate" | "30-days" | "90-days" | "recommended";
export type HouseType = "single-story" | "multi-story" | "apartment" | "condo";
export type RoomId =
  | "entryway"
  | "living_room"
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "stairs"
  | "exterior_entry";

export interface UserProfile {
  assessmentFor: "self" | "family";
  subjectName?: string;
  age: number;
  livesAlone: boolean;
  mobilityLevel: MobilityLevel;
  fallHistoryCount: number;
  visionImpaired: boolean;
  medicationCount: number;
  houseType: HouseType;
  hasStairs: boolean;
  hasOutdoorSteps: boolean;
  nightBathroomTrips?: boolean;
  seniorProfile?: SeniorProfile;
  consent?: ConsentState;
  pilotCohortId?: string;
  referralId?: string;
  referralCode?: string;
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
  sessionId?: string;
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
  relatedRoom?: RoomId;
  relatedObservationIds?: string[];
}

export interface FamilyDashboard {
  overallIndependenceRisk: IndependenceRiskLevel;
  topUrgentActions: IndependencePlanItem[];
  completedActionCount: number;
  pendingActionCount: number;
  roomRiskOverview: Array<{ roomType: RoomId; risk: IndependenceRiskLevel; openIssueCount: number }>;
  nextRecommendedFamilyCheckIn: string;
  emergencyPlanSummary: string;
  caregiverSupportSuggestions: string[];
  dignityFocusedCopy: string;
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
  seniorProfileSummary: string;
  topRiskDrivers: string[];
  topRecommendedInterventions: string[];
  interventionPriorityList: string[];
  estimatedServiceCategoriesNeeded: string[];
  beforeAfterSupport: { before: string; after: string };
  disclaimer: string;
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
  id: string;
  sessionId: string;
  reviewStatus: AssessmentReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  confidenceLevel: ReviewConfidenceLevel;
  flaggedIssues?: string[];
  createdAt: string;
  updatedAt: string;
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
  partnerDisplayName?: string;
  cohortName?: string;
}

export interface SuggestedServiceRequest {
  serviceType: ServiceType;
  title: string;
  description: string;
  priority: IndependencePlanPriority;
  recommendationActionId?: string;
  whyThisHelps: string;
}

export interface HazardObservation {
  id: string;
  room: RoomId;
  hazardType?: string;
  category: string;
  location: string;
  hazard: string;
  risk: string;
  recommendation: string;
  severityScore: number;
  adjustedSeverity: number;
  fallProbability: number;
  urgency: UrgencyLevel;
  costMin: number;
  costMax: number;
  riskReductionPercent: number;
  isDIY: boolean;
  trade?: string;
  priority: "high" | "medium" | "low";
  timestamp: number;
  snapshotBase64?: string;
  evidenceImageUrl?: string;
}

export interface SnapshotData {
  hazardId: string;
  base64: string;
  label: string;
  room: RoomId;
}

export const ROOM_NAMES: Record<RoomId, string> = {
  entryway: "Entryway",
  living_room: "Living Room",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  stairs: "Stairs",
  exterior_entry: "Exterior Entry",
};

export const ALL_ROOM_SEQUENCE: RoomId[] = [
  "entryway",
  "living_room",
  "bedroom",
  "bathroom",
  "kitchen",
  "stairs",
  "exterior_entry",
];

export function buildRoomSequence(profile: UserProfile): RoomId[] {
  const rooms: RoomId[] = ["entryway", "living_room", "bedroom", "bathroom", "kitchen"];
  if (profile.hasStairs || profile.houseType === "multi-story") {
    rooms.push("stairs");
  }
  if (profile.hasOutdoorSteps || profile.houseType !== "apartment") {
    rooms.push("exterior_entry");
  }
  return rooms;
}

export interface AssessmentReport {
  sessionId?: string;
  profile: UserProfile;
  observations: HazardObservation[];
  snapshots: SnapshotData[];
  aiSummary: string;
  generatedAt: number;
  seniorProfile?: SeniorProfile;
  independenceRiskScore?: IndependenceRiskScore;
  independencePlan?: IndependencePlanItem[];
  familyDashboard?: FamilyDashboard;
  memorySupportChecklist?: MemorySupportChecklist;
  preventionSummary?: PreventionSummary;
  exportablePreventionSummary?: ExportablePreventionSummary;
  consent?: ConsentState;
  assessmentReview?: AssessmentReview;
}
