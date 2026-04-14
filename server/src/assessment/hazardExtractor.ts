import { HazardType, RoomType, SeverityLevel } from "../domain/enums";
import { HazardObservation } from "../domain/types";

const HAZARD_JSON_RE = /<<HAZARD_JSON>>([\s\S]*?)<<\/HAZARD_JSON>>/g;

const hazardAlias: Record<string, HazardType> = {
  poor_lighting: "poor_lighting",
  missing_handrail: "missing_handrail",
  slippery_floor: "slippery_floor",
  loose_rug: "loose_rug",
  clutter_trip_hazard: "clutter_trip_hazard",
  narrow_walkway: "narrow_walkway",
  high_threshold: "high_threshold",
  missing_grab_bar: "missing_grab_bar",
  unsafe_stairs: "unsafe_stairs",
  uneven_floor: "uneven_floor",
  outdoor_step_risk: "outdoor_step_risk",
  no_stair_railing: "missing_handrail",
  clutter_pathway: "clutter_trip_hazard",
  no_outdoor_railing: "outdoor_step_risk",
};

const severityWords: Array<{ words: string[]; level: SeverityLevel }> = [
  { words: ["urgent", "critical", "immediate", "severe"], level: "critical" },
  { words: ["high", "dangerous"], level: "high" },
  { words: ["moderate", "medium"], level: "medium" },
];

const normalizeSeverity = (text: string): SeverityLevel => {
  const lower = text.toLowerCase();
  for (const row of severityWords) {
    if (row.words.some((word) => lower.includes(word))) return row.level;
  }
  return "low";
};

export interface ExtractHazardsInput {
  sessionId: string;
  roomType: RoomType;
  roomScanId?: string;
  modelText: string;
  evidenceImagePath?: string;
}

export function extractHazardsFromModelResponse(input: ExtractHazardsInput): Omit<HazardObservation, "id" | "createdAt">[] {
  const hazards: Omit<HazardObservation, "id" | "createdAt">[] = [];
  HAZARD_JSON_RE.lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = HAZARD_JSON_RE.exec(input.modelText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as {
        hazardType?: string;
        hazard?: string;
        risk?: string;
        recommendation?: string;
      };
      const normalizedType = hazardAlias[parsed.hazardType ?? ""] ?? "clutter_trip_hazard";
      const note = [parsed.hazard, parsed.risk, parsed.recommendation].filter(Boolean).join(" ").trim();
      hazards.push({
        sessionId: input.sessionId,
        roomScanId: input.roomScanId,
        roomType: input.roomType,
        hazardType: normalizedType,
        severityHint: normalizeSeverity(note),
        evidenceImagePath: input.evidenceImagePath,
        modelNote: note || "Hazard flagged from Gemini Live output.",
        followUpNeeded: note.length < 40,
        status: "candidate",
      });
    } catch {
      console.warn("[HAZARD] malformed HAZARD_JSON fragment skipped", {
        sessionId: input.sessionId,
        roomType: input.roomType,
      });
    }
  }

  return hazards;
}
