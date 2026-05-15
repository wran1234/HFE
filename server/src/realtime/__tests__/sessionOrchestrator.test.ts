import WebSocket from "ws";
import { db } from "../../data/repository";
import { InspectionSession } from "../../domain/types";
import { SessionOrchestrator } from "../sessionOrchestrator";

const sendTurn = jest.fn().mockResolvedValue({ fullText: "Hello" });

jest.mock("../../data/repository", () => ({
  db: {
    ensureHomeForUser: jest.fn(),
    createSession: jest.fn(),
    getOrCreateRoomScan: jest.fn(),
    updateSessionConversationHistory: jest.fn(),
  },
}));

jest.mock("../geminiLiveClient", () => ({
  GeminiLiveClient: jest.fn().mockImplementation(() => ({
    sendTurn,
    getHistory: jest.fn().mockReturnValue([]),
    close: jest.fn(),
    injectHistory: jest.fn(),
  })),
}));

const mockedDb = db as jest.Mocked<typeof db>;

describe("SessionOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendTurn.mockResolvedValue({ fullText: "Hello" });
    mockedDb.ensureHomeForUser.mockResolvedValue({ id: "home_1" } as Awaited<ReturnType<typeof db.ensureHomeForUser>>);
    mockedDb.createSession.mockResolvedValue({
      id: "session_1",
      userId: "user_1",
      homeId: "home_1",
      status: "active",
      startedAt: new Date().toISOString(),
      endedAt: undefined,
      residentAge: 70,
      mobilityAid: "none",
      fallHistory: 0,
      nightBathroomTrips: false,
      city: undefined,
      overallRiskLevel: undefined,
      currentRoom: "entryway",
      skippedRooms: [],
      conversationHistory: [],
    } as InspectionSession);
    mockedDb.getOrCreateRoomScan.mockResolvedValue({
      id: "scan_1",
      sessionId: "session_1",
      roomType: "entryway",
      requiredViews: [],
      capturedViews: [],
      missingViews: [],
      coverageStatus: "in_progress",
    } as Awaited<ReturnType<typeof db.getOrCreateRoomScan>>);
    mockedDb.updateSessionConversationHistory.mockResolvedValue(undefined);
  });

  it("passes the configured Gemini Live model into each turn", async () => {
    const ws = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    } as unknown as WebSocket;

    const orchestrator = await SessionOrchestrator.create({
      ws,
      geminiApiKey: "test-key",
      liveModel: "custom-live-model",
      storage: {} as Parameters<typeof SessionOrchestrator.create>[0]["storage"],
      userId: "user_1",
      profile: {
        age: 70,
        mobilityLevel: "none",
        fallHistoryCount: 0,
        nightBathroomTrips: false,
        roomSequence: ["entryway"],
      },
    });

    await orchestrator.sendUserText("hello");

    expect(sendTurn).toHaveBeenCalledWith(expect.objectContaining({
      model: "custom-live-model",
      userText: "hello",
    }));
  });
});
