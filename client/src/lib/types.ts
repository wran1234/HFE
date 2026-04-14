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
}

export interface HazardObservation {
  id: string;
  room: RoomId;
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
}
