import { HazardType, SeverityLevel } from "../domain/enums";
import { HazardObservation, InspectionSession } from "../domain/types";

const severityOrder: SeverityLevel[] = ["low", "medium", "high", "critical"];

export const severityToScore: Record<SeverityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const scoreToSeverity = (score: number): SeverityLevel => {
  if (score >= 4) return "critical";
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
};

export const maxSeverity = (a: SeverityLevel, b: SeverityLevel): SeverityLevel =>
  severityOrder[Math.max(severityOrder.indexOf(a), severityOrder.indexOf(b))] ?? "low";

export function applyRiskRules(
  hazardType: HazardType,
  baseSeverity: SeverityLevel,
  session: InspectionSession,
  roomHazards: HazardObservation[]
): { severity: SeverityLevel; reason: string } {
  let severity = baseSeverity;
  const reasons: string[] = [];

  if (["narrow_walkway", "high_threshold"].includes(hazardType) && ["walker", "wheelchair"].includes(session.mobilityAid)) {
    severity = maxSeverity(severity, "high");
    reasons.push("Mobility aid increases obstacle risk.");
  }

  if (hazardType === "poor_lighting" && session.nightBathroomTrips) {
    severity = maxSeverity(severity, "high");
    reasons.push("Night bathroom trips increase low-light fall risk.");
  }

  if (hazardType === "unsafe_stairs" || hazardType === "missing_handrail") {
    severity = maxSeverity(severity, "medium");
    reasons.push("Stair hazards cannot be lower than medium severity.");
  }

  const hasSlipperyFloor = roomHazards.some((hazard) => hazard.hazardType === "slippery_floor");
  const hasMissingGrabBar = roomHazards.some((hazard) => hazard.hazardType === "missing_grab_bar");
  if (hasSlipperyFloor && hasMissingGrabBar) {
    severity = maxSeverity(severity, "high");
    reasons.push("Bathroom slippery floor + missing grab bar compound risk.");
  }

  if (hazardType === "outdoor_step_risk" || (hazardType === "missing_handrail" && roomHazards.some((hazard) => hazard.roomType === "exterior_entry"))) {
    severity = maxSeverity(severity, "high");
    reasons.push("Exterior steps without railing increase entry risk.");
  }

  if (session.fallHistory >= 2) {
    severity = maxSeverity(severity, "high");
    reasons.push("Prior falls indicate elevated baseline risk.");
  }

  return {
    severity,
    reason: reasons.length ? reasons.join(" ") : "Baseline model severity.",
  };
}
