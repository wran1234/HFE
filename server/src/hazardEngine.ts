import { UserProfile, HazardObservation, UrgencyLevel, RoomId } from "./types";

interface HazardBaseScore {
  baseSeverity: number;
  baseFallProb: number;
  costMin: number;
  costMax: number;
  riskReduction: number;
  isDIY: boolean;
  trade?: string;
  category: string;
}

const HAZARD_BASE_SCORES: Record<string, HazardBaseScore> = {
  missing_grab_bar:       { baseSeverity: 8, baseFallProb: 65, costMin: 60,  costMax: 250,  riskReduction: 45, isDIY: false, trade: "handyman",            category: "Grab Bars" },
  no_stair_railing:       { baseSeverity: 9, baseFallProb: 72, costMin: 80,  costMax: 350,  riskReduction: 55, isDIY: false, trade: "general-contractor",  category: "Stairs & Steps" },
  loose_rug:              { baseSeverity: 7, baseFallProb: 58, costMin: 0,   costMax: 25,   riskReduction: 50, isDIY: true,                                category: "Flooring & Tripping" },
  poor_lighting:          { baseSeverity: 6, baseFallProb: 42, costMin: 15,  costMax: 80,   riskReduction: 40, isDIY: true,                                category: "Lighting" },
  high_tub_entry:         { baseSeverity: 8, baseFallProb: 60, costMin: 800, costMax: 8000, riskReduction: 50, isDIY: false, trade: "plumber",              category: "Bathroom Safety" },
  no_nonslip_bath:        { baseSeverity: 7, baseFallProb: 55, costMin: 15,  costMax: 40,   riskReduction: 45, isDIY: true,                                category: "Bathroom Safety" },
  narrow_doorway:         { baseSeverity: 5, baseFallProb: 25, costMin: 25,  costMax: 2500, riskReduction: 30, isDIY: false, trade: "general-contractor",  category: "Accessibility" },
  high_threshold:         { baseSeverity: 4, baseFallProb: 35, costMin: 20,  costMax: 80,   riskReduction: 25, isDIY: true,                                category: "Flooring & Tripping" },
  clutter_pathway:        { baseSeverity: 6, baseFallProb: 48, costMin: 0,   costMax: 50,   riskReduction: 40, isDIY: true,                                category: "General Safety" },
  no_handheld_shower:     { baseSeverity: 5, baseFallProb: 30, costMin: 30,  costMax: 80,   riskReduction: 25, isDIY: true,                                category: "Bathroom Safety" },
  slippery_outdoor_steps: { baseSeverity: 8, baseFallProb: 60, costMin: 30,  costMax: 200,  riskReduction: 45, isDIY: true,                                category: "Outdoor Safety" },
  no_outdoor_railing:     { baseSeverity: 8, baseFallProb: 65, costMin: 120, costMax: 400,  riskReduction: 50, isDIY: false, trade: "general-contractor",  category: "Outdoor Safety" },
  no_nightlight:          { baseSeverity: 5, baseFallProb: 38, costMin: 15,  costMax: 50,   riskReduction: 35, isDIY: true,                                category: "Lighting" },
  no_stair_nosing:        { baseSeverity: 6, baseFallProb: 50, costMin: 15,  costMax: 60,   riskReduction: 35, isDIY: true,                                category: "Stairs & Steps" },
  cord_hazard:            { baseSeverity: 5, baseFallProb: 40, costMin: 10,  costMax: 30,   riskReduction: 35, isDIY: true,                                category: "General Safety" },
  no_shower_bench:        { baseSeverity: 6, baseFallProb: 42, costMin: 60,  costMax: 200,  riskReduction: 35, isDIY: true,                                category: "Bathroom Safety" },
  uneven_flooring:        { baseSeverity: 7, baseFallProb: 52, costMin: 50,  costMax: 1000, riskReduction: 40, isDIY: false, trade: "general-contractor",  category: "Flooring & Tripping" },
  general_hazard:         { baseSeverity: 5, baseFallProb: 35, costMin: 20,  costMax: 200,  riskReduction: 30, isDIY: true,                                category: "General Safety" },
};

export function computeProfileMultiplier(profile: UserProfile): number {
  let m = 1.0;

  // Age: linear ramp 65–85, max +40%
  if (profile.age >= 65) {
    m += Math.min(((profile.age - 65) / 20) * 0.4, 0.4);
  }

  // Mobility
  const mobilityMod: Record<string, number> = {
    independent: 0, cane: 0.15, walker: 0.25, wheelchair: 0.35,
  };
  m += mobilityMod[profile.mobilityLevel] ?? 0;

  // Fall history: each prior fall is a strong signal
  m += Math.min(profile.fallHistoryCount * 0.2, 0.6);

  // Vision
  if (profile.visionImpaired) m += 0.2;

  // Polypharmacy (≥4 meds = balance/dizziness risk)
  if (profile.medicationCount >= 4) m += 0.15;

  // Lives alone escalates urgency (no one to help after a fall)
  if (profile.livesAlone) m += 0.1;

  return Math.min(m, 2.5);
}

export function buildObservation(
  geminiData: {
    hazardType?: string;
    room: string;
    location: string;
    hazard: string;
    risk: string;
    recommendation: string;
    isDIY?: boolean;
    trade?: string;
  },
  profile: UserProfile
): HazardObservation {
  const type = geminiData.hazardType ?? "general_hazard";
  const base = HAZARD_BASE_SCORES[type] ?? HAZARD_BASE_SCORES.general_hazard;
  const m = computeProfileMultiplier(profile);

  const adjustedSeverity = Math.min(Math.round(base.baseSeverity * m), 10);
  const fallProbability = Math.min(Math.round(base.baseFallProb * m), 99);

  // Override urgency for wheelchair users on accessibility issues
  let urgency: UrgencyLevel;
  if (profile.mobilityLevel === "wheelchair" && base.category === "Accessibility") {
    urgency = "immediate";
  } else if (profile.livesAlone && adjustedSeverity >= 7) {
    urgency = "immediate";
  } else if (adjustedSeverity >= 8) {
    urgency = "immediate";
  } else if (adjustedSeverity >= 6) {
    urgency = "30-days";
  } else if (adjustedSeverity >= 4) {
    urgency = "90-days";
  } else {
    urgency = "recommended";
  }

  const priority: "high" | "medium" | "low" =
    adjustedSeverity >= 7 ? "high" : adjustedSeverity >= 5 ? "medium" : "low";

  return {
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    room: geminiData.room as RoomId,
    category: base.category,
    location: geminiData.location,
    hazard: geminiData.hazard,
    risk: geminiData.risk,
    recommendation: geminiData.recommendation,
    severityScore: base.baseSeverity,
    adjustedSeverity,
    fallProbability,
    urgency,
    costMin: base.costMin,
    costMax: base.costMax,
    riskReductionPercent: base.riskReduction,
    isDIY: geminiData.isDIY ?? base.isDIY,
    trade: geminiData.trade ?? base.trade,
    priority,
    timestamp: Date.now(),
  };
}
