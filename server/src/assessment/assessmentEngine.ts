import crypto from "crypto";
import { db } from "../data/inMemoryDatabase";
import { RecommendationPriority, SeverityLevel } from "../domain/enums";
import { AssessmentResult, FinalHazard, HazardObservation, InspectionSession } from "../domain/types";
import { buildRecommendation } from "./recommendationEngine";
import { applyRiskRules, scoreToSeverity, severityToScore } from "./riskRules";

const initialSeverity: Record<string, SeverityLevel> = {
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

const priorityFromSeverity = (severity: SeverityLevel): RecommendationPriority => {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
};

export function dedupeObservations(
  observations: HazardObservation[]
): HazardObservation[] {
  const grouped = new Map<string, HazardObservation>();
  for (const obs of observations) {
    const key = `${obs.roomType}:${obs.hazardType}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, obs);
      continue;
    }
    if (severityToScore[obs.severityHint] > severityToScore[existing.severityHint]) {
      grouped.set(key, obs);
    }
  }
  return Array.from(grouped.values());
}

export function computeOverallRisk(hazards: FinalHazard[]): SeverityLevel {
  if (!hazards.length) return "low";
  const total = hazards.reduce((sum, hazard) => sum + severityToScore[hazard.severity], 0);
  return scoreToSeverity(total / hazards.length >= 3.5 ? 4 : total / hazards.length >= 2.5 ? 3 : total / hazards.length >= 1.5 ? 2 : 1);
}

export async function runAssessmentEngine(session: InspectionSession): Promise<AssessmentResult> {
  const observations = await db.listObservations(session.id);
  const deduped = dedupeObservations(observations);

  const finalHazards: FinalHazard[] = deduped.map((observation) => {
    const roomHazards = deduped.filter((item) => item.roomType === observation.roomType);
    const baseSeverity = initialSeverity[observation.hazardType] ?? observation.severityHint;
    const adjusted = applyRiskRules(observation.hazardType, baseSeverity, session, roomHazards);
    return {
      id: `fh_${crypto.randomUUID()}`,
      sessionId: session.id,
      roomType: observation.roomType,
      hazardType: observation.hazardType,
      severity: adjusted.severity,
      reason: `${observation.modelNote} ${adjusted.reason}`.trim(),
      priority: priorityFromSeverity(adjusted.severity),
      evidenceImagePath: observation.evidenceImagePath,
    };
  });

  const recommendations = finalHazards.map((hazard) => buildRecommendation(session.id, hazard));
  const overallRiskLevel = computeOverallRisk(finalHazards);
  const summary = finalHazards.length
    ? `Assessment found ${finalHazards.length} hazards. Focus first on ${finalHazards.filter((item) => item.priority === "critical" || item.priority === "high").length} high-priority items.`
    : "No major hazards detected; continue routine maintenance and periodic reassessment.";

  const result: AssessmentResult = {
    sessionId: session.id,
    overallRiskLevel,
    finalHazards,
    recommendations,
    summary,
  };

  await db.saveAssessment(result);
  return result;
}
