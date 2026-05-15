import {
  AssessmentReport,
  FamilyDashboard,
  HazardObservation,
  IndependencePlanItem,
  IndependenceRiskScore,
  MemorySupportChecklist,
  PreventionSummary,
  RoomId,
  SeniorProfile,
  UserProfile,
  ConsentState,
  AssessmentReview,
} from "./types";

interface BackendFinalHazard {
  id: string;
  roomType: RoomId;
  hazardType: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  evidenceImagePath?: string;
}

interface BackendRecommendation {
  hazardId: string;
  title: string;
  description: string;
  estimatedCostMin: number;
  estimatedCostMax: number;
  priority: "low" | "medium" | "high" | "critical";
}

interface BackendReport {
  sessionId: string;
  overallRiskSummary: {
    summary: string;
  };
  roomBreakdown: Array<{
    roomType: RoomId;
    hazards: BackendFinalHazard[];
  }>;
  recommendations: BackendRecommendation[];
  seniorProfile?: SeniorProfile;
  independenceRiskScore?: IndependenceRiskScore;
  independencePlan?: IndependencePlanItem[];
  familyDashboard?: FamilyDashboard;
  memorySupportChecklist?: MemorySupportChecklist;
  preventionSummary?: PreventionSummary;
  consent?: ConsentState;
  assessmentReview?: AssessmentReview;
}

const HAZARD_TO_CATEGORY: Record<string, string> = {
  poor_lighting: "Lighting",
  missing_handrail: "Stairs & Steps",
  slippery_floor: "Bathroom Safety",
  loose_rug: "Flooring & Tripping",
  clutter_trip_hazard: "Flooring & Tripping",
  narrow_walkway: "Accessibility",
  high_threshold: "Flooring & Tripping",
  missing_grab_bar: "Grab Bars",
  unsafe_stairs: "Stairs & Steps",
  uneven_floor: "Flooring & Tripping",
  outdoor_step_risk: "Outdoor Safety",
};

const HAZARD_TO_TRADE: Record<string, string> = {
  missing_handrail: "general-contractor",
  unsafe_stairs: "general-contractor",
  outdoor_step_risk: "general-contractor",
  narrow_walkway: "general-contractor",
  slippery_floor: "plumber",
  poor_lighting: "electrician",
  missing_grab_bar: "handyman",
  high_threshold: "handyman",
  loose_rug: "handyman",
  clutter_trip_hazard: "handyman",
  uneven_floor: "handyman",
};

const HAZARD_IS_DIY: Record<string, boolean> = {
  missing_grab_bar: true,
  loose_rug: true,
  poor_lighting: true,
  high_threshold: true,
  clutter_trip_hazard: true,
  uneven_floor: true,
  missing_handrail: false,
  unsafe_stairs: false,
  slippery_floor: false,
  outdoor_step_risk: false,
  narrow_walkway: false,
};

const severityScore = (severity: BackendFinalHazard["severity"]): number => {
  if (severity === "critical") return 9;
  if (severity === "high") return 7;
  if (severity === "medium") return 5;
  return 3;
};

const urgencyFromPriority = (
  priority: BackendFinalHazard["priority"]
): HazardObservation["urgency"] => {
  if (priority === "critical") return "immediate";
  if (priority === "high") return "30-days";
  if (priority === "medium") return "90-days";
  return "recommended";
};

const evidenceUrlFromPath = (path?: string): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) return path;
  if (path.startsWith("evidence/")) return `/${path}`;
  return `/evidence/${path}`;
};

export function toAssessmentReport(
  backendReport: BackendReport,
  profile: UserProfile
): AssessmentReport {
  const recommendationByHazard = new Map(
    backendReport.recommendations.map((rec) => [rec.hazardId, rec])
  );

  const observations: HazardObservation[] = backendReport.roomBreakdown.flatMap((room) =>
    room.hazards.map((hazard) => {
      const recommendation = recommendationByHazard.get(hazard.id);
      const score = severityScore(hazard.severity);
      return {
        id: hazard.id,
        room: room.roomType,
        hazardType: hazard.hazardType,
        category: HAZARD_TO_CATEGORY[hazard.hazardType] ?? "General",
        location: room.roomType.replace(/_/g, " "),
        hazard: hazard.reason,
        risk: hazard.reason,
        recommendation: recommendation?.description ?? "Review mitigation with a contractor.",
        severityScore: score,
        adjustedSeverity: score,
        fallProbability: Math.min(25 + score * 8, 95),
        urgency: urgencyFromPriority(hazard.priority),
        costMin: recommendation?.estimatedCostMin ?? 0,
        costMax: recommendation?.estimatedCostMax ?? 0,
        riskReductionPercent: Math.min(20 + score * 6, 80),
        isDIY: HAZARD_IS_DIY[hazard.hazardType] ?? true,
        trade: HAZARD_TO_TRADE[hazard.hazardType] ?? "handyman",
        priority: hazard.priority === "critical" ? "high" : hazard.priority,
        timestamp: Date.now(),
        evidenceImageUrl: evidenceUrlFromPath(hazard.evidenceImagePath),
      };
    })
  );

  return {
    sessionId: backendReport.sessionId,
    profile,
    observations,
    snapshots: [],
    aiSummary: backendReport.overallRiskSummary.summary,
    generatedAt: Date.now(),
    seniorProfile: backendReport.seniorProfile,
    independenceRiskScore: backendReport.independenceRiskScore,
    independencePlan: backendReport.independencePlan,
    familyDashboard: backendReport.familyDashboard,
    memorySupportChecklist: backendReport.memorySupportChecklist,
    preventionSummary: backendReport.preventionSummary,
    consent: backendReport.consent ?? profile.consent,
    assessmentReview: backendReport.assessmentReview,
  };
}
