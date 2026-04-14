import { HazardObservation, UserProfile, RoomId } from "./types";

export type ServerMessageType =
  | "connected"
  | "session_started"
  | "session_resumed"
  | "status"
  | "ai_message"
  | "ai_message_chunk"
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
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/ws`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data as string);
          this.handlers.forEach((h) => h(msg));
        } catch (err) {
          console.error("Failed to parse WS message:", err);
        }
      };

      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));

      this.ws.onclose = () => {
        this.handlers.forEach((h) =>
          h({ type: "status", payload: { message: "Disconnected from server." } })
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

  requestReport() {
    this.send("request_report");
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
