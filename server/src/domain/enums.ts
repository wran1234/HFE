export type SessionStatus = "draft" | "active" | "finalizing" | "completed" | "cancelled";

export type RoomType =
  | "entryway"
  | "living_room"
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "stairs"
  | "exterior_entry";

export type CoverageStatus = "not_started" | "in_progress" | "covered" | "skipped";

export type HazardType =
  | "poor_lighting"
  | "missing_handrail"
  | "slippery_floor"
  | "loose_rug"
  | "clutter_trip_hazard"
  | "narrow_walkway"
  | "high_threshold"
  | "missing_grab_bar"
  | "unsafe_stairs"
  | "uneven_floor"
  | "outdoor_step_risk";

export type SeverityLevel = "low" | "medium" | "high" | "critical";

export type ObservationStatus = "candidate" | "validated" | "dismissed";

export type RecommendationPriority = "low" | "medium" | "high" | "critical";

export type MobilityAid = "none" | "cane" | "walker" | "wheelchair";
