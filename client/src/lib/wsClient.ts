import { HazardObservation, UserProfile, RoomId } from "./types";

export type ServerMessageType =
  | "connected"
  | "session_started"
  | "session_resumed"
  | "status"
  | "ai_message"
  | "ai_message_chunk"
  | "ai_audio_chunk"
  | "ai_typing"
  | "observation"
  | "room_change"
  | "inspection_state"
  | "follow_up_prompt"
  | "missing_views"
  | "snapshot_request"
  | "turn_complete"
  | "report_ready"
  | "error";

export interface ServerMessage {
  type: ServerMessageType;
  payload: Record<string, unknown>;
}

type MessageHandler = (msg: ServerMessage) => void;

export class HFEWebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/ws`;

      this.ws = new WebSocket(url);

      const settleReady = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const settleError = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data as string);
          this.handlers.forEach((h) => h(msg));
          if (msg.type === "session_started" || msg.type === "session_resumed") {
            settleReady();
          }
          if (msg.type === "error" && !settled) {
            settleError(new Error(String(msg.payload.message ?? "WebSocket session failed")));
          }
        } catch (err) {
          console.error("Failed to parse WS message:", err);
          settleError(new Error("Failed to parse server websocket message"));
        }
      };

      this.ws.onerror = () => settleError(new Error("WebSocket connection failed"));

      this.ws.onclose = () => {
        settleError(new Error("WebSocket closed before the AI session started"));
        // After the session has started, surface disconnection as an error so
        // VideoAssistant resets its status and shows a visible error message.
        this.handlers.forEach((h) =>
          h({ type: "error", payload: { message: "Disconnected from server. Please end the session and try again." } })
        );
      };
    });
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  private send(type: string, payload?: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  startSession(profile: UserProfile, roomSequence: RoomId[]) {
    this.send("start_session", {
      profile: profile as unknown as Record<string, unknown>,
      roomSequence,
    });
  }

  sendVideoFrame(base64Jpeg: string) {
    this.send("video_frame", { data: base64Jpeg });
  }

  sendAudioChunk(base64Pcm: string) {
    this.send("audio_chunk", { data: base64Pcm });
  }

  sendTextMessage(text: string) {
    this.send("text_message", { text });
  }

  requestReport(allowIncomplete = false) {
    this.send("request_report", { allowIncomplete });
  }

  endSession() {
    this.send("end_session");
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Re-export for convenience
export type { HazardObservation };
