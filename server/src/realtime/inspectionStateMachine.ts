import { RoomType } from "../domain/enums";
import { REQUIRED_ROOM_ORDER, ROOM_CHECKLISTS } from "../domain/roomChecklists";

export interface RoomProgressState {
  roomType: RoomType;
  requiredViews: string[];
  capturedViews: string[];
  missingViews: string[];
  skipped: boolean;
}

export interface InspectionWorkflowState {
  currentRoom: RoomType;
  roomsCompleted: RoomType[];
  roomProgress: Record<RoomType, RoomProgressState>;
  candidateHazardIds: string[];
  followUpQuestionsPending: string[];
  completionScore: number;
}

export class InspectionStateMachine {
  private state: InspectionWorkflowState;

  constructor(enabledRooms: RoomType[] = REQUIRED_ROOM_ORDER) {
    const initial = (enabledRooms[0] ?? "entryway") as RoomType;
    const roomProgress = {} as Record<RoomType, RoomProgressState>;
    for (const room of enabledRooms) {
      roomProgress[room] = {
        roomType: room,
        requiredViews: [...ROOM_CHECKLISTS[room]],
        capturedViews: [],
        missingViews: [...ROOM_CHECKLISTS[room]],
        skipped: false,
      };
    }
    this.state = {
      currentRoom: initial,
      roomsCompleted: [],
      roomProgress,
      candidateHazardIds: [],
      followUpQuestionsPending: [],
      completionScore: 0,
    };
  }

  getState(): InspectionWorkflowState {
    return this.state;
  }

  captureView(room: RoomType, view: string): InspectionWorkflowState {
    const progress = this.state.roomProgress[room];
    if (!progress) return this.state;
    if (!progress.capturedViews.includes(view)) {
      progress.capturedViews.push(view);
      progress.missingViews = progress.requiredViews.filter((item) => !progress.capturedViews.includes(item));
    }
    this.refreshCompletionScore();
    return this.state;
  }

  autoCaptureNextMissingView(room: RoomType): InspectionWorkflowState {
    const progress = this.state.roomProgress[room];
    if (!progress || progress.missingViews.length === 0) return this.state;
    return this.captureView(room, progress.missingViews[0]);
  }

  addCandidateHazard(hazardId: string): void {
    if (!this.state.candidateHazardIds.includes(hazardId)) {
      this.state.candidateHazardIds.push(hazardId);
    }
  }

  setFollowUps(questions: string[]): void {
    this.state.followUpQuestionsPending = questions;
  }

  clearFollowUps(): void {
    this.state.followUpQuestionsPending = [];
  }

  markRoomSkipped(room: RoomType): InspectionWorkflowState {
    const progress = this.state.roomProgress[room];
    if (!progress) return this.state;
    progress.skipped = true;
    progress.missingViews = [];
    if (!this.state.roomsCompleted.includes(room)) {
      this.state.roomsCompleted.push(room);
    }
    this.advanceRoom();
    return this.state;
  }

  canAdvanceRoom(room: RoomType): boolean {
    const progress = this.state.roomProgress[room];
    if (!progress) return false;
    if (progress.skipped) return true;
    const coverage = progress.capturedViews.length / Math.max(progress.requiredViews.length, 1);
    return coverage >= 0.6;
  }

  advanceRoom(force = false): InspectionWorkflowState {
    const current = this.state.currentRoom;
    if (!force && !this.canAdvanceRoom(current)) return this.state;

    if (!this.state.roomsCompleted.includes(current)) {
      this.state.roomsCompleted.push(current);
    }

    const sequence = Object.keys(this.state.roomProgress) as RoomType[];
    const next = sequence.find((room) => !this.state.roomsCompleted.includes(room));
    if (next) {
      this.state.currentRoom = next;
    }
    this.refreshCompletionScore();
    return this.state;
  }

  isComplete(): boolean {
    const sequence = Object.keys(this.state.roomProgress) as RoomType[];
    return sequence.every((room) => this.state.roomsCompleted.includes(room));
  }

  private refreshCompletionScore(): void {
    const sequence = Object.keys(this.state.roomProgress) as RoomType[];
    const completed = sequence.reduce((acc, room) => {
      const progress = this.state.roomProgress[room];
      if (progress.skipped) return acc + 1;
      return acc + progress.capturedViews.length / Math.max(progress.requiredViews.length, 1);
    }, 0);
    this.state.completionScore = Math.round((completed / Math.max(sequence.length, 1)) * 100);
  }
}
