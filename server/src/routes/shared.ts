/**
 * Shared utilities, validation sets, and helper functions used across route modules.
 * Extracted from server/src/index.ts to avoid duplication.
 */
import { StorageAdapter } from "../storage/storageAdapter";
import { SeniorProfile, HazardObservation, ReportPayload } from "../domain/types";

// ---------------------------------------------------------------------------
// Validation sets
// ---------------------------------------------------------------------------

export const VALID_ROOM_TYPES_SET = new Set<string>(["entryway", "living_room", "bedroom", "bathroom", "kitchen", "stairs", "exterior_entry"]);
export const VALID_HAZARD_TYPES_SET = new Set<string>(["poor_lighting", "missing_handrail", "slippery_floor", "loose_rug", "clutter_trip_hazard", "narrow_walkway", "high_threshold", "missing_grab_bar", "unsafe_stairs", "uneven_floor", "outdoor_step_risk"]);
export const VALID_SEVERITY_SET = new Set<string>(["low", "medium", "high", "critical"]);
export const VALID_STATUS_SET = new Set<string>(["candidate", "validated", "dismissed"]);
export const VALID_ANALYTICS_EVENT_NAMES = new Set<string>([
  "report_viewed",
  "affiliate_click_started",
  "affiliate_click_saved",
  "contractor_form_opened",
  "contractor_lead_submitted",
  "contractor_lead_saved",
  "beta_waitlist_joined",
]);
export const VALID_LEAD_STATUS = new Set<string>(["new", "contacted", "qualified", "rejected", "converted"]);
export const VALID_PROJECT_URGENCY = new Set<string>(["immediately", "within_30_days", "within_3_months", "just_researching"]);
export const VALID_ESTIMATED_BUDGET = new Set<string>(["under_500", "500_2000", "2000_5000", "over_5000", "unsure"]);
export const VALID_AGE_RANGE = new Set<string>(["under_65", "65_74", "75_84", "85_plus", "unknown"]);
export const VALID_LIVING_ARRANGEMENT = new Set<string>(["alone", "with_spouse", "with_family", "assisted_living", "other", "unknown"]);
export const VALID_SENIOR_MOBILITY = new Set<string>(["independent", "cane_walker", "needs_help", "wheelchair", "mostly_bedbound", "unknown"]);
export const VALID_PRIOR_FALLS = new Set<string>(["none", "one", "multiple", "unknown"]);
export const VALID_COMPLEXITY = new Set<string>(["low", "medium", "high", "unknown"]);
export const VALID_MEMORY_CONCERNS = new Set<string>(["none", "mild", "moderate", "severe", "unknown"]);
export const VALID_CARE_NOTE_TYPE = new Set<string>(["family_check_in", "caregiver_visit", "contractor_update", "clinician_note", "other"]);
export const VALID_CARE_AUTHOR_ROLE = new Set<string>(["family", "caregiver", "contractor", "clinician", "admin", "other"]);
export const VALID_ACTION_STATUS = new Set<string>(["pending", "in_progress", "completed", "skipped"]);
export const VALID_ACTION_OWNER = new Set<string>(["family", "caregiver", "contractor", "clinician", "insurer_or_care_coordinator"]);
export const VALID_ACTION_PRIORITY = new Set<string>(["immediate", "this_week", "this_month", "monitor"]);
export const VALID_PREVENTION_IMPACT = new Set<string>(["low", "medium", "high"]);
export const VALID_EVIDENCE_TYPE = new Set<string>(["before_photo", "after_photo", "note", "contractor_update", "caregiver_update", "other"]);
export const VALID_EVIDENCE_UPLOADER_ROLE = new Set<string>(["family", "caregiver", "contractor", "admin", "other"]);
export const VALID_SERVICE_TYPE = new Set<string>(["home_modification", "caregiver_visit", "rehab_evaluation", "smart_monitoring", "clinician_followup", "family_checkin", "memory_support", "other"]);
export const VALID_SERVICE_REQUESTER_ROLE = new Set<string>(["family", "care_coordinator", "contractor", "caregiver", "admin", "other"]);
export const VALID_SERVICE_STATUS = new Set<string>(["draft", "requested", "matched", "scheduled", "completed", "cancelled"]);
export const VALID_REVIEW_STATUS = new Set<string>(["not_reviewed", "reviewed", "needs_followup", "rejected"]);
export const VALID_REVIEW_CONFIDENCE = new Set<string>(["low", "medium", "high"]);
export const VALID_PARTNER_ORG_TYPE = new Set<string>(["insurer", "home_care_agency", "care_coordinator", "contractor_partner", "local_government", "employer_benefit", "other"]);
export const VALID_PILOT_COHORT_STATUS = new Set<string>(["draft", "active", "paused", "completed"]);
export const VALID_FOLLOW_UP_TYPE = new Set<string>(["thirty_day", "sixty_day", "ninety_day", "custom"]);
export const VALID_FOLLOW_UP_STATUS = new Set<string>(["scheduled", "completed", "missed", "cancelled"]);
export const VALID_REFERRAL_INVITE_TYPE = new Set<string>(["general_link", "family_invite", "care_coordinator_invite", "contractor_invite", "employer_benefit", "insurer_member", "other"]);
export const VALID_REFERRAL_STATUS = new Set<string>(["created", "sent", "opened", "started_onboarding", "consent_completed", "assessment_completed", "report_generated", "inactive", "cancelled"]);

// ---------------------------------------------------------------------------
// Photo label maps
// ---------------------------------------------------------------------------

export const PHOTO_VIEW_LABELS: Record<string, string> = {
  wide_view: "wide room view",
  walking_path: "main walking path",
  floor_surfaces: "floor, rugs, and thresholds",
  nighttime_path: "nighttime route and lighting",
  transfer_support: "grab bars, handrails, and transfer support",
  stairs: "stairs and railings",
  exterior_entry: "exterior entry and outdoor steps",
  cooking_area: "cooking and counter area",
};

export const PHOTO_CONCERN_LABELS: Record<string, string> = {
  poor_lighting: "poor lighting",
  missing_handrail: "missing handrail",
  slippery_floor: "slippery floor",
  loose_rug: "loose rug",
  clutter_trip_hazard: "clutter or cords in the walking path",
  narrow_walkway: "narrow walkway",
  high_threshold: "raised threshold",
  missing_grab_bar: "missing grab bar",
  unsafe_stairs: "unsafe stairs",
  uneven_floor: "uneven floor",
  outdoor_step_risk: "outdoor step risk",
};

export const PHOTO_CONCERN_DEFAULT_SEVERITY: Record<string, HazardObservation["severityHint"]> = {
  poor_lighting: "medium",
  missing_handrail: "high",
  slippery_floor: "high",
  loose_rug: "medium",
  clutter_trip_hazard: "medium",
  narrow_walkway: "medium",
  high_threshold: "medium",
  missing_grab_bar: "high",
  unsafe_stairs: "high",
  uneven_floor: "medium",
  outdoor_step_risk: "high",
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export const optionalString = (value: unknown, max = 300): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, max) : undefined;
};

export const parseConsentState = (input: unknown) => {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const consentAccepted = Boolean(raw.consentAccepted);
  return {
    consentAccepted,
    consentAcceptedAt: consentAccepted ? new Date().toISOString() : undefined,
    consentVersion: optionalString(raw.consentVersion, 40) ?? "parent-safety-consent-v1",
    recordingPermissionConfirmed: Boolean(raw.recordingPermissionConfirmed),
    shareWithCareCoordinator: Boolean(raw.shareWithCareCoordinator),
    shareWithContractor: Boolean(raw.shareWithContractor),
    shareWithInsurer: Boolean(raw.shareWithInsurer),
  };
};

export const consentStateFromSession = (session: {
  consentAccepted?: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
  recordingPermissionConfirmed?: boolean;
  shareWithCareCoordinator?: boolean;
  shareWithContractor?: boolean;
  shareWithInsurer?: boolean;
}) => ({
  consentAccepted: Boolean(session.consentAccepted),
  consentAcceptedAt: session.consentAcceptedAt,
  consentVersion: session.consentVersion,
  recordingPermissionConfirmed: Boolean(session.recordingPermissionConfirmed),
  shareWithCareCoordinator: Boolean(session.shareWithCareCoordinator),
  shareWithContractor: Boolean(session.shareWithContractor),
  shareWithInsurer: Boolean(session.shareWithInsurer),
});

export const parseSeniorProfile = (input: unknown): Partial<SeniorProfile> | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const ageRange = String(raw.ageRange ?? "unknown");
  const livingArrangement = String(raw.livingArrangement ?? "unknown");
  const mobilityLevel = String(raw.mobilityLevel ?? "unknown");
  const priorFalls = String(raw.priorFalls ?? "unknown");
  const medicationComplexity = String(raw.medicationComplexity ?? "unknown");
  const memoryConcerns = String(raw.memoryConcerns ?? "unknown");
  return {
    seniorName: optionalString(raw.seniorName, 120),
    relationshipToUser: optionalString(raw.relationshipToUser, 80),
    ageRange: (VALID_AGE_RANGE.has(ageRange) ? ageRange : "unknown") as SeniorProfile["ageRange"],
    livingArrangement: (VALID_LIVING_ARRANGEMENT.has(livingArrangement) ? livingArrangement : "unknown") as SeniorProfile["livingArrangement"],
    mobilityLevel: (VALID_SENIOR_MOBILITY.has(mobilityLevel) ? mobilityLevel : "unknown") as SeniorProfile["mobilityLevel"],
    priorFalls: (VALID_PRIOR_FALLS.has(priorFalls) ? priorFalls : "unknown") as SeniorProfile["priorFalls"],
    chronicConditions: Array.isArray(raw.chronicConditions) ? raw.chronicConditions.map(String).slice(0, 20) : optionalString(raw.chronicConditions, 500)?.split(",").map((item) => item.trim()).filter(Boolean),
    medicationComplexity: (VALID_COMPLEXITY.has(medicationComplexity) ? medicationComplexity : "unknown") as SeniorProfile["medicationComplexity"],
    memoryConcerns: (VALID_MEMORY_CONCERNS.has(memoryConcerns) ? memoryConcerns : "unknown") as SeniorProfile["memoryConcerns"],
    visionConcerns: raw.visionConcerns === undefined ? undefined : Boolean(raw.visionConcerns),
    hearingConcerns: raw.hearingConcerns === undefined ? undefined : Boolean(raw.hearingConcerns),
    emergencyContactName: optionalString(raw.emergencyContactName, 120),
    emergencyContactPhone: optionalString(raw.emergencyContactPhone, 60),
    primaryCaregiver: optionalString(raw.primaryCaregiver, 120),
  };
};

export const resolveReportEvidenceUrls = async (report: ReportPayload, storage: StorageAdapter): Promise<ReportPayload> => {
  const roomBreakdown = await Promise.all(
    report.roomBreakdown.map(async (room) => ({
      ...room,
      hazards: await Promise.all(
        room.hazards.map(async (hazard) => ({
          ...hazard,
          evidenceImagePath: hazard.evidenceImagePath
            ? await storage.resolveEvidenceUrl(hazard.evidenceImagePath)
            : hazard.evidenceImagePath,
        }))
      ),
    }))
  );
  const evidenceImages = await Promise.all(
    report.evidenceImages.map(async (image) => ({
      ...image,
      imagePath: await storage.resolveEvidenceUrl(image.imagePath),
    }))
  );
  return {
    ...report,
    roomBreakdown,
    evidenceImages,
  };
};

export const hasMinimumAssessmentCoverage = (roomScans: Array<{ coverageStatus: string; capturedViews: string[]; requiredViews: string[] }>): boolean => {
  if (roomScans.length === 0) return false;
  const averageCoverage = roomScans.reduce((acc, scan) => {
    if (scan.coverageStatus === "covered" || scan.coverageStatus === "skipped") return acc + 1;
    return acc + scan.capturedViews.length / Math.max(scan.requiredViews.length, 1);
  }, 0) / roomScans.length;
  return averageCoverage >= 0.6;
};

// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const pct = (value: number | undefined): string =>
  `${Number(value ?? 0).toFixed(1).replace(/\.0$/, "")}%`;

export const toCsvCell = (value: string | null | undefined): string => {
  const raw = value ?? "";
  return `"${raw.replace(/"/g, "\"\"")}"`;
};
