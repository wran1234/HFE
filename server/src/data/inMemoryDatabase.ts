import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import {
  AssessmentResult,
  HazardObservation,
  Home,
  InspectionSession,
  ReportPayload,
  RoomScan,
  SessionContextUpdate,
  User,
} from "../domain/types";
import { RoomType } from "../domain/enums";
import { ROOM_CHECKLISTS } from "../domain/roomChecklists";

const toIso = (value: Date | string | null | undefined): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
};
const AUTH_SECRET = process.env.AUTH_SESSION_SECRET || "dev-only-secret";
const hashSessionToken = (token: string): string =>
  crypto.createHash("sha256").update(`${token}:${AUTH_SECRET}`).digest("hex");

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export class PostgresDatabase {
  private mapSession(row: {
    id: string;
    userId: string;
    homeId: string | null;
    status: string;
    residentAge: number | null;
    mobilityAid: string | null;
    fallHistory: number | null;
    nightBathroomTrips: boolean | null;
    city: string | null;
    startedAt: Date;
    endedAt: Date | null;
    overallRiskLevel: string | null;
    currentRoom: string | null;
    conversationHistory: Prisma.JsonValue | null;
  }): InspectionSession {
    return {
      id: row.id,
      userId: row.userId,
      homeId: row.homeId ?? "",
      status: row.status as InspectionSession["status"],
      residentAge: row.residentAge ?? 0,
      mobilityAid: (row.mobilityAid as InspectionSession["mobilityAid"]) ?? "none",
      fallHistory: row.fallHistory ?? 0,
      nightBathroomTrips: row.nightBathroomTrips ?? false,
      city: row.city ?? undefined,
      startedAt: row.startedAt.toISOString(),
      endedAt: toIso(row.endedAt),
      overallRiskLevel: row.overallRiskLevel as InspectionSession["overallRiskLevel"],
      currentRoom: row.currentRoom as InspectionSession["currentRoom"],
      skippedRooms: [],
      conversationHistory: Array.isArray(row.conversationHistory)
        ? row.conversationHistory as Array<{ role: string; parts: Array<{ text?: string }> }>
        : [],
    };
  }

  async healthCheck(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return { id: user.id, name: user.name ?? undefined, email: user.email, createdAt: user.createdAt.toISOString() };
  }

  async createUser(email: string, name?: string): Promise<User> {
    const user = await prisma.user.create({ data: { email, name } });
    return { id: user.id, name: user.name ?? undefined, email: user.email, createdAt: user.createdAt.toISOString() };
  }

  async createLoginToken(email: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.emailLoginToken.create({
      data: {
        email,
        tokenHash,
        expiresAt,
        userId: user?.id,
      },
    });
  }

  async verifyAndConsumeLoginToken(params: {
    email: string;
    tokenHash: string;
    maxAttempts: number;
  }): Promise<
    | { status: "verified"; userId: string; email: string }
    | { status: "invalid" | "expired" | "too_many_attempts" }
  > {
    const token = await prisma.emailLoginToken.findFirst({
      where: {
        email: params.email,
        usedAt: null,
        invalidatedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!token) return { status: "invalid" };

    const now = new Date();
    if (token.expiresAt <= now) return { status: "expired" };
    if (token.attemptCount >= params.maxAttempts) {
      await prisma.emailLoginToken.update({
        where: { id: token.id },
        data: { invalidatedAt: now },
      });
      return { status: "too_many_attempts" };
    }

    if (token.tokenHash !== params.tokenHash) {
      const attemptCount = token.attemptCount + 1;
      await prisma.emailLoginToken.update({
        where: { id: token.id },
        data: {
          attemptCount,
          lastAttemptAt: now,
          invalidatedAt: attemptCount >= params.maxAttempts ? now : null,
        },
      });
      return { status: attemptCount >= params.maxAttempts ? "too_many_attempts" : "invalid" };
    }

    await prisma.emailLoginToken.update({
      where: { id: token.id },
      data: {
        usedAt: now,
        attemptCount: token.attemptCount + 1,
        lastAttemptAt: now,
      },
    });

    let userId = token.userId ?? null;
    if (!userId) {
      const user = await prisma.user.upsert({
        where: { email: params.email },
        update: {},
        create: { email: params.email },
      });
      userId = user.id;
    }
    return { status: "verified", userId, email: params.email };
  }

  async createAuthSession(userId: string, expiresAt: Date): Promise<{ token: string; expiresAt: string }> {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    await prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        lastSeenAt: new Date(),
      },
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async findUserBySessionToken(token: string): Promise<User | null> {
    const tokenHash = hashSessionToken(token);
    const authSession = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!authSession) return null;
    if (authSession.expiresAt <= new Date()) {
      await prisma.authSession.deleteMany({ where: { id: authSession.id } });
      return null;
    }
    await prisma.authSession.update({
      where: { id: authSession.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      id: authSession.user.id,
      email: authSession.user.email,
      name: authSession.user.name ?? undefined,
      createdAt: authSession.user.createdAt.toISOString(),
    };
  }

  async deleteSessionToken(token: string): Promise<void> {
    const tokenHash = hashSessionToken(token);
    await prisma.authSession.deleteMany({ where: { tokenHash } });
  }

  async ensureHomeForUser(userId: string, city?: string): Promise<Home> {
    const existing = await prisma.home.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        id: existing.id,
        userId: existing.userId,
        city: existing.city ?? undefined,
        createdAt: existing.createdAt.toISOString(),
      };
    }
    const home = await prisma.home.create({
      data: { userId, city },
    });
    return {
      id: home.id,
      userId: home.userId,
      city: home.city ?? undefined,
      createdAt: home.createdAt.toISOString(),
    };
  }

  async createSession(input: Omit<InspectionSession, "id" | "startedAt" | "status" | "skippedRooms">): Promise<InspectionSession> {
    const session = await prisma.inspectionSession.create({
      data: {
        userId: input.userId,
        homeId: input.homeId,
        status: "active",
        residentAge: input.residentAge,
        mobilityAid: input.mobilityAid,
        fallHistory: input.fallHistory,
        nightBathroomTrips: input.nightBathroomTrips,
        city: input.city,
        overallRiskLevel: input.overallRiskLevel,
      },
    });
    return this.mapSession(session);
  }

  async getSession(sessionId: string): Promise<InspectionSession | undefined> {
    const session = await prisma.inspectionSession.findUnique({ where: { id: sessionId } });
    if (!session) return undefined;
    return this.mapSession(session);
  }

  async findActiveSessionForUser(userId: string): Promise<InspectionSession | null> {
    const row = await prisma.inspectionSession.findFirst({
      where: {
        userId,
        status: { in: ["active", "in_progress"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? this.mapSession(row) : null;
  }

  async updateSessionConversationHistory(
    sessionId: string,
    history: Array<{ role: string; parts: Array<{ text?: string }> }>
  ): Promise<void> {
    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { conversationHistory: history as unknown as Prisma.JsonArray },
    });
  }

  async updateSessionContext(sessionId: string, update: SessionContextUpdate): Promise<InspectionSession | undefined> {
    const session = await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: {
        residentAge: update.residentAge,
        mobilityAid: update.mobilityAid,
        fallHistory: update.fallHistory,
        nightBathroomTrips: update.nightBathroomTrips,
        city: update.city,
      },
    }).catch(() => null);
    if (!session) return undefined;
    return this.getSession(sessionId);
  }

  async updateSession(session: InspectionSession): Promise<void> {
    await prisma.inspectionSession.update({
      where: { id: session.id },
      data: {
        status: session.status,
        endedAt: session.endedAt ? new Date(session.endedAt) : null,
        overallRiskLevel: session.overallRiskLevel,
        currentRoom: (session as unknown as { currentRoom?: string }).currentRoom,
      },
    });
  }

  async getOrCreateRoomScan(sessionId: string, roomType: RoomType): Promise<RoomScan> {
    const existing = await prisma.roomScan.findUnique({
      where: {
        sessionId_roomType: {
          sessionId,
          roomType,
        },
      },
    });
    if (existing) {
      return {
        id: existing.id,
        sessionId: existing.sessionId,
        roomType: existing.roomType as RoomType,
        coverageStatus: existing.coverageStatus as RoomScan["coverageStatus"],
        requiredViews: asStringArray(existing.requiredViews),
        capturedViews: asStringArray(existing.capturedViews),
        missingViews: asStringArray(existing.missingViews),
        notes: existing.notes ?? undefined,
      };
    }
    const requiredViews = ROOM_CHECKLISTS[roomType];
    const created = await prisma.roomScan.create({
      data: {
        sessionId,
        roomType,
        coverageStatus: "not_started",
        requiredViews,
        capturedViews: [],
        missingViews: requiredViews,
      },
    });
    return {
      id: created.id,
      sessionId: created.sessionId,
      roomType: created.roomType as RoomType,
      coverageStatus: created.coverageStatus as RoomScan["coverageStatus"],
      requiredViews: asStringArray(created.requiredViews),
      capturedViews: asStringArray(created.capturedViews),
      missingViews: asStringArray(created.missingViews),
      notes: created.notes ?? undefined,
    };
  }

  async saveRoomScan(scan: RoomScan): Promise<RoomScan> {
    const saved = await prisma.roomScan.update({
      where: { id: scan.id },
      data: {
        coverageStatus: scan.coverageStatus,
        requiredViews: scan.requiredViews,
        capturedViews: scan.capturedViews,
        missingViews: scan.missingViews,
        notes: scan.notes,
      },
    });
    return {
      id: saved.id,
      sessionId: saved.sessionId,
      roomType: saved.roomType as RoomType,
      coverageStatus: saved.coverageStatus as RoomScan["coverageStatus"],
      requiredViews: asStringArray(saved.requiredViews),
      capturedViews: asStringArray(saved.capturedViews),
      missingViews: asStringArray(saved.missingViews),
      notes: saved.notes ?? undefined,
    };
  }

  async listRoomScans(sessionId: string): Promise<RoomScan[]> {
    const scans = await prisma.roomScan.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
    return scans.map((scan) => ({
      id: scan.id,
      sessionId: scan.sessionId,
      roomType: scan.roomType as RoomType,
      coverageStatus: scan.coverageStatus as RoomScan["coverageStatus"],
      requiredViews: asStringArray(scan.requiredViews),
      capturedViews: asStringArray(scan.capturedViews),
      missingViews: asStringArray(scan.missingViews),
      notes: scan.notes ?? undefined,
    }));
  }

  async createObservation(input: Omit<HazardObservation, "id" | "createdAt">): Promise<HazardObservation> {
    const observation = await prisma.hazardObservation.create({
      data: {
        sessionId: input.sessionId,
        roomScanId: input.roomScanId,
        roomType: input.roomType,
        hazardType: input.hazardType,
        severityHint: input.severityHint,
        evidenceImagePath: input.evidenceImagePath,
        modelNote: input.modelNote,
        followUpNeeded: input.followUpNeeded,
        status: input.status,
      },
    });
    return {
      id: observation.id,
      sessionId: observation.sessionId,
      roomScanId: observation.roomScanId ?? undefined,
      roomType: observation.roomType as RoomType,
      hazardType: observation.hazardType as HazardObservation["hazardType"],
      severityHint: (observation.severityHint as HazardObservation["severityHint"]) ?? "low",
      evidenceImagePath: observation.evidenceImagePath ?? undefined,
      modelNote: observation.modelNote ?? "",
      followUpNeeded: observation.followUpNeeded,
      status: observation.status as HazardObservation["status"],
      createdAt: observation.createdAt.toISOString(),
    };
  }

  async updateObservationEvidence(observationId: string, evidence: { evidenceAssetId: string; evidenceImagePath?: string }): Promise<void> {
    await prisma.hazardObservation.update({
      where: { id: observationId },
      data: {
        evidenceAssetId: evidence.evidenceAssetId,
        evidenceImagePath: evidence.evidenceImagePath,
      },
    });
  }

  async listObservations(sessionId: string): Promise<HazardObservation[]> {
    const observations = await prisma.hazardObservation.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
    return observations.map((observation) => ({
      id: observation.id,
      sessionId: observation.sessionId,
      roomScanId: observation.roomScanId ?? undefined,
      roomType: observation.roomType as RoomType,
      hazardType: observation.hazardType as HazardObservation["hazardType"],
      severityHint: (observation.severityHint as HazardObservation["severityHint"]) ?? "low",
      evidenceImagePath: observation.evidenceImagePath ?? undefined,
      modelNote: observation.modelNote ?? "",
      followUpNeeded: observation.followUpNeeded,
      status: observation.status as HazardObservation["status"],
      createdAt: observation.createdAt.toISOString(),
    }));
  }

  async saveAssessment(result: AssessmentResult): Promise<void> {
    await prisma.$transaction([
      prisma.finalHazard.deleteMany({ where: { sessionId: result.sessionId } }),
      prisma.recommendation.deleteMany({ where: { sessionId: result.sessionId } }),
    ]);

    for (const hazard of result.finalHazards) {
      await prisma.finalHazard.create({
        data: {
          id: hazard.id,
          sessionId: hazard.sessionId,
          roomType: hazard.roomType,
          hazardType: hazard.hazardType,
          severity: hazard.severity,
          reason: hazard.reason,
          priority: hazard.priority,
          evidenceImagePath: hazard.evidenceImagePath,
        },
      });
    }
    for (const rec of result.recommendations) {
      await prisma.recommendation.create({
        data: {
          id: rec.id,
          sessionId: rec.sessionId,
          finalHazardId: rec.finalHazardId,
          fixType: rec.fixType,
          title: rec.title,
          description: rec.description,
          priority: rec.priority,
          estimatedCostMin: rec.estimatedCostMin,
          estimatedCostMax: rec.estimatedCostMax,
          materialsJson: rec.materialsJson,
          installationComplexity: rec.installationComplexity,
        },
      });
    }
  }

  async saveReport(report: ReportPayload, userId?: string): Promise<void> {
    if (!userId) return;
    const existing = await prisma.reportSnapshot.findFirst({
      where: { sessionId: report.sessionId, userId },
    });
    if (existing) {
      await prisma.reportSnapshot.update({
        where: { id: existing.id },
        data: { reportJson: report as unknown as object },
      });
      return;
    }
    await prisma.reportSnapshot.create({
      data: {
        sessionId: report.sessionId,
        userId,
        reportJson: report as unknown as object,
      },
    });
  }

  async getReport(sessionId: string, userId?: string): Promise<ReportPayload | undefined> {
    const report = await prisma.reportSnapshot.findFirst({
      where: {
        sessionId,
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!report) return undefined;
    return report.reportJson as unknown as ReportPayload;
  }

  async createEvidenceAsset(input: {
    userId: string;
    sessionId: string;
    roomType?: RoomType;
    storageProvider: string;
    storageKey: string;
    publicUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    hazardObservationId?: string;
  }): Promise<{ id: string; publicUrl?: string; storageKey: string }> {
    const asset = await prisma.evidenceAsset.create({
      data: input,
    });
    return {
      id: asset.id,
      publicUrl: asset.publicUrl ?? undefined,
      storageKey: asset.storageKey,
    };
  }

  async listReportsForUser(userId: string): Promise<Array<{ sessionId: string; createdAt: string; reportJson: unknown }>> {
    const reports = await prisma.reportSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return reports.map((report) => ({
      sessionId: report.sessionId,
      createdAt: report.createdAt.toISOString(),
      reportJson: report.reportJson,
    }));
  }

  async listSessionsForUser(userId: string): Promise<
    Array<{
      id: string;
      startedAt: string;
      createdAt: string;
      status: string;
      city?: string;
      currentRoom?: string;
      overallRiskLevel?: string;
      reportAvailable: boolean;
    }>
  > {
    const sessions = await prisma.inspectionSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { reportSnapshots: { select: { id: true } } },
    });
    return sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      status: session.status,
      city: session.city ?? undefined,
      currentRoom: session.currentRoom ?? undefined,
      overallRiskLevel: session.overallRiskLevel ?? undefined,
      reportAvailable: session.reportSnapshots.length > 0,
    }));
  }

  async cleanupAuthRecords(retentionHours: number): Promise<{
    expiredSessionsDeleted: number;
    expiredTokensDeleted: number;
    usedTokensDeleted: number;
  }> {
    const now = new Date();
    const retentionCutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const [expiredSessions, expiredTokens, usedTokens] = await prisma.$transaction([
      prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.emailLoginToken.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      }),
      prisma.emailLoginToken.deleteMany({
        where: {
          usedAt: { not: null, lt: retentionCutoff },
        },
      }),
    ]);
    return {
      expiredSessionsDeleted: expiredSessions.count,
      expiredTokensDeleted: expiredTokens.count,
      usedTokensDeleted: usedTokens.count,
    };
  }
}

export const db = new PostgresDatabase();
