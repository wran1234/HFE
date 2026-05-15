import { GoogleGenAI } from "@google/genai";
import { HazardObservation } from "../domain/types";
import { RoomType } from "../domain/enums";
import { extractHazardsFromModelResponse } from "./hazardExtractor";

const DEFAULT_PHOTO_HAZARD_MODEL = "gemini-2.5-flash";

const allowedHazardTypes = [
  "poor_lighting",
  "missing_handrail",
  "slippery_floor",
  "loose_rug",
  "clutter_trip_hazard",
  "narrow_walkway",
  "high_threshold",
  "missing_grab_bar",
  "unsafe_stairs",
  "uneven_floor",
  "outdoor_step_risk",
];

const buildPrompt = (roomType: RoomType, viewLabel: string): string => `
You are reviewing one home photo for aging-at-home prevention support.
Room: ${roomType}
View: ${viewLabel}

Identify visible home safety hazards only. Do not infer medical diagnoses, disease, frailty, dementia, or clinical outcomes.
Use only these hazardType values: ${allowedHazardTypes.join(", ")}.

For each visible hazard, output exactly one block:
<<HAZARD_JSON>>{"hazardType":"loose_rug","hazard":"specific visible issue","risk":"plain-language safety risk","recommendation":"practical prevention action"}<</HAZARD_JSON>>

If no visible hazard is clear from the photo, output only:
NO_HAZARDS_VISIBLE
`;

export async function analyzePhotoForHazards(input: {
  apiKey: string;
  model?: string;
  sessionId: string;
  roomType: RoomType;
  roomScanId?: string;
  viewLabel: string;
  base64Image: string;
  evidenceImagePath?: string;
}): Promise<Omit<HazardObservation, "id" | "createdAt">[]> {
  if (!input.apiKey) return [];

  try {
    const ai = new GoogleGenAI({ apiKey: input.apiKey });
    const response = await ai.models.generateContent({
      model: input.model || DEFAULT_PHOTO_HAZARD_MODEL,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: input.base64Image, mimeType: "image/jpeg" } },
          { text: buildPrompt(input.roomType, input.viewLabel) },
        ],
      }],
      config: {
        temperature: 0.1,
      },
    });

    return extractHazardsFromModelResponse({
      sessionId: input.sessionId,
      roomType: input.roomType,
      roomScanId: input.roomScanId,
      modelText: response.text ?? "",
      evidenceImagePath: input.evidenceImagePath,
    }).map((hazard) => ({
      ...hazard,
      modelNote: `AI photo review: ${hazard.modelNote}`,
    }));
  } catch (error) {
    console.warn("[PHOTO_VISION] hazard analysis failed", {
      sessionId: input.sessionId,
      roomType: input.roomType,
      error: String(error),
    });
    return [];
  }
}
