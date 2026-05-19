import { GoogleGenAI, Session, LiveServerMessage, Modality } from "@google/genai";
import { GEMINI_LIVE_API_VERSION } from "./liveConfig";

interface ConversationTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiTurnResponse {
  fullText: string;
}

export class GeminiLiveClient {
  private ai: GoogleGenAI;
  private session: Session | null = null;
  private currentModel = "";
  private currentSystemInstruction = "";

  // Local history for reconnect priming and external access
  private history: ConversationTurn[] = [];

  // Pending turn state (resolve/reject + accumulation)
  private pendingResolve: ((text: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private accumulatedText = "";
  private onChunkCallback: ((chunk: string) => void) | null = null;
  private onAudioCallback: ((chunk: { data: string; mimeType: string }) => void) | null = null;

  // Serial turn queue — prevents overlapping turns from corrupting pending state
  private turnQueue: Promise<void> = Promise.resolve();

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    const content = message.serverContent;
    if (!content) return;

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        const text = (part as { text?: string }).text ?? "";
        if (text) {
          this.accumulatedText += text;
          this.onChunkCallback?.(text);
        }
        const inlineData = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
        if (inlineData?.data && inlineData.mimeType?.startsWith("audio/")) {
          this.onAudioCallback?.({
            data: inlineData.data,
            mimeType: inlineData.mimeType,
          });
        }
      }
    }
    const outputTranscript = content.outputTranscription?.text ?? "";
    if (outputTranscript) {
      this.accumulatedText += outputTranscript;
      this.onChunkCallback?.(outputTranscript);
    }

    if (content.turnComplete) {
      const resolve = this.pendingResolve;
      const text = this.accumulatedText;
      this.pendingResolve = null;
      this.pendingReject = null;
      this.accumulatedText = "";
      this.onChunkCallback = null;
      this.onAudioCallback = null;
      resolve?.(text);
    }
  }

  private async openSession(model: string, systemInstruction: string): Promise<void> {
    this.currentModel = model;
    this.currentSystemInstruction = systemInstruction;

    this.session = await this.ai.live.connect({
      model,
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {/* connection ready */},
        onmessage: (e: LiveServerMessage) => this.handleMessage(e),
        onerror: (e) => {
          const reject = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          this.accumulatedText = "";
          this.onChunkCallback = null;
          this.onAudioCallback = null;
          reject?.(new Error(`Gemini Live connection error: ${this.describeLiveEvent(e)}`));
          this.session = null;
        },
        onclose: (e) => {
          this.session = null;
          const reject = this.pendingReject;
          if (reject) {
            this.pendingResolve = null;
            this.pendingReject = null;
            this.accumulatedText = "";
            this.onChunkCallback = null;
            this.onAudioCallback = null;
            reject(new Error(`Gemini Live connection closed unexpectedly: ${this.describeLiveEvent(e)}`));
          }
        },
      },
    });
  }

  private describeLiveEvent(event: unknown): string {
    if (!event) return "unknown";
    if (event instanceof Error) return event.message;
    const detail = event as { message?: string; reason?: string; code?: number; error?: unknown };
    if (detail.message) return detail.message;
    if (detail.reason) return detail.reason;
    if (detail.code) return `close code ${detail.code}`;
    if (detail.error instanceof Error) return detail.error.message;
    if (typeof detail.error === "string") return detail.error;
    return "unknown";
  }

  private async ensureConnected(model: string, systemInstruction: string): Promise<void> {
    const configChanged =
      !this.session ||
      this.currentModel !== model ||
      this.currentSystemInstruction !== systemInstruction;

    if (!configChanged) return;

    if (this.session) {
      this.session.close();
      this.session = null;
    }

    await this.openSession(model, systemInstruction);

    // Gemini 3.1 Live accepts sendClientContent only for configured initial
    // history seeding. Normal turns must use sendRealtimeInput.
  }

  async sendTurn(params: {
    model: string;
    systemInstruction: string;
    userText: string;
    latestFrame?: string;
    onChunk?: (chunk: string) => void;
    onAudio?: (chunk: { data: string; mimeType: string }) => void;
  }): Promise<GeminiTurnResponse> {
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
    if (params.latestFrame) {
      parts.push({ inlineData: { data: params.latestFrame, mimeType: "image/jpeg" } });
    }
    if (params.userText.trim()) {
      parts.push({ text: params.userText.trim() });
    }
    if (!parts.length) return { fullText: "" };

    await this.ensureConnected(params.model, params.systemInstruction);

    this.accumulatedText = "";
    this.onChunkCallback = params.onChunk ?? null;
    this.onAudioCallback = params.onAudio ?? null;

    const fullText = await new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      for (const part of parts) {
        if (part.inlineData) {
          this.session!.sendRealtimeInput({ video: part.inlineData });
        }
        if (part.text) {
          this.session!.sendRealtimeInput({ text: part.text });
        }
      }
    });

    // Track history (store user turn stripped of image data, then model turn)
    this.history.push({
      role: "user",
      parts: parts.map((p) => ({ text: p.text ?? (p.inlineData ? "[image]" : "") })),
    });
    this.history.push({ role: "model", parts: [{ text: fullText }] });

    // Keep only the last 20 turns to avoid unbounded growth
    if (this.history.length > 20) {
      this.history = this.history.slice(this.history.length - 20);
    }

    return { fullText };
  }

  close(): void {
    this.pendingResolve = null;
    this.pendingReject = null;
    this.accumulatedText = "";
    this.onChunkCallback = null;
    this.onAudioCallback = null;
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.history = [];
  }

  injectHistory(turns: Array<{ role: string; parts: Array<{ text?: string }> }>): void {
    this.history = turns.map((t) => ({
      role: t.role as "user" | "model",
      parts: t.parts.map((p) => ({ text: p.text ?? "" })),
    }));
    // Force reconnect on next sendTurn so history is primed into the new session
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  getHistory(): ConversationTurn[] {
    return [...this.history];
  }
}
