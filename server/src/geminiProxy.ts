import { GoogleGenAI } from "@google/genai";
import WebSocket from "ws";
import { UserProfile, HazardObservation, RoomId } from "./types";
import { buildObservation } from "./hazardEngine";

// ── Room config ────────────────────────────────────────────────────────────────

const ROOM_CONFIG: Record<RoomId, { name: string; followUps: string[] }> = {
  entry: {
    name: "Front Entry & Porch",
    followUps: [
      "Is this the primary entrance used every day?",
      "Are there steps at this entrance?",
      "Is there adequate lighting here after dark?",
    ],
  },
  living: {
    name: "Living Room",
    followUps: [
      "Are there any rugs or carpets in this room?",
      "Is there a clear path between the main sitting area and the exits?",
      "Are there any cords running across the floor?",
    ],
  },
  kitchen: {
    name: "Kitchen",
    followUps: [
      "Can frequently used items be reached without a step stool?",
      "Is the floor ever wet or greasy here?",
      "Is there a sturdy surface to hold onto near the stove?",
    ],
  },
  bedroom: {
    name: "Bedroom",
    followUps: [
      "Does the resident wake up at night to use the bathroom?",
      "Is there a bedside lamp or nightlight easily reachable from bed?",
      "Is the path from the bed to the bathroom clear in the dark?",
    ],
  },
  bathroom: {
    name: "Bathroom",
    followUps: [
      "Is the shower or tub used independently?",
      "Are there grab bars near the toilet and shower?",
      "Is the floor surface non-slip when wet?",
    ],
  },
  stairs: {
    name: "Stairs & Hallways",
    followUps: [
      "How often are these stairs used, including at night?",
      "Does the resident currently hold the railing when going up or down?",
      "Are the step edges clearly visible?",
    ],
  },
  outdoor: {
    name: "Outdoor & Garage",
    followUps: [
      "Are outdoor surfaces slippery in rain or cold weather?",
      "Is there railing on all exterior steps?",
      "Is there adequate lighting at all exterior entry points?",
    ],
  },
};

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemInstruction(
  profile: UserProfile,
  roomSequence: RoomId[]
): string {
  const mobilityDesc: Record<string, string> = {
    independent: "independent mobility (no aids)",
    cane: "uses a cane for mobility",
    walker: "uses a walker for mobility",
    wheelchair: "uses a wheelchair",
  };
  const fallDesc =
    profile.fallHistoryCount === 0 ? "no falls in the past year" :
    profile.fallHistoryCount === 1 ? "1 fall in the past year" :
    profile.fallHistoryCount === 2 ? "2 falls in the past year" :
    "3 or more falls in the past year — HIGH RISK";

  const priorities: string[] = [];
  if (profile.mobilityLevel === "wheelchair")
    priorities.push("CRITICAL: Focus on doorway widths (min 32\"), turning radius, ramps, and thresholds.");
  else if (profile.mobilityLevel === "walker")
    priorities.push("HIGH: Walker usage makes narrow passages, high thresholds, and loose rugs especially dangerous.");
  if (profile.fallHistoryCount >= 3)
    priorities.push("URGENT: Prior fall history — each additional hazard compounds injury risk.");
  if (profile.visionImpaired)
    priorities.push("HIGH: Vision impairment increases danger from poor lighting and low contrast.");
  if (profile.livesAlone)
    priorities.push("IMPORTANT: Lives alone — escalate urgency of all findings.");
  if (profile.houseType === "multi-story")
    priorities.push("HIGH: Multi-story home — staircase safety is a top priority.");

  const roomList = roomSequence.map((r, i) => `${i + 1}. ${ROOM_CONFIG[r].name}`).join("\n");

  const roomFollowUps = roomSequence
    .map(r => `${ROOM_CONFIG[r].name}:\n${ROOM_CONFIG[r].followUps.map(q => `  - "${q}"`).join("\n")}`)
    .join("\n");

  const allowedHazardTypes = [
    "missing_grab_bar", "no_stair_railing", "loose_rug", "poor_lighting",
    "high_tub_entry", "no_nonslip_bath", "narrow_doorway", "high_threshold",
    "clutter_pathway", "no_handheld_shower", "slippery_outdoor_steps",
    "no_outdoor_railing", "no_nightlight", "no_stair_nosing", "cord_hazard",
    "no_shower_bench", "uneven_flooring", "general_hazard",
  ].join(", ");

  return `You are an expert home safety evaluator specializing in fall prevention and accessibility for elderly individuals. You are conducting a live video walkthrough of a home. The user will show you their home via camera, and you respond to what you see.

=== RESIDENT PROFILE ===
Age: ${profile.age} years old
Mobility: ${mobilityDesc[profile.mobilityLevel] ?? profile.mobilityLevel}
Fall history: ${fallDesc}
Vision: ${profile.visionImpaired ? "Vision impaired" : "Normal vision"}
Medications: ~${profile.medicationCount} daily medications
Living situation: ${profile.livesAlone ? "Lives alone" : "Lives with others"}
Home type: ${profile.houseType}

PROFILE-SPECIFIC PRIORITIES:
${priorities.length > 0 ? priorities.map(p => `• ${p}`).join("\n") : "• Standard assessment"}

=== ROOM SEQUENCE ===
Assess in this order:
${roomList}

For EACH room: announce entry with "Now let's assess the [Room Name].", ask 2-3 follow-up questions, scan for hazards, then say "We've completed the [Room Name]. Ready to move to [Next Room]."

Room-specific questions:
${roomFollowUps}

=== HAZARD REPORTING ===
When you identify a hazard, include a structured block AFTER your conversational text:

<<HAZARD_JSON>>
{
  "hazardType": "<one of: ${allowedHazardTypes}>",
  "room": "<roomId: entry/living/kitchen/bedroom/bathroom/stairs/outdoor>",
  "location": "<specific description>",
  "hazard": "<what is wrong>",
  "risk": "<why dangerous for this resident>",
  "recommendation": "<specific actionable fix>",
  "isDIY": true_or_false,
  "trade": "<null, handyman, electrician, plumber, or general-contractor>"
}
<</HAZARD_JSON>>

When you want the user to hold still for a photo:
<<SNAPSHOT hazardId="<use the location as id>" label="<2-5 word description>">>

=== STYLE ===
- Warm, clear, encouraging tone
- Keep responses concise (2-4 sentences) so the user can keep walking
- Guide the user: "Can you pan slowly to the left?" or "Please show me the step edge"
- Acknowledge safe features when you see them`;
}

// ── Conversation state ─────────────────────────────────────────────────────────

interface ConversationTurn {
  role: "user" | "model";
  parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
}

// ── Room detection ─────────────────────────────────────────────────────────────

const ROOM_ADVANCE_REGEX =
  /(?:now\s+let'?s?\s+(?:assess|look\s+at|check|head\s+to)|moving\s+to|entering|we'?re?\s+(?:now\s+)?(?:in|at))\s+the?\s+([a-z\s&]+)/i;

const ROOM_NAME_MAP: Record<string, RoomId> = {
  "front entry": "entry", "entry": "entry", "porch": "entry",
  "living room": "living", "living": "living",
  "kitchen": "kitchen",
  "bedroom": "bedroom",
  "bathroom": "bathroom",
  "stairs": "stairs", "hallway": "stairs", "staircase": "stairs",
  "outdoor": "outdoor", "garage": "outdoor", "exterior": "outdoor",
};

function detectRoomChange(text: string): RoomId | null {
  const m = ROOM_ADVANCE_REGEX.exec(text.toLowerCase());
  if (!m) return null;
  const phrase = m[1].trim().toLowerCase().replace(/\s+/g, " ");
  for (const [key, roomId] of Object.entries(ROOM_NAME_MAP)) {
    if (phrase.includes(key)) return roomId;
  }
  return null;
}

// ── Sentinel parsing ───────────────────────────────────────────────────────────

const HAZARD_JSON_RE = /<<HAZARD_JSON>>([\s\S]*?)<<\/HAZARD_JSON>>/g;
const SNAPSHOT_RE = /<<SNAPSHOT\s+hazardId="([^"]+)"\s+label="([^"]+)">>/g;

function processResponseText(
  rawText: string,
  profile: UserProfile,
  accumulatedObservations: HazardObservation[],
  sendToClient: (type: string, payload: unknown) => void
): string {
  let cleanText = rawText;

  // Extract hazard JSON blocks
  HAZARD_JSON_RE.lastIndex = 0;
  let hazardMatch: RegExpExecArray | null;
  while ((hazardMatch = HAZARD_JSON_RE.exec(rawText)) !== null) {
    try {
      const geminiData = JSON.parse(hazardMatch[1].trim());
      const obs = buildObservation(geminiData, profile);
      accumulatedObservations.push(obs);
      sendToClient("observation", obs);
    } catch (e) {
      console.error("Failed to parse hazard JSON:", e);
    }
    cleanText = cleanText.replace(hazardMatch[0], "");
  }

  // Extract snapshot requests
  SNAPSHOT_RE.lastIndex = 0;
  let snapMatch: RegExpExecArray | null;
  while ((snapMatch = SNAPSHOT_RE.exec(rawText)) !== null) {
    sendToClient("snapshot_request", { hazardId: snapMatch[1], label: snapMatch[2] });
    cleanText = cleanText.replace(snapMatch[0], "");
  }

  return cleanText.trim();
}

// ── Session ────────────────────────────────────────────────────────────────────

export interface GeminiProxySession {
  sendVideoFrame(base64Jpeg: string): void;
  sendAudioChunk(base64Pcm: string): void;
  sendTextMessage(text: string): Promise<void>;
  requestReport(): Promise<void>;
  close(): void;
}

export async function createGeminiSession(
  apiKey: string,
  clientWs: WebSocket,
  profile: UserProfile,
  roomSequence: RoomId[]
): Promise<GeminiProxySession> {
  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction(profile, roomSequence);

  const sendToClient = (type: string, payload: unknown) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, payload }));
    }
  };

  const conversationHistory: ConversationTurn[] = [];
  const accumulatedObservations: HazardObservation[] = [];
  let latestFrame: string | null = null;
  let closed = false;

  async function sendToGemini(userText: string, includeFrame = true): Promise<void> {
    if (closed) return;

    const userParts: ConversationTurn["parts"] = [];

    // Attach latest video frame if available
    if (includeFrame && latestFrame) {
      userParts.push({ inlineData: { data: latestFrame, mimeType: "image/jpeg" } });
    }

    if (userText) {
      userParts.push({ text: userText });
    }

    if (userParts.length === 0) return;

    conversationHistory.push({ role: "user", parts: userParts });

    // Keep history manageable (last 20 turns)
    const trimmedHistory = conversationHistory.slice(-20);

    try {
      const response = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        config: { systemInstruction },
        contents: trimmedHistory.map(turn => ({
          role: turn.role,
          parts: turn.parts.map(p => {
            if (p.inlineData) return { inlineData: p.inlineData };
            return { text: p.text ?? "" };
          }),
        })),
      });

      let fullResponseText = "";

      for await (const chunk of response) {
        const chunkText = chunk.text ?? "";
        if (chunkText) {
          fullResponseText += chunkText;

          // Clean and stream to client (strip sentinels from streaming chunks)
          const cleaned = chunkText
            .replace(/<<HAZARD_JSON>>[\s\S]*?<<\/HAZARD_JSON>>/g, "")
            .replace(/<<SNAPSHOT[^>]*>>/g, "")
            .trim();
          if (cleaned) {
            sendToClient("ai_message_chunk", { text: cleaned });
          }
        }
      }

      // Process the full response for hazard extraction and room detection
      const cleanedFull = processResponseText(
        fullResponseText,
        profile,
        accumulatedObservations,
        sendToClient
      );

      // Detect room transitions
      const newRoom = detectRoomChange(cleanedFull);
      if (newRoom) {
        sendToClient("room_change", {
          room: newRoom,
          roomName: ROOM_CONFIG[newRoom]?.name ?? newRoom,
        });
      }

      // Store model response in history (text only, no frames)
      if (cleanedFull) {
        conversationHistory.push({ role: "model", parts: [{ text: cleanedFull }] });
      }

      sendToClient("turn_complete", {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gemini generateContent error:", msg);
      sendToClient("error", { message: "AI error: " + msg });
    }
  }

  // Kick off with a greeting
  setTimeout(async () => {
    const firstRoom = roomSequence[0] ?? "entry";
    await sendToGemini(
      `You are starting a home safety assessment. Greet the user warmly and begin with the ${ROOM_CONFIG[firstRoom].name}. Ask them to show you the area.`,
      false
    );
  }, 200);

  sendToClient("status", { message: "AI connected. Starting assessment..." });

  return {
    sendVideoFrame(base64Jpeg: string) {
      latestFrame = base64Jpeg;
    },

    sendAudioChunk(_base64Pcm: string) {
      // Not used — speech handled via browser SpeechRecognition
    },

    async sendTextMessage(text: string) {
      sendToClient("ai_typing", {});
      await sendToGemini(text, true);
    },

    async requestReport() {
      sendToClient("ai_typing", {});
      await sendToGemini(
        "The walkthrough is complete. Give a brief warm closing summary (2-3 sentences) of your overall impression of the home's safety. Do not list all findings again.",
        false
      );
      // Send report after the summary
      setTimeout(() => {
        sendToClient("report_ready", { observations: accumulatedObservations });
      }, 500);
    },

    close() {
      closed = true;
    },
  };
}
