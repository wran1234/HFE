import {
  CoverageStatus,
  HazardType,
  MobilityAid,
  ObservationStatus,
  RecommendationPriority,
  RoomType,
  SessionStatus,
  SeverityLevel,
} from "./enums";

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface Home {
  id: string;
  userId: string;
  city?: string;
  createdAt: string;
}

export interface InspectionSession {
  id: string;
  userId: string;
  homeId: string;
  status: SessionStatus;
  residentAge: number;
  mobilityAid: MobilityAid;
  fallHistory: number;
  nightBathroomTrips: boolean;
  city?: string;
  startedAt: string;
  endedAt?: string;
  overallRiskLevel?: SeverityLevel;
  currentRoom?: RoomType;
  skippedRooms: RoomType[];
  conversationHistory?: Array<{ role: string; parts: Array<{ text?: string }> }>;
}

export interface RoomScan {
  id: string;
  sessionId: string;
  roomType: RoomType;
  coverageStatus: CoverageStatus;
  requiredViews: string[];
  capturedViews: string[];
  missingViews: string[];
  notes?: string;
}

export interface HazardObservation {
  id: string;
  sessionId: string;
  roomScanId?: string;
  roomType: RoomType;
  hazardType: HazardType;
  severityHint: SeverityLevel;
  evidenceImagePath?: string;
  modelNote: string;
  followUpNeeded: boolean;
  status: ObservationStatus;
  createdAt: string;
}

export interface FinalHazard {
  id: string;
  sessionId: string;
  roomType: RoomType;
  hazardType: HazardType;
  severity: SeverityLevel;
  reason: string;
  priority: RecommendationPriority;
  evidenceImagePath?: string;
}

export interface Recommendation {
  id: string;
  sessionId: string;
  finalHazardId: string;
  hazardId: string;
  fixType: string;
  title: string;
  description: string;
  priority: RecommendationPriority;
  estimatedCostMin: number;
  estimatedCostMax: number;
  materials: string[];
  materialsJson: string[];
  installationComplexity: "easy" | "moderate" | "complex";
}

export interface AssessmentResult {
  sessionId: string;
  overallRiskLevel: SeverityLevel;
  finalHazards: FinalHazard[];
  recommendations: Recommendation[];
  summary: string;
}

export interface SessionContextUpdate {
  residentAge?: number;
  mobilityAid?: MobilityAid;
  fallHistory?: number;
  nightBathroomTrips?: boolean;
  city?: string;
}

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
}

export interface ReportPayload {
  sessionId: string;
  generatedAt: string;
  overallRiskSummary: {
    level: SeverityLevel;
    totalHazards: number;
    highPriorityCount: number;
    summary: string;
  };
  roomBreakdown: Array<{
    roomType: RoomType;
    hazards: FinalHazard[];
  }>;
  recommendations: Recommendation[];
  evidenceImages: Array<{
    hazardId: string;
    imagePath: string;
    roomType: RoomType;
  }>;
  plainLanguageSummary: string;
  export: {
    schemaVersion: string;
    canRenderPdf: boolean;
  };
}
