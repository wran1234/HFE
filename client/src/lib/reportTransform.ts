import { AssessmentReport, HazardObservation, RoomId, UserProfile } from "./types";

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
}

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
        category: hazard.hazardType.replace(/_/g, " "),
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
        isDIY: score <= 5,
        trade: score >= 7 ? "contractor" : "handyman",
        priority: hazard.priority === "critical" ? "high" : hazard.priority,
        timestamp: Date.now(),
        evidenceImageUrl: hazard.evidenceImagePath,
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
  };
}
