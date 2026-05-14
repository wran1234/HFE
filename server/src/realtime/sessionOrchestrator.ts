import WebSocket from "ws";
import { runAssessmentEngine } from "../assessment/assessmentEngine";
import { extractHazardsFromModelResponse } from "../assessment/hazardExtractor";
import { db } from "../data/repository";
import { MobilityAid, RoomType } from "../domain/enums";
import { REQUIRED_ROOM_ORDER, ROOM_CHECKLISTS } from "../domain/roomChecklists";
import { HazardObservation, InspectionSession, ReportPayload, RoomScan, SeniorProfile } from "../domain/types";
import { buildReportPayload } from "../reporting/reportBuilder";
import { persistReportPayload } from "../reporting/reportBuilder";
import { StorageAdapter } from "../storage/storageAdapter";
import { GeminiLiveClient } from "./geminiLiveClient";
import { InspectionStateMachine } from "./inspectionStateMachine";
import { DEFAULT_GEMINI_LIVE_MODEL } from "./liveConfig";

const SNAPSHOT_RE = /<<SNAPSHOT\s+hazardId="([^"]+)"\s+label="([^"]+)">>/g;
const ROOM_HINT_RE = /(entryway|living[_\s]room|bedroom|bathroom|kitchen|stairs|exterior[_\s]entry)/i;

const roomName: Record<RoomType, string> = {
  entryway: "Entryway",
  living_room: "Living Room",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  stairs: "Stairs",
  exterior_entry: "Exterior Entry",
};

const normalizeRoom = (value: string): RoomType | null => {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "living_room") return "living_room";
  if (normalized === "exterior_entry") return "exterior_entry";
  if (normalized === "entryway") return "entryway";
  if (normalized === "bedroom") return "bedroom";
  if (normalized === "bathroom") return "bathroom";
  if (normalized === "kitchen") return "kitchen";
  if (normalized === "stairs") return "stairs";
  return null;
};

const toMobilityAid = (mobilityLevel?: string): MobilityAid => {
  if (mobilityLevel === "cane" || mobilityLevel === "walker" || mobilityLevel === "wheelchair") return mobilityLevel;
  return "none";
};

export class SessionOrchestrator {
  private ws: WebSocket;
  private gemini: GeminiLiveClient;
  private storage: StorageAdapter;
  private stateMachine: InspectionStateMachine;
  private session: InspectionSession;
  private liveModel: string;
  private latestFrame?: string;
  private frameCount = 0;

  private constructor(params: {
    ws: WebSocket;
    geminiApiKey: string;
    storage: StorageAdapter;
    session: InspectionSession;
    roomSequence: RoomType[];
    liveModel?: string;
    profile: {
      age?: number;
      mobilityLevel?: string;
      fallHistoryCount?: number;
      nightBathroomTrips?: boolean;
      seniorProfile?: Partial<SeniorProfile>;
      pilotCohortId?: string;
      referralId?: string;
      consent?: {
        consentAccepted?: boolean;
        consentVersion?: string;
        recordingPermissionConfirmed?: boolean;
        shareWithCareCoordinator?: boolean;
        shareWithContractor?: boolean;
        shareWithInsurer?: boolean;
      };
    };
  }) {
    this.ws = params.ws;
    this.gemini = new GeminiLiveClient(params.geminiApiKey);
    this.storage = params.storage;
    this.liveModel = params.liveModel ?? DEFAULT_GEMINI_LIVE_MODEL;

    const roomSequence = params.roomSequence?.length ? params.roomSequence : REQUIRED_ROOM_ORDER;
    this.stateMachine = new InspectionStateMachine(roomSequence);
    this.session = params.session;
  }

  static async create(params: {
    ws: WebSocket;
    geminiApiKey: string;
    liveModel?: string;
    storage: StorageAdapter;
    userId: string;
    profile: {
      city?: string;
      age?: number;
      mobilityLevel?: string;
      fallHistoryCount?: number;
      nightBathroomTrips?: boolean;
      roomSequence?: RoomType[];
      seniorProfile?: Partial<SeniorProfile>;
      pilotCohortId?: string;
      referralId?: string;
      consent?: {
        consentAccepted?: boolean;
        consentVersion?: string;
        recordingPermissionConfirmed?: boolean;
        shareWithCareCoordinator?: boolean;
        shareWithContractor?: boolean;
        shareWithInsurer?: boolean;
      };
    };
  }): Promise<SessionOrchestrator> {
    const home = await db.ensureHomeForUser(params.userId, params.profile.city);
    const session = await db.createSession({
      userId: params.userId,
      homeId: home.id,
      residentAge: params.profile.age ?? 70,
      mobilityAid: toMobilityAid(params.profile.mobilityLevel),
      fallHistory: params.profile.fallHistoryCount ?? 0,
      nightBathroomTrips: !!params.profile.nightBathroomTrips,
      city: params.profile.city,
      overallRiskLevel: undefined,
      pilotCohortId: params.profile.pilotCohortId,
      referralId: params.profile.referralId,
      consentAccepted: Boolean(params.profile.consent?.consentAccepted),
      consentAcceptedAt: params.profile.consent?.consentAccepted ? new Date().toISOString() : undefined,
      consentVersion: params.profile.consent?.consentVersion ?? "parent-safety-consent-v1",
      recordingPermissionConfirmed: Boolean(params.profile.consent?.recordingPermissionConfirmed),
      shareWithCareCoordinator: Boolean(params.profile.consent?.shareWithCareCoordinator),
      shareWithContractor: Boolean(params.profile.consent?.shareWithContractor),
      shareWithInsurer: Boolean(params.profile.consent?.shareWithInsurer),
    });
    const roomSequence = params.profile.roomSequence?.length ? params.profile.roomSequence : REQUIRED_ROOM_ORDER;
    for (const room of roomSequence) {
      await db.getOrCreateRoomScan(session.id, room);
    }
    if (params.profile.seniorProfile) {
      await db.upsertSeniorProfile(session.id, params.profile.seniorProfile);
    }

    return new SessionOrchestrator({
      ws: params.ws,
      geminiApiKey: params.geminiApiKey,
      liveModel: params.liveModel,
      storage: params.storage,
      session,
      roomSequence,
      profile: params.profile,
    });
  }

  static async resume(params: {
    ws: WebSocket;
    geminiApiKey: string;
    liveModel?: string;
    storage: StorageAdapter;
    session: InspectionSession;
    roomScans: RoomScan[];
    observations: HazardObservation[];
    conversationHistory: Array<{ role: string; parts: Array<{ text?: string }> }>;
  }): Promise<SessionOrchestrator> {
    const roomSequence = params.roomScans.length
      ? params.roomScans.map((rs) => rs.roomType as RoomType)
      : REQUIRED_ROOM_ORDER;
    const orchestrator = new SessionOrchestrator({
      ws: params.ws,
      geminiApiKey: params.geminiApiKey,
      liveModel: params.liveModel,
      storage: params.storage,
      session: params.session,
      roomSequence,
      profile: {
        age: params.session.residentAge,
        mobilityLevel: params.session.mobilityAid,
        fallHistoryCount: params.session.fallHistory,
        nightBathroomTrips: params.session.nightBathroomTrips,
      },
    });

    for (const rs of params.roomScans) {
      for (const view of rs.capturedViews) {
        orchestrator.stateMachine.captureView(rs.roomType as RoomType, view);
      }
      if (rs.coverageStatus === "covered" || rs.coverageStatus === "skipped") {
        const state = orchestrator.stateMachine.getState();
        if (!state.roomsCompleted.includes(rs.roomType as RoomType)) {
          state.roomsCompleted.push(rs.roomType as RoomType);
        }
      }
    }

    if (params.session.currentRoom) {
      const state = orchestrator.stateMachine.getState();
      if (state.roomProgress[params.session.currentRoom]) {
        state.currentRoom = params.session.currentRoom;
      }
    }

    for (const obs of params.observations) {
      orchestrator.stateMachine.addCandidateHazard(obs.hazardType);
    }

    if (params.conversationHistory.length > 0) {
      orchestrator.gemini.injectHistory(params.conversationHistory);
    }

    return orchestrator;
  }

  getSessionId(): string {
    return this.session.id;
  }

  getSession(): InspectionSession {
    return this.session;
  }

  canFinalizeReport(): boolean {
    // 60 is the minimum coverage threshold (0-100 scale) required to allow report generation.
    return this.stateMachine.getState().completionScore >= 60;
  }

  handleVideoFrame(base64Jpeg: string): void {
    this.latestFrame = base64Jpeg;
    this.frameCount += 1;
    if (this.frameCount % 3 === 0) {
      const currentRoom = this.stateMachine.getState().currentRoom;
      const beforeMissing = this.stateMachine.getState().roomProgress[currentRoom].missingViews.length;
      this.stateMachine.autoCaptureNextMissingView(currentRoom);
      const progress = this.stateMachine.getState().roomProgress[currentRoom];
      void this.syncRoomScan(currentRoom);
      if (beforeMissing !== progress.missingViews.length) {
        this.send("inspection_state", this.buildInspectionStatePayload());
      }
    }
  }

  async start(): Promise<void> {
    const started = await this.sendUserText("Begin the safety inspection with a warm greeting and ask for the first entryway view.");
    if (!started) return;
    this.send("session_started", {
      sessionId: this.session.id,
      inspectionState: this.buildInspectionStatePayload(),
    });
  }

  async sendUserText(text: string): Promise<boolean> {
    this.send("ai_typing", {});
    let response: { fullText: string };
    try {
      response = await this.gemini.sendTurn({
        model: this.liveModel,
        systemInstruction: this.buildSystemInstruction(),
        userText: text,
        latestFrame: this.latestFrame,
        onChunk: (chunk) => {
          const cleaned = chunk
            .replace(/<<HAZARD_JSON>>[\s\S]*?<<\/HAZARD_JSON>>/g, "")
            .replace(/<<SNAPSHOT[^>]*>>/g, "");
          if (cleaned.trim()) this.send("ai_message_chunk", { text: cleaned });
        },
        onAudio: (chunk) => {
          this.send("ai_audio_chunk", chunk);
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const isModelIssue = /model|not found|not supported|unsupported/i.test(detail);
      this.send("error", {
        message: isModelIssue
          ? `AI Live model "${this.liveModel}" is not available for this API key. Check GEMINI_LIVE_MODEL.`
          : `AI Live connection failed: ${detail}`,
      });
      this.send("turn_complete", {});
      return false;
    }

    await this.captureHazards(response.fullText);
    await db.updateSessionConversationHistory(
      this.session.id,
      this.gemini.getHistory().slice(-10)
    );
    this.handleRoomGuidance(response.fullText, text);
    this.handleFollowUps();
    this.send("turn_complete", {});
    return true;
  }

  async finalizeSession(): Promise<ReportPayload> {
    if (!this.session.consentAccepted || !this.session.recordingPermissionConfirmed) {
      this.send("error", { message: "Consent and recording permission must be confirmed before generating a prevention report." });
      throw new Error("CONSENT_REQUIRED");
    }
    this.session.status = "finalizing";
    this.session.endedAt = new Date().toISOString();
    await db.updateSession(this.session);

    const assessment = await runAssessmentEngine(this.session);
    this.session.status = "completed";
    this.session.overallRiskLevel = assessment.overallRiskLevel;
    await db.updateSession(this.session);
    if (this.session.referralId) {
      await db.updatePartnerReferralStatus(this.session.referralId, "assessment_completed");
    }

    const seniorProfile = await db.getSeniorProfile(this.session.id);
    const report = buildReportPayload(assessment, seniorProfile);
    report.assessmentReview = await db.getAssessmentReview(this.session.id);
    report.consent = {
      consentAccepted: Boolean(this.session.consentAccepted),
      consentAcceptedAt: this.session.consentAcceptedAt,
      consentVersion: this.session.consentVersion,
      recordingPermissionConfirmed: Boolean(this.session.recordingPermissionConfirmed),
      shareWithCareCoordinator: Boolean(this.session.shareWithCareCoordinator),
      shareWithContractor: Boolean(this.session.shareWithContractor),
      shareWithInsurer: Boolean(this.session.shareWithInsurer),
    };
    try {
      await persistReportPayload(report, this.session.userId);
      if (this.session.referralId) {
        await db.updatePartnerReferralStatus(this.session.referralId, "report_generated");
      }
    } catch (err) {
      console.error("[REPORT] persist failed for session", this.session.id, String(err));
      this.send("warning", { message: "Your report is ready but may not appear in History due to a temporary issue. Please screenshot or save it now." });
    }
    return report;
  }

  close(): void {
    this.gemini.close();
  }

  private async captureHazards(modelText: string): Promise<void> {
    const room = this.stateMachine.getState().currentRoom;
    const roomScan = await db.getOrCreateRoomScan(this.session.id, room);
    let evidencePath: string | undefined;
    let evidenceAssetId: string | undefined;
    if (this.latestFrame) {
      const saved = await this.storage.saveEvidence({
        base64Image: this.latestFrame,
        userId: this.session.userId,
        sessionId: this.session.id,
        roomType: room,
        hint: `${room}_snapshot`,
      });
      evidencePath = saved.storageKey;
      const asset = await db.createEvidenceAsset({
        userId: this.session.userId,
        sessionId: this.session.id,
        roomType: room,
        storageProvider: this.storage.providerName,
        storageKey: saved.storageKey,
        publicUrl: saved.publicUrl,
        mimeType: "image/jpeg",
      });
      evidenceAssetId = asset.id;
    }

    const observations = extractHazardsFromModelResponse({
      sessionId: this.session.id,
      roomType: room,
      roomScanId: roomScan.id,
      modelText,
      evidenceImagePath: evidencePath,
    });

    for (const obs of observations) {
      const saved = await db.createObservation(obs);
      if (evidenceAssetId) {
        await db.updateObservationEvidence(saved.id, {
          evidenceAssetId,
          evidenceImagePath: evidencePath,
        });
        saved.evidenceImagePath = evidencePath;
      }
      this.stateMachine.addCandidateHazard(saved.id);
      this.send("observation", saved);
    }

    SNAPSHOT_RE.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = SNAPSHOT_RE.exec(modelText)) !== null) {
      this.send("snapshot_request", { hazardId: match[1], label: match[2] });
    }
  }

  private handleRoomGuidance(modelText: string, userText: string): void {
    const current = this.stateMachine.getState().currentRoom;
    const progress = this.stateMachine.getState().roomProgress[current];
    const wantsNext = /next room|move on|continue|skip/i.test(userText);
    const roomMention = ROOM_HINT_RE.exec(modelText);
    const hintedRoom = roomMention ? normalizeRoom(roomMention[1]) : null;

    if (wantsNext && this.stateMachine.canAdvanceRoom(current)) {
      this.stateMachine.advanceRoom(true);
      this.send("room_change", {
        room: this.stateMachine.getState().currentRoom,
        roomName: roomName[this.stateMachine.getState().currentRoom],
      });
      this.send("inspection_state", this.buildInspectionStatePayload());
      return;
    }

    if (wantsNext && progress.missingViews.length > 0) {
      this.send("missing_views", {
        room: current,
        missingViews: progress.missingViews,
      });
      return;
    }

    if (hintedRoom && hintedRoom !== current && this.stateMachine.canAdvanceRoom(current)) {
      this.stateMachine.advanceRoom(true);
      this.send("room_change", { room: hintedRoom, roomName: roomName[hintedRoom] });
      this.send("inspection_state", this.buildInspectionStatePayload());
    }
  }

  private handleFollowUps(): void {
    const current = this.stateMachine.getState().currentRoom;
    const progress = this.stateMachine.getState().roomProgress[current];
    const pending = progress.missingViews.slice(0, 2).map((view) => `Please show: ${view}`);
    this.stateMachine.setFollowUps(pending);
    if (pending.length) {
      this.send("follow_up_prompt", { room: current, prompts: pending });
    }
    this.send("inspection_state", this.buildInspectionStatePayload());
  }

  buildInspectionStatePayload() {
    const state = this.stateMachine.getState();
    return {
      currentRoom: state.currentRoom,
      roomsCompleted: state.roomsCompleted,
      requiredViews: ROOM_CHECKLISTS[state.currentRoom],
      missingViews: state.roomProgress[state.currentRoom]?.missingViews ?? [],
      candidateHazardsFound: state.candidateHazardIds.length,
      followUpQuestionsPending: state.followUpQuestionsPending,
      completionScore: state.completionScore,
    };
  }

  private async syncRoomScan(room: RoomType): Promise<void> {
    const roomScan = await db.getOrCreateRoomScan(this.session.id, room);
    const progress = this.stateMachine.getState().roomProgress[room];
    roomScan.capturedViews = [...progress.capturedViews];
    roomScan.missingViews = [...progress.missingViews];
    roomScan.coverageStatus = progress.missingViews.length === 0 ? "covered" : "in_progress";
    await db.saveRoomScan(roomScan);
  }

  private buildSystemInstruction(): string {
    const state = this.stateMachine.getState();
    const room = state.currentRoom;
    const missing = state.roomProgress[room]?.missingViews ?? [];
    return `You are an elder home safety evaluator running a structured inspection pipeline.
Current room: ${room}.
Required views for this room: ${ROOM_CHECKLISTS[room].join(", ")}.
Missing views: ${missing.join(", ") || "none"}.
You must keep responses concise and guide the user to complete missing views before moving on.

When a hazard is identified, include a structured block:
<<HAZARD_JSON>>
{
  "hazardType": "poor_lighting|missing_handrail|slippery_floor|loose_rug|clutter_trip_hazard|narrow_walkway|high_threshold|missing_grab_bar|unsafe_stairs|uneven_floor|outdoor_step_risk",
  "hazard": "hazard description",
  "risk": "why this matters",
  "recommendation": "specific fix"
}
<</HAZARD_JSON>>

You may ask for a snapshot when needed:
<<SNAPSHOT hazardId="contextual-id" label="short label">>
`;
  }

  private send(type: string, payload: unknown): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}
