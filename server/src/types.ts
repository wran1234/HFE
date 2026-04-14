export type MobilityLevel = "independent" | "cane" | "walker" | "wheelchair";
export type UrgencyLevel = "immediate" | "30-days" | "90-days" | "recommended";
export type HouseType = "single-story" | "multi-story" | "apartment" | "condo";
export type RoomId =
  | "entry"
  | "living"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "stairs"
  | "outdoor";

export interface UserProfile {
  assessmentFor: "self" | "family";
  subjectName?: string;
  age: number;
  livesAlone: boolean;
  mobilityLevel: MobilityLevel;
  fallHistoryCount: number; // 0,1,2,3 (3 = "3+")
  visionImpaired: boolean;
  medicationCount: number;
  houseType: HouseType;
  hasStairs: boolean;
  hasOutdoorSteps: boolean;
}

export interface HazardObservation {
  id: string;
  room: RoomId;
  category: string;
  location: string;
  hazard: string;
  risk: string;
  recommendation: string;
  severityScore: number; // 1-10 base
  adjustedSeverity: number; // post-profile
  fallProbability: number; // 0-100
  urgency: UrgencyLevel;
  costMin: number;
  costMax: number;
  riskReductionPercent: number;
  isDIY: boolean;
  trade?: string;
  priority: "high" | "medium" | "low";
  timestamp: number;
}
