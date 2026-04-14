import { RoomId } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

export async function createInspectionSession(payload: {
  residentAge: number;
  mobilityAid: "none" | "cane" | "walker" | "wheelchair";
  fallHistory: number;
  nightBathroomTrips: boolean;
  city?: string;
}) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to create session");
  return response.json() as Promise<{ session: { id: string } }>;
}

export async function markRoomProgress(
  sessionId: string,
  roomType: RoomId,
  payload: {
    capturedViews: string[];
    missingViews: string[];
    coverageStatus: "not_started" | "in_progress" | "covered" | "skipped";
  }
) {
  const response = await fetch(`/api/sessions/${sessionId}/rooms/${roomType}/progress`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to update room progress");
  return response.json();
}

export async function fetchReport(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/report`);
  if (!response.ok) throw new Error("Report unavailable");
  return response.json() as Promise<{ report: unknown }>;
}

export async function listSessions() {
  const response = await fetch("/api/sessions");
  if (!response.ok) throw new Error("Failed to list sessions");
  return response.json() as Promise<{
    sessions: Array<{
      id: string;
      createdAt: string;
      startedAt: string;
      status: string;
      city?: string;
      currentRoom?: string;
      overallRiskLevel?: string;
      reportAvailable: boolean;
    }>;
  }>;
}

export async function listReports() {
  const response = await fetch("/api/reports");
  if (!response.ok) throw new Error("Failed to list reports");
  return response.json() as Promise<{
    reports: Array<{
      sessionId: string;
      createdAt: string;
      riskLevel?: string;
      hazardCount?: number;
      roomCount?: number;
      summary?: string;
    }>;
  }>;
}
