import { RoomId } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(path, { headers: jsonHeaders, signal: controller.signal, ...init });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Request failed: ${response.status}`);
    }
    return response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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

export async function listSessions(params?: { limit?: number; cursor?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  return apiFetch(`/api/sessions${qs.size ? `?${qs}` : ""}`) as Promise<{
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
    nextCursor: string | null;
  }>;
}

export async function listReports(params?: { limit?: number; cursor?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  return apiFetch(`/api/reports${qs.size ? `?${qs}` : ""}`) as Promise<{
    reports: Array<{
      sessionId: string;
      createdAt: string;
      riskLevel?: string;
      hazardCount?: number;
      roomCount?: number;
      summary?: string;
    }>;
    nextCursor: string | null;
  }>;
}
