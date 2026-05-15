import { describe, expect, it, vi, beforeEach } from "vitest";
import { HFEWebSocketClient } from "./wsClient";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.onclose?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("HFEWebSocketClient", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:5173" },
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  it("rejects when the server sends an early error", async () => {
    const client = new HFEWebSocketClient();
    const promise = client.connect();

    FakeWebSocket.instances[0].receive({
      type: "error",
      payload: { message: "Unauthorized websocket session." },
    });

    await expect(promise).rejects.toThrow("Unauthorized websocket session.");
  });

  it("rejects when the socket closes before a session is ready", async () => {
    const client = new HFEWebSocketClient();
    const promise = client.connect();

    FakeWebSocket.instances[0].close();

    await expect(promise).rejects.toThrow("WebSocket closed before the AI session started");
  });

  it("resolves only after the server confirms a session", async () => {
    const client = new HFEWebSocketClient();
    const promise = client.connect();
    const resolved = vi.fn();
    promise.then(resolved);

    FakeWebSocket.instances[0].receive({
      type: "connected",
      payload: { message: "Connected to HFE server." },
    });
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    FakeWebSocket.instances[0].receive({
      type: "session_started",
      payload: { sessionId: "session_1" },
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it("sends incomplete report confirmation explicitly", async () => {
    const client = new HFEWebSocketClient();
    const promise = client.connect();

    FakeWebSocket.instances[0].receive({
      type: "session_started",
      payload: { sessionId: "session_1" },
    });
    await promise;

    client.requestReport(true);

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toEqual({
      type: "request_report",
      payload: { allowIncomplete: true },
    });
  });
});
