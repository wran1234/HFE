import { GoogleGenAI } from "@google/genai";
import { GeminiLiveClient } from "../geminiLiveClient";
import { GEMINI_LIVE_API_VERSION } from "../liveConfig";

const sendRealtimeInput = jest.fn();
const sendClientContent = jest.fn();
let callbacks: Record<string, (event?: unknown) => void> = {};

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    live: {
      connect: jest.fn().mockImplementation(async (params) => {
        callbacks = params.callbacks;
        callbacks.onopen?.();
        return {
          sendRealtimeInput,
          sendClientContent,
          close: jest.fn(),
        };
      }),
    },
  })),
  Modality: { AUDIO: "AUDIO", TEXT: "TEXT" },
}));

describe("GeminiLiveClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callbacks = {};
  });

  it("uses the Live API v1alpha endpoint", () => {
    new GeminiLiveClient("test-key");

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
    });
  });

  it("sends camera frames as realtime video instead of deprecated media chunks", async () => {
    const client = new GeminiLiveClient("test-key");
    const onAudio = jest.fn();
    const pending = client.sendTurn({
      model: "gemini-3.1-flash-live-preview",
      systemInstruction: "test",
      userText: "hello",
      latestFrame: "base64-image",
      onAudio,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendRealtimeInput).toHaveBeenCalledWith({
      video: { data: "base64-image", mimeType: "image/jpeg" },
    });
    expect(sendRealtimeInput).toHaveBeenCalledWith({ text: "hello" });
    expect(sendClientContent).not.toHaveBeenCalled();

    callbacks.onmessage?.({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: "pcm-audio", mimeType: "audio/pcm;rate=24000" } }],
        },
      },
    });
    expect(onAudio).toHaveBeenCalledWith({
      data: "pcm-audio",
      mimeType: "audio/pcm;rate=24000",
    });

    callbacks.onmessage?.({ serverContent: { outputTranscription: { text: "hi" } } });
    callbacks.onmessage?.({ serverContent: { turnComplete: true } });
    await expect(pending).resolves.toEqual({ fullText: "hi" });
  });
});
