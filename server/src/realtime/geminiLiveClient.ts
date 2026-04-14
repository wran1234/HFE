import { GoogleGenAI } from "@google/genai";

interface ConversationPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

interface ConversationTurn {
  role: "user" | "model";
  parts: ConversationPart[];
}

export interface GeminiTurnResponse {
  fullText: string;
}

export class GeminiLiveClient {
  private ai: GoogleGenAI;
  private history: ConversationTurn[] = [];

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async sendTurn(params: {
    model: string;
    systemInstruction: string;
    userText: string;
    latestFrame?: string;
    onChunk?: (chunk: string) => void;
  }): Promise<GeminiTurnResponse> {
    const parts: ConversationPart[] = [];
    if (params.latestFrame) {
      parts.push({
        inlineData: {
          data: params.latestFrame,
          mimeType: "image/jpeg",
        },
      });
    }
    if (params.userText.trim()) {
      parts.push({ text: params.userText.trim() });
    }
    if (!parts.length) return { fullText: "" };

    // Push the full turn to history temporarily
    this.history.push({ role: "user", parts });
    const rawTrimmed = this.history.slice(-20);

    // Build API payload: strip inlineData from all turns except the current (last)
    const apiContents = rawTrimmed.map((turn, i) => ({
      role: turn.role,
      parts: turn.parts.map((p) => {
        if (p.inlineData && i < rawTrimmed.length - 1) {
          return { text: "[image]" };
        }
        return p.inlineData ? { inlineData: p.inlineData } : { text: p.text ?? "" };
      }),
    }));

    // Now replace the stored history entry with the stripped version
    // (so future turns don't replay the raw base64)
    this.history[this.history.length - 1] = {
      role: "user",
      parts: parts.map((p) => p.inlineData ? { text: "[image]" } : p),
    };

    const response = await this.ai.models.generateContentStream({
      model: params.model,
      config: {
        systemInstruction: params.systemInstruction,
      },
      contents: apiContents,
    });

    let fullText = "";
    for await (const chunk of response) {
      const text = chunk.text ?? "";
      if (!text) continue;
      fullText += text;
      params.onChunk?.(text);
    }

    this.history.push({ role: "model", parts: [{ text: fullText }] });
    return { fullText };
  }

  close(): void {
    this.history = [];
  }

  injectHistory(
    turns: Array<{ role: string; parts: Array<{ text?: string }> }>
  ): void {
    this.history = turns.map((t) => ({
      role: t.role as "user" | "model",
      parts: t.parts.map((p) => ({ text: p.text ?? "" })),
    }));
  }

  getHistory(): ConversationTurn[] {
    return [...this.history];
  }
}
