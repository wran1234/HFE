import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import {
  AssessmentResult,
  AssessmentReview,
  AssessmentReviewStatus,
  CareNote,
  CareNoteAuthorRole,
  CareNoteSummary,
  CareNoteType,
  CareCoordinationRow,
  EvidenceUploaderRole,
  HazardObservation,
  Home,
  InspectionSession,
  CohortMetrics,
  FollowUpCheckIn,
  FollowUpCheckInStatus,
  FollowUpCheckInType,
  PartnerOrganization,
  PartnerOrganizationType,
  PartnerReferral,
  PartnerReferralInviteType,
  PartnerReferralStatus,
  PilotCohort,
  PilotCohortDashboard,
  PilotCohortStatus,
  PilotMetrics,
  RecommendationEvidence,
  RecommendationEvidenceType,
  ReportPayload,
  RoomScan,
  SeniorProfile,
  ServiceRequest,
  ServiceRequesterRole,
  ServiceRequestStatus,
  ServiceType,
  SessionContextUpdate,
  User,
  ReviewConfidenceLevel,
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
const userRole = (value: string | null | undefined): User["role"] => value === "admin" ? "admin" : "user";
const sanitizeJsonArray = (value: unknown): Prisma.InputJsonValue | undefined =>
  Array.isArray(value) ? value.map(String) : undefined;

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
    consentAccepted?: boolean;
    consentAcceptedAt?: Date | null;
    consentVersion?: string | null;
    recordingPermissionConfirmed?: boolean;
    shareWithCareCoordinator?: boolean;
    shareWithContractor?: boolean;
    shareWithInsurer?: boolean;
    pilotCohortId?: string | null;
    referralId?: string | null;
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
      consentAccepted: row.consentAccepted ?? false,
      consentAcceptedAt: toIso(row.consentAcceptedAt),
      consentVersion: row.consentVersion ?? undefined,
      recordingPermissionConfirmed: row.recordingPermissionConfirmed ?? false,
      shareWithCareCoordinator: row.shareWithCareCoordinator ?? false,
      shareWithContractor: row.shareWithContractor ?? false,
      shareWithInsurer: row.shareWithInsurer ?? false,
      pilotCohortId: row.pilotCohortId ?? undefined,
      referralId: row.referralId ?? undefined,
    };
  }

  private mapSeniorProfile(row: {
    sessionId: string;
    seniorName: string | null;
    relationshipToUser: string | null;
    ageRange: string;
    livingArrangement: string;
    mobilityLevel: string;
    priorFalls: string;
    chronicConditions: Prisma.JsonValue | null;
    medicationComplexity: string;
    memoryConcerns: string;
    visionConcerns: boolean | null;
    hearingConcerns: boolean | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    primaryCaregiver: string | null;
  }): SeniorProfile {
    return {
      sessionId: row.sessionId,
      seniorName: row.seniorName ?? undefined,
      relationshipToUser: row.relationshipToUser ?? undefined,
      ageRange: row.ageRange as SeniorProfile["ageRange"],
      livingArrangement: row.livingArrangement as SeniorProfile["livingArrangement"],
      mobilityLevel: row.mobilityLevel as SeniorProfile["mobilityLevel"],
      priorFalls: row.priorFalls as SeniorProfile["priorFalls"],
      chronicConditions: asStringArray(row.chronicConditions),
      medicationComplexity: row.medicationComplexity as SeniorProfile["medicationComplexity"],
      memoryConcerns: row.memoryConcerns as SeniorProfile["memoryConcerns"],
      visionConcerns: row.visionConcerns ?? undefined,
      hearingConcerns: row.hearingConcerns ?? undefined,
      emergencyContactName: row.emergencyContactName ?? undefined,
      emergencyContactPhone: row.emergencyContactPhone ?? undefined,
      primaryCaregiver: row.primaryCaregiver ?? undefined,
    };
  }

  private mapCareNote(row: {
    id: string;
    sessionId: string;
    noteType: string;
    authorName: string | null;
    authorRole: string;
    body: string;
    observedChanges: string | null;
    concerns: string | null;
    followUpNeeded: boolean;
    createdAt: Date;
  }): CareNote {
    return {
      id: row.id,
      sessionId: row.sessionId,
      noteType: row.noteType as CareNoteType,
      authorName: row.authorName ?? undefined,
      authorRole: row.authorRole as CareNoteAuthorRole,
      body: row.body,
      observedChanges: row.observedChanges ?? undefined,
      concerns: row.concerns ?? undefined,
      followUpNeeded: row.followUpNeeded,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapRecommendationEvidence(row: {
    id: string;
    sessionId: string;
    recommendationActionId: string;
    evidenceType: string;
    imageUrl: string | null;
    note: string | null;
    uploadedByRole: string;
    createdAt: Date;
  }): RecommendationEvidence {
    return {
      id: row.id,
      sessionId: row.sessionId,
      recommendationActionId: row.recommendationActionId,
      evidenceType: row.evidenceType as RecommendationEvidenceType,
      imageUrl: row.imageUrl ?? undefined,
      note: row.note ?? undefined,
      uploadedByRole: row.uploadedByRole as EvidenceUploaderRole,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapServiceRequest(row: {
    id: string;
    sessionId: string;
    recommendationActionId: string | null;
    serviceType: string;
    title: string;
    description: string;
    priority: string;
    requestedByRole: string;
    requestedByName: string | null;
    status: string;
    preferredDate: Date | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
    providerName: string | null;
    providerContact: string | null;
    notes: string | null;
    serviceQualityRating?: number | null;
    familyFeedback?: string | null;
    providerFollowupNeeded?: boolean;
    completionVerified?: boolean;
    completionVerifiedAt?: Date | null;
    completionVerifiedBy?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ServiceRequest {
    return {
      id: row.id,
      sessionId: row.sessionId,
      recommendationActionId: row.recommendationActionId ?? undefined,
      serviceType: row.serviceType as ServiceType,
      title: row.title,
      description: row.description,
      priority: row.priority as ServiceRequest["priority"],
      requestedByRole: row.requestedByRole as ServiceRequesterRole,
      requestedByName: row.requestedByName ?? undefined,
      status: row.status as ServiceRequestStatus,
      preferredDate: toIso(row.preferredDate),
      scheduledAt: toIso(row.scheduledAt),
      completedAt: toIso(row.completedAt),
      providerName: row.providerName ?? undefined,
      providerContact: row.providerContact ?? undefined,
      notes: row.notes ?? undefined,
      serviceQualityRating: row.serviceQualityRating ?? undefined,
      familyFeedback: row.familyFeedback ?? undefined,
      providerFollowupNeeded: row.providerFollowupNeeded ?? false,
      completionVerified: row.completionVerified ?? false,
      completionVerifiedAt: toIso(row.completionVerifiedAt),
      completionVerifiedBy: row.completionVerifiedBy ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAssessmentReview(row: {
    sessionId: string;
    reviewStatus: string;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    reviewerNotes: string | null;
    confidenceLevel: string;
    flaggedIssues: Prisma.JsonValue | null;
  }): AssessmentReview {
    return {
      sessionId: row.sessionId,
      reviewStatus: row.reviewStatus as AssessmentReviewStatus,
      reviewedBy: row.reviewedBy ?? undefined,
      reviewedAt: toIso(row.reviewedAt),
      reviewerNotes: row.reviewerNotes ?? undefined,
      confidenceLevel: row.confidenceLevel as ReviewConfidenceLevel,
      flaggedIssues: asStringArray(row.flaggedIssues),
    };
  }

  private mapPartnerOrganization(row: {
    id: string;
    name: string;
    organizationType: string;
    displayName: string | null;
    logoUrl: string | null;
    primaryContact: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PartnerOrganization {
    return {
      id: row.id,
      name: row.name,
      organizationType: row.organizationType as PartnerOrganizationType,
      displayName: row.displayName ?? undefined,
      logoUrl: row.logoUrl ?? undefined,
      primaryContact: row.primaryContact ?? undefined,
      contactName: row.contactName ?? undefined,
      contactEmail: row.contactEmail ?? undefined,
      contactPhone: row.contactPhone ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapPilotCohort(row: {
    id: string;
    partnerOrganizationId: string;
    partnerOrganization?: {
      id: string;
      name: string;
      organizationType: string;
      displayName: string | null;
      logoUrl: string | null;
      primaryContact: string | null;
      contactName: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    name: string;
    description: string | null;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    targetHouseholds: number | null;
    consentVersion: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PilotCohort {
    return {
      id: row.id,
      partnerOrganizationId: row.partnerOrganizationId,
      partnerOrganization: row.partnerOrganization ? this.mapPartnerOrganization(row.partnerOrganization) : undefined,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status as PilotCohortStatus,
      startDate: toIso(row.startDate),
      endDate: toIso(row.endDate),
      targetHouseholds: row.targetHouseholds ?? undefined,
      consentVersion: row.consentVersion ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapFollowUpCheckIn(row: {
    id: string;
    sessionId: string;
    pilotCohortId: string | null;
    checkInType: string;
    status: string;
    scheduledFor: Date;
    completedAt: Date | null;
    notes: string | null;
    newFallsReported: boolean | null;
    nearFallsReported: boolean | null;
    newHospitalVisitReported: boolean | null;
    newCaregiverSupportAdded: boolean | null;
    majorHomeFixCompleted: boolean | null;
    medicationRoutineImproved: boolean | null;
    parentFeelsSafer: string | null;
    familyFeelsMorePrepared: string | null;
    currentBiggestConcern: string | null;
    requestCareCoordinatorFollowup: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): FollowUpCheckIn {
    return {
      id: row.id,
      sessionId: row.sessionId,
      pilotCohortId: row.pilotCohortId ?? undefined,
      checkInType: row.checkInType as FollowUpCheckInType,
      status: row.status as FollowUpCheckInStatus,
      scheduledFor: row.scheduledFor.toISOString(),
      completedAt: toIso(row.completedAt),
      notes: row.notes ?? undefined,
      newFallsReported: row.newFallsReported ?? undefined,
      nearFallsReported: row.nearFallsReported ?? undefined,
      newHospitalVisitReported: row.newHospitalVisitReported ?? undefined,
      newCaregiverSupportAdded: row.newCaregiverSupportAdded ?? undefined,
      majorHomeFixCompleted: row.majorHomeFixCompleted ?? undefined,
      medicationRoutineImproved: row.medicationRoutineImproved ?? undefined,
      parentFeelsSafer: row.parentFeelsSafer as FollowUpCheckIn["parentFeelsSafer"],
      familyFeelsMorePrepared: row.familyFeelsMorePrepared as FollowUpCheckIn["familyFeelsMorePrepared"],
      currentBiggestConcern: row.currentBiggestConcern ?? undefined,
      requestCareCoordinatorFollowup: row.requestCareCoordinatorFollowup,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapPartnerReferral(row: {
    id: string;
    partnerOrganizationId: string;
    pilotCohortId: string | null;
    referralCode: string;
    inviteType: string;
    recipientName: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    seniorName: string | null;
    status: string;
    sourceLabel: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    openedAt: Date | null;
    startedAt: Date | null;
    consentCompletedAt: Date | null;
    assessmentCompletedAt: Date | null;
    reportGeneratedAt: Date | null;
  }): PartnerReferral {
    return {
      id: row.id,
      partnerOrganizationId: row.partnerOrganizationId,
      pilotCohortId: row.pilotCohortId ?? undefined,
      referralCode: row.referralCode,
      inviteType: row.inviteType as PartnerReferralInviteType,
      recipientName: row.recipientName ?? undefined,
      recipientEmail: row.recipientEmail ?? undefined,
      recipientPhone: row.recipientPhone ?? undefined,
      seniorName: row.seniorName ?? undefined,
      status: row.status as PartnerReferralStatus,
      sourceLabel: row.sourceLabel ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      openedAt: toIso(row.openedAt),
      startedAt: toIso(row.startedAt),
      consentCompletedAt: toIso(row.consentCompletedAt),
      assessmentCompletedAt: toIso(row.assessmentCompletedAt),
      reportGeneratedAt: toIso(row.reportGeneratedAt),
    };
  }

  async healthCheck(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return { id: user.id, name: user.name ?? undefined, email: user.email, role: userRole(user.role), createdAt: user.createdAt.toISOString() };
  }

  async createUser(email: string, name?: string): Promise<User> {
    const user = await prisma.user.create({ data: { email, name } });
    return { id: user.id, name: user.name ?? undefined, email: user.email, role: userRole(user.role), createdAt: user.createdAt.toISOString() };
  }

  async setUserRole(userId: string, role: User["role"]): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    return { id: user.id, name: user.name ?? undefined, email: user.email, role: userRole(user.role), createdAt: user.createdAt.toISOString() };
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
    // Fire-and-forget: update lastSeenAt without blocking the request path.
    prisma.authSession.update({
      where: { id: authSession.id },
      data: { lastSeenAt: new Date() },
    }).catch((err) => console.warn("[AUTH] lastSeenAt update failed:", String(err)));
    return {
      id: authSession.user.id,
      email: authSession.user.email,
      name: authSession.user.name ?? undefined,
      role: userRole(authSession.user.role),
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
        consentAccepted: input.consentAccepted ?? false,
        consentAcceptedAt: input.consentAccepted ? new Date(input.consentAcceptedAt ?? new Date()) : null,
        consentVersion: input.consentVersion,
        recordingPermissionConfirmed: input.recordingPermissionConfirmed ?? false,
        shareWithCareCoordinator: input.shareWithCareCoordinator ?? false,
        shareWithContractor: input.shareWithContractor ?? false,
        shareWithInsurer: input.shareWithInsurer ?? false,
        pilotCohortId: input.pilotCohortId,
        referralId: input.referralId,
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
        consentAccepted: update.consent?.consentAccepted,
        consentAcceptedAt: update.consent?.consentAccepted ? new Date(update.consent.consentAcceptedAt ?? new Date()) : undefined,
        consentVersion: update.consent?.consentVersion,
        recordingPermissionConfirmed: update.consent?.recordingPermissionConfirmed,
        shareWithCareCoordinator: update.consent?.shareWithCareCoordinator,
        shareWithContractor: update.consent?.shareWithContractor,
        shareWithInsurer: update.consent?.shareWithInsurer,
      },
    }).catch(() => null);
    if (!session) return undefined;
    if (update.seniorProfile) {
      await this.upsertSeniorProfile(sessionId, update.seniorProfile);
    }
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
        consentAccepted: session.consentAccepted,
        consentAcceptedAt: session.consentAccepted ? new Date(session.consentAcceptedAt ?? new Date()) : undefined,
        consentVersion: session.consentVersion,
        recordingPermissionConfirmed: session.recordingPermissionConfirmed,
        shareWithCareCoordinator: session.shareWithCareCoordinator,
        shareWithContractor: session.shareWithContractor,
        shareWithInsurer: session.shareWithInsurer,
        pilotCohortId: session.pilotCohortId ?? null,
        referralId: session.referralId ?? null,
      },
    });
  }

  async getAssessmentReview(sessionId: string): Promise<AssessmentReview> {
    const review = await prisma.assessmentReview.upsert({
      where: { sessionId },
      update: {},
      create: { sessionId, reviewStatus: "not_reviewed", confidenceLevel: "medium" },
    });
    return this.mapAssessmentReview(review);
  }

  async updateAssessmentReview(input: {
    sessionId: string;
    reviewStatus: AssessmentReviewStatus;
    reviewedBy?: string;
    reviewerNotes?: string | null;
    confidenceLevel: ReviewConfidenceLevel;
    flaggedIssues?: string[];
  }): Promise<AssessmentReview> {
    const review = await prisma.assessmentReview.upsert({
      where: { sessionId: input.sessionId },
      update: {
        reviewStatus: input.reviewStatus,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewStatus === "not_reviewed" ? null : new Date(),
        reviewerNotes: input.reviewerNotes,
        confidenceLevel: input.confidenceLevel,
        flaggedIssues: sanitizeJsonArray(input.flaggedIssues),
      },
      create: {
        sessionId: input.sessionId,
        reviewStatus: input.reviewStatus,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewStatus === "not_reviewed" ? null : new Date(),
        reviewerNotes: input.reviewerNotes,
        confidenceLevel: input.confidenceLevel,
        flaggedIssues: sanitizeJsonArray(input.flaggedIssues),
      },
    });
    return this.mapAssessmentReview(review);
  }

  async upsertSeniorProfile(sessionId: string, input: Partial<SeniorProfile>): Promise<SeniorProfile> {
    const data = {
      seniorName: input.seniorName,
      relationshipToUser: input.relationshipToUser,
      ageRange: input.ageRange ?? "unknown",
      livingArrangement: input.livingArrangement ?? "unknown",
      mobilityLevel: input.mobilityLevel ?? "unknown",
      priorFalls: input.priorFalls ?? "unknown",
      chronicConditions: sanitizeJsonArray(input.chronicConditions),
      medicationComplexity: input.medicationComplexity ?? "unknown",
      memoryConcerns: input.memoryConcerns ?? "unknown",
      visionConcerns: input.visionConcerns,
      hearingConcerns: input.hearingConcerns,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      primaryCaregiver: input.primaryCaregiver,
    };
    const profile = await prisma.seniorProfile.upsert({
      where: { sessionId },
      update: data,
      create: {
        sessionId,
        ...data,
      },
    });
    return this.mapSeniorProfile(profile);
  }

  async getSeniorProfile(sessionId: string): Promise<SeniorProfile | undefined> {
    const profile = await prisma.seniorProfile.findUnique({ where: { sessionId } });
    return profile ? this.mapSeniorProfile(profile) : undefined;
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
      ...result.finalHazards.map((hazard) =>
        prisma.finalHazard.create({
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
        })
      ),
      ...result.recommendations.map((rec) =>
        prisma.recommendation.create({
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
            actionStatus: rec.actionStatus ?? "pending",
            actionOwner: rec.actionOwner,
            actionPriority: rec.actionPriority,
            dueDate: rec.dueDate ? new Date(rec.dueDate) : undefined,
            completedAt: rec.completedAt ? new Date(rec.completedAt) : undefined,
            skippedReason: rec.skippedReason,
            estimatedPreventionImpact: rec.estimatedPreventionImpact,
          },
        })
      ),
    ]);
  }

  async findRecentContractorLead(userId: string, zipCode: string): Promise<{ id: string } | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lead = await prisma.contractorLead.findFirst({
      where: { userId, zipCode, createdAt: { gte: oneHourAgo } },
      select: { id: true },
    });
    return lead;
  }

  async findRecentContractorLeadByEmailZip(input: {
    email: string;
    zipCode: string;
    withinMinutes: number;
  }): Promise<{ id: string } | null> {
    const since = new Date(Date.now() - input.withinMinutes * 60 * 1000);
    const lead = await prisma.contractorLead.findFirst({
      where: {
        email: input.email,
        zipCode: input.zipCode,
        createdAt: { gte: since },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    return lead;
  }

  async saveContractorLead(input: {
    userId?: string;
    sessionId?: string;
    name: string;
    email: string;
    zipCode: string;
    phone?: string;
    preferredContact: "email" | "phone" | "either";
    notes?: string;
    projectUrgency?: "immediately" | "within_30_days" | "within_3_months" | "just_researching";
    estimatedBudget?: "under_500" | "500_2000" | "2000_5000" | "over_5000" | "unsure";
    scopeText: string;
  }): Promise<{ id: string }> {
    const lead = await prisma.contractorLead.create({ data: input });
    return { id: lead.id };
  }

  async listContractorSuggestions(input: {
    sessionId: string;
    zipCode: string;
    trades: string[];
  }): Promise<Array<{
    id: string;
    trade: string;
    zipCode: string;
    provider: string;
    externalId?: string;
    name: string;
    rating?: number;
    reviewCount?: number;
    address?: string;
    phone?: string;
    websiteUrl?: string;
    profileUrl?: string;
    sourceUrl?: string;
    status: string;
    createdAt: string;
  }>> {
    const suggestions = await prisma.contractorSuggestion.findMany({
      where: {
        sessionId: input.sessionId,
        zipCode: input.zipCode,
        trade: { in: input.trades },
      },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }, { createdAt: "desc" }],
    });
    return suggestions.map((suggestion) => ({
      id: suggestion.id,
      trade: suggestion.trade,
      zipCode: suggestion.zipCode,
      provider: suggestion.provider,
      externalId: suggestion.externalId ?? undefined,
      name: suggestion.name,
      rating: suggestion.rating ?? undefined,
      reviewCount: suggestion.reviewCount ?? undefined,
      address: suggestion.address ?? undefined,
      phone: suggestion.phone ?? undefined,
      websiteUrl: suggestion.websiteUrl ?? undefined,
      profileUrl: suggestion.profileUrl ?? undefined,
      sourceUrl: suggestion.sourceUrl ?? undefined,
      status: suggestion.status,
      createdAt: suggestion.createdAt.toISOString(),
    }));
  }

  async saveContractorSuggestions(input: Array<{
    sessionId: string;
    trade: string;
    zipCode: string;
    provider: string;
    externalId?: string;
    name: string;
    rating?: number;
    reviewCount?: number;
    address?: string;
    phone?: string;
    websiteUrl?: string;
    profileUrl?: string;
    sourceUrl?: string;
  }>): Promise<void> {
    // Run all upserts concurrently instead of sequentially to avoid N+1 round trips.
    await Promise.all(
      input.map((suggestion) =>
        prisma.contractorSuggestion.upsert({
          where: {
            sessionId_trade_zipCode_provider_externalId: {
              sessionId: suggestion.sessionId,
              trade: suggestion.trade,
              zipCode: suggestion.zipCode,
              provider: suggestion.provider,
              externalId: suggestion.externalId ?? `${suggestion.provider}:${suggestion.trade}:${suggestion.zipCode}:${suggestion.name}`,
            },
          },
          update: {
            name: suggestion.name,
            rating: suggestion.rating,
            reviewCount: suggestion.reviewCount,
            address: suggestion.address,
            phone: suggestion.phone,
            websiteUrl: suggestion.websiteUrl,
            profileUrl: suggestion.profileUrl,
            sourceUrl: suggestion.sourceUrl,
          },
          create: {
            sessionId: suggestion.sessionId,
            trade: suggestion.trade,
            zipCode: suggestion.zipCode,
            provider: suggestion.provider,
            externalId: suggestion.externalId ?? `${suggestion.provider}:${suggestion.trade}:${suggestion.zipCode}:${suggestion.name}`,
            name: suggestion.name,
            rating: suggestion.rating,
            reviewCount: suggestion.reviewCount,
            address: suggestion.address,
            phone: suggestion.phone,
            websiteUrl: suggestion.websiteUrl,
            profileUrl: suggestion.profileUrl,
            sourceUrl: suggestion.sourceUrl,
          },
        })
      )
    );
  }

  async saveAffiliateClick(input: {
    userId?: string;
    sessionId?: string;
    reportId?: string;
    productName: string;
    category: string;
    affiliateUrl: string;
  }): Promise<{ id: string }> {
    const click = await prisma.affiliateClick.create({ data: input });
    return { id: click.id };
  }

  async findRecentAffiliateClick(input: {
    userId?: string;
    sessionId?: string;
    reportId?: string;
    productName: string;
    category: string;
    affiliateUrl: string;
    withinSeconds: number;
  }): Promise<{ id: string } | null> {
    const since = new Date(Date.now() - input.withinSeconds * 1000);
    const click = await prisma.affiliateClick.findFirst({
      where: {
        productName: input.productName,
        category: input.category,
        affiliateUrl: input.affiliateUrl,
        createdAt: { gte: since },
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.reportId ? { reportId: input.reportId } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    return click;
  }

  async getRevenueSummary(): Promise<{
    totalAffiliateClicks: number;
    totalContractorLeads: number;
    funnelCounts: {
      reportViewed: number;
      affiliateClickStarted: number;
      affiliateClickSaved: number;
      contractorFormOpened: number;
      contractorLeadSubmitted: number;
      contractorLeadSaved: number;
    };
    funnelConversion: {
      reportToAffiliatePercent: number;
      reportToContractorPercent: number;
    };
    clicksByProductCategory: Array<{ productName: string; category: string; count: number }>;
    leadsByZipCode: Array<{ zipCode: string; count: number }>;
    recentContractorLeads: Array<{
      id: string;
      name: string;
      email: string;
      phone?: string;
      zipCode: string;
      preferredContact: string;
      notes?: string;
      status: string;
      internalNotes?: string;
      projectUrgency?: string;
      estimatedBudget?: string;
      createdAt: string;
      sessionId?: string;
    }>;
    betaWaitlist: {
      total: number;
      last7Days: number;
      byZipCode: Array<{ zipCode: string; count: number }>;
      recent: Array<{
        id: string;
        email: string;
        name?: string;
        role?: string;
        zipCode?: string;
        source?: string;
        createdAt: string;
      }>;
    };
    parentSafety: {
      totalAssessments: number;
      independenceRiskCounts: Array<{ riskLevel: string; count: number }>;
      fallRiskCounts: Array<{ riskLevel: string; count: number }>;
      mostCommonHazards: Array<{ hazardType: string; count: number }>;
      completedRecommendationRate: number;
      evidenceAttachmentRate: number;
      careNoteCount: number;
      highRiskSessionsNeedingFollowUp: number;
      sessionsWithIncompleteImmediateActions: number;
      sessionsWithMemorySupportConcerns: number;
      sessionsWithNoRecentCareNote: number;
      pilotMetrics: PilotMetrics;
      careCoordinationRows: CareCoordinationRow[];
      serviceRequests: {
        total: number;
        byType: Array<{ serviceType: string; count: number }>;
        open: number;
        scheduled: number;
        completed: number;
        highPriorityOpen: number;
        urgentRiskNoServiceRequest: number;
      };
    };
  }> {
    const waitlistSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalAffiliateClicks,
      totalContractorLeads,
      clickGroups,
      leadGroups,
      recentLeads,
      analyticsByEvent,
      totalWaitlist,
      waitlistLast7Days,
      waitlistZipGroups,
      recentWaitlist,
      totalAssessments,
      sessionRiskGroups,
      hazardGroups,
      totalRecommendations,
      completedRecommendations,
      careNoteCount,
      highRiskSessionsNeedingFollowUp,
      evidenceRecommendationGroups,
      immediateRecommendations,
      completedImmediateRecommendations,
      memoryConcernCount,
      sessionsWithAnyCareNote,
      recentCareNoteGroups,
      reportRowsForPilot,
      sessionsForCoordination,
      totalServiceRequests,
      serviceRequestsByType,
      openServiceRequests,
      scheduledServiceRequests,
      completedServiceRequests,
      highPriorityOpenServiceRequests,
      verifiedServiceRequests,
      ratedServiceRequests,
      providerFollowupNeededCount,
      providerCompletedGroups,
    ] = await Promise.all([
      prisma.affiliateClick.count(),
      prisma.contractorLead.count(),
      prisma.affiliateClick.groupBy({
        by: ["productName", "category"],
        _count: { _all: true },
      }),
      prisma.contractorLead.groupBy({
        by: ["zipCode"],
        _count: { _all: true },
      }),
      prisma.contractorLead.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          zipCode: true,
          preferredContact: true,
          notes: true,
          status: true,
          internalNotes: true,
          projectUrgency: true,
          estimatedBudget: true,
          createdAt: true,
          sessionId: true,
        },
      }),
      prisma.analyticsEvent.groupBy({
        by: ["eventName"],
        _count: { _all: true },
        where: {
          eventName: {
            in: [
              "report_viewed",
              "affiliate_click_started",
              "affiliate_click_saved",
              "contractor_form_opened",
              "contractor_lead_submitted",
              "contractor_lead_saved",
            ],
          },
        },
      }),
      prisma.betaWaitlistSignup.count(),
      prisma.betaWaitlistSignup.count({ where: { createdAt: { gte: waitlistSince } } }),
      prisma.betaWaitlistSignup.groupBy({
        by: ["zipCode"],
        _count: { _all: true },
        where: { zipCode: { not: null } },
      }),
      prisma.betaWaitlistSignup.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          zipCode: true,
          source: true,
          createdAt: true,
        },
      }),
      prisma.inspectionSession.count(),
      prisma.inspectionSession.groupBy({
        by: ["overallRiskLevel"],
        _count: { _all: true },
        where: { overallRiskLevel: { not: null } },
      }),
      prisma.finalHazard.groupBy({
        by: ["hazardType"],
        _count: { _all: true },
      }),
      prisma.recommendation.count(),
      prisma.recommendation.count({ where: { actionStatus: { in: ["completed", "skipped"] } } }),
      prisma.careNote.count(),
      prisma.inspectionSession.count({
        where: {
          overallRiskLevel: { in: ["high", "critical"] },
          recommendations: { some: { actionStatus: { in: ["pending", "in_progress"] } } },
        },
      }),
      prisma.recommendationEvidence.groupBy({
        by: ["recommendationActionId"],
        _count: { _all: true },
      }),
      prisma.recommendation.count({ where: { actionPriority: "immediate" } }),
      prisma.recommendation.count({ where: { actionPriority: "immediate", actionStatus: { in: ["completed", "skipped"] } } }),
      prisma.seniorProfile.count({ where: { memoryConcerns: { in: ["mild", "moderate", "severe"] } } }),
      prisma.careNote.groupBy({ by: ["sessionId"], _count: { _all: true } }),
      prisma.careNote.groupBy({
        by: ["sessionId"],
        _max: { createdAt: true },
      }),
      prisma.reportSnapshot.findMany({
        orderBy: { createdAt: "desc" },
        select: { sessionId: true, reportJson: true },
      }),
      prisma.inspectionSession.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          seniorProfile: true,
          careNotes: { orderBy: { createdAt: "desc" }, take: 1 },
          contractorLeads: { orderBy: { createdAt: "desc" }, take: 1 },
          recommendations: true,
          serviceRequests: true,
          assessmentReview: true,
        },
      }),
      prisma.serviceRequest.count(),
      prisma.serviceRequest.groupBy({ by: ["serviceType"], _count: { _all: true } }),
      prisma.serviceRequest.count({ where: { status: { in: ["draft", "requested", "matched"] } } }),
      prisma.serviceRequest.count({ where: { status: "scheduled" } }),
      prisma.serviceRequest.count({ where: { status: "completed" } }),
      prisma.serviceRequest.count({
        where: {
          priority: { in: ["immediate", "this_week"] },
          status: { in: ["draft", "requested", "matched"] },
        },
      }),
      prisma.serviceRequest.count({ where: { status: "completed", completionVerified: true } }),
      prisma.serviceRequest.findMany({
        where: { serviceQualityRating: { not: null } },
        select: { serviceQualityRating: true },
      }),
      prisma.serviceRequest.count({ where: { providerFollowupNeeded: true } }),
      prisma.serviceRequest.groupBy({
        by: ["providerName"],
        _count: { _all: true },
        where: { status: "completed", providerName: { not: null } },
      }),
    ]);

    const funnel = {
      reportViewed: 0,
      affiliateClickStarted: 0,
      affiliateClickSaved: 0,
      contractorFormOpened: 0,
      contractorLeadSubmitted: 0,
      contractorLeadSaved: 0,
    };
    for (const row of analyticsByEvent) {
      if (row.eventName === "report_viewed") funnel.reportViewed = row._count._all;
      if (row.eventName === "affiliate_click_started") funnel.affiliateClickStarted = row._count._all;
      if (row.eventName === "affiliate_click_saved") funnel.affiliateClickSaved = row._count._all;
      if (row.eventName === "contractor_form_opened") funnel.contractorFormOpened = row._count._all;
      if (row.eventName === "contractor_lead_submitted") funnel.contractorLeadSubmitted = row._count._all;
      if (row.eventName === "contractor_lead_saved") funnel.contractorLeadSaved = row._count._all;
    }
    const reportToAffiliatePercent = funnel.reportViewed > 0
      ? Math.round((funnel.affiliateClickSaved / funnel.reportViewed) * 1000) / 10
      : 0;
    const reportToContractorPercent = funnel.reportViewed > 0
      ? Math.round((funnel.contractorLeadSaved / funnel.reportViewed) * 1000) / 10
      : 0;
    const latestReportBySession = new Map<string, ReportPayload>();
    for (const row of reportRowsForPilot) {
      if (!latestReportBySession.has(row.sessionId)) {
        latestReportBySession.set(row.sessionId, row.reportJson as unknown as ReportPayload);
      }
    }
    const reports = Array.from(latestReportBySession.values());
    const independenceRiskCounts = new Map<string, number>();
    const fallRiskCounts = new Map<string, number>();
    let highUrgentReports = 0;
    let totalPlanItems = 0;
    let completedPlanItems = 0;
    let immediatePlanItems = 0;
    let completedImmediatePlanItems = 0;
    for (const report of reports) {
      const overall = report.independenceRiskScore?.overallIndependenceRisk ?? report.overallRiskSummary?.level ?? "unknown";
      const fall = report.independenceRiskScore?.fallRisk ?? "unknown";
      independenceRiskCounts.set(overall, (independenceRiskCounts.get(overall) ?? 0) + 1);
      fallRiskCounts.set(fall, (fallRiskCounts.get(fall) ?? 0) + 1);
      if (overall === "high" || overall === "urgent" || overall === "critical") highUrgentReports += 1;
      const plan = report.independencePlan ?? [];
      totalPlanItems += plan.length;
      completedPlanItems += plan.filter((item) => item.status === "completed" || item.status === "skipped").length;
      immediatePlanItems += plan.filter((item) => item.priority === "immediate").length;
      completedImmediatePlanItems += plan.filter((item) => item.priority === "immediate" && (item.status === "completed" || item.status === "skipped")).length;
    }
    const evidenceAttachedRecommendationCount = evidenceRecommendationGroups.length;
    const careNoteSessionIds = new Set(sessionsWithAnyCareNote.map((row) => row.sessionId));
    const serviceRequestSessionIds = new Set(sessionsForCoordination.flatMap((session) => session.serviceRequests.length ? [session.id] : []));
    const recentCareBySession = new Map(recentCareNoteGroups.map((row) => [row.sessionId, row._max.createdAt?.toISOString()]));
    const noRecentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const sessionsWithNoRecentCareNote = sessionsForCoordination.filter((session) => {
      const latest = recentCareBySession.get(session.id);
      return !latest || new Date(latest).getTime() < noRecentCutoff;
    }).length;
    const careCoordinationRows = sessionsForCoordination.map((session, index) => {
      const report = latestReportBySession.get(session.id);
      const plan = report?.independencePlan ?? [];
      const pendingImmediateActions = plan.filter((item) => item.priority === "immediate" && item.status !== "completed" && item.status !== "skipped").length;
      const openServiceRequestsForSession = session.serviceRequests.filter((request) => !["completed", "cancelled"].includes(request.status));
      const nextScheduled = session.serviceRequests
        .filter((request) => request.scheduledAt)
        .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
      const statusSummary = session.serviceRequests.length
        ? `${openServiceRequestsForSession.length} open / ${session.serviceRequests.filter((request) => request.status === "scheduled").length} scheduled / ${session.serviceRequests.filter((request) => request.status === "completed").length} completed`
        : "No service requests";
      return {
        sessionId: session.id,
        parentLabel: session.seniorProfile?.seniorName || `Parent ${index + 1}`,
        riskLevel: report?.independenceRiskScore?.overallIndependenceRisk ?? session.overallRiskLevel ?? "unknown",
        fallRiskLevel: report?.independenceRiskScore?.fallRisk,
        topRiskDriver: report?.independenceRiskScore?.explanationBullets?.[0] ?? "No risk driver recorded yet.",
        pendingImmediateActions,
        lastCareNoteDate: session.careNotes[0]?.createdAt.toISOString(),
        contractorLeadStatus: session.contractorLeads[0]?.status,
        reportUrl: `/report?sessionId=${session.id}`,
        openServiceRequestsCount: openServiceRequestsForSession.length,
        nextScheduledServiceDate: nextScheduled?.scheduledAt?.toISOString(),
        serviceStatusSummary: statusSummary,
        reviewStatus: session.assessmentReview?.reviewStatus ?? "not_reviewed",
        reviewConfidenceLevel: session.assessmentReview?.confidenceLevel as ReviewConfidenceLevel | undefined,
      };
    });
    const urgentRiskNoServiceRequest = sessionsForCoordination.filter((session) => {
      const report = latestReportBySession.get(session.id);
      const urgent = report?.independenceRiskScore?.overallIndependenceRisk === "urgent";
      return urgent && session.serviceRequests.length === 0;
    }).length;
    const pilotMetrics: PilotMetrics = {
      totalAssessments,
      highUrgentRiskPercentage: reports.length > 0 ? Math.round((highUrgentReports / reports.length) * 1000) / 10 : 0,
      mostCommonHazardCategories: hazardGroups
        .map((group) => ({ hazardType: group.hazardType, count: group._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      averageRecommendationsPerAssessment: totalAssessments > 0 ? Math.round((totalRecommendations / totalAssessments) * 10) / 10 : 0,
      actionCompletionRate: totalRecommendations > 0 ? Math.round((completedRecommendations / totalRecommendations) * 1000) / 10 : (totalPlanItems > 0 ? Math.round((completedPlanItems / totalPlanItems) * 1000) / 10 : 0),
      immediateActionCompletionRate: immediateRecommendations > 0 ? Math.round((completedImmediateRecommendations / immediateRecommendations) * 1000) / 10 : (immediatePlanItems > 0 ? Math.round((completedImmediatePlanItems / immediatePlanItems) * 1000) / 10 : 0),
      evidenceAttachmentRate: totalRecommendations > 0 ? Math.round((evidenceAttachedRecommendationCount / totalRecommendations) * 1000) / 10 : 0,
      contractorLeadConversionRate: reportToContractorPercent,
      careNoteUsageRate: totalAssessments > 0 ? Math.round((careNoteSessionIds.size / totalAssessments) * 1000) / 10 : 0,
      memorySupportFlaggedPercentage: totalAssessments > 0 ? Math.round((memoryConcernCount / totalAssessments) * 1000) / 10 : 0,
      totalServiceRequests,
      openServiceRequests,
      scheduledServiceRequests,
      completedServiceRequests,
      highPriorityOpenServiceRequests,
      sessionsWithUrgentRiskAndNoServiceRequest: urgentRiskNoServiceRequest,
      serviceRequestGenerationRate: totalAssessments > 0 ? Math.round((serviceRequestSessionIds.size / totalAssessments) * 1000) / 10 : 0,
      serviceRequestCompletionRate: totalServiceRequests > 0 ? Math.round((completedServiceRequests / totalServiceRequests) * 1000) / 10 : 0,
      verifiedCompletionRate: completedServiceRequests > 0 ? Math.round((verifiedServiceRequests / completedServiceRequests) * 1000) / 10 : 0,
      averageServiceRating: ratedServiceRequests.length > 0
        ? Math.round((ratedServiceRequests.reduce((sum, item) => sum + (item.serviceQualityRating ?? 0), 0) / ratedServiceRequests.length) * 10) / 10
        : 0,
      providerFollowupNeededCount,
      providerCompletedCounts: providerCompletedGroups
        .filter((group) => group.providerName)
        .map((group) => ({ providerName: group.providerName as string, count: group._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };

    return {
      totalAffiliateClicks,
      totalContractorLeads,
      funnelCounts: funnel,
      funnelConversion: {
        reportToAffiliatePercent,
        reportToContractorPercent,
      },
      clicksByProductCategory: clickGroups
        .map((group) => ({
          productName: group.productName,
          category: group.category,
          count: group._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      leadsByZipCode: leadGroups
        .map((group) => ({
          zipCode: group.zipCode,
          count: group._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      recentContractorLeads: recentLeads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone ?? undefined,
        zipCode: lead.zipCode,
        preferredContact: lead.preferredContact,
        notes: lead.notes ?? undefined,
        status: lead.status,
        internalNotes: lead.internalNotes ?? undefined,
        projectUrgency: lead.projectUrgency ?? undefined,
        estimatedBudget: lead.estimatedBudget ?? undefined,
        createdAt: lead.createdAt.toISOString(),
        sessionId: lead.sessionId ?? undefined,
      })),
      betaWaitlist: {
        total: totalWaitlist,
        last7Days: waitlistLast7Days,
        byZipCode: waitlistZipGroups
          .filter((group) => group.zipCode)
          .map((group) => ({
            zipCode: group.zipCode as string,
            count: group._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        recent: recentWaitlist.map((signup) => ({
          id: signup.id,
          email: signup.email,
          name: signup.name ?? undefined,
          role: signup.role ?? undefined,
          zipCode: signup.zipCode ?? undefined,
          source: signup.source ?? undefined,
          createdAt: signup.createdAt.toISOString(),
        })),
      },
      parentSafety: {
        totalAssessments,
        independenceRiskCounts: Array.from(independenceRiskCounts.entries()).map(([riskLevel, count]) => ({ riskLevel, count })),
        fallRiskCounts: Array.from(fallRiskCounts.entries()).map(([riskLevel, count]) => ({ riskLevel, count })),
        mostCommonHazards: hazardGroups
          .map((group) => ({
            hazardType: group.hazardType,
            count: group._count._all,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        completedRecommendationRate: totalRecommendations > 0
          ? Math.round((completedRecommendations / totalRecommendations) * 1000) / 10
          : 0,
        evidenceAttachmentRate: pilotMetrics.evidenceAttachmentRate,
        careNoteCount,
        highRiskSessionsNeedingFollowUp,
        sessionsWithIncompleteImmediateActions: sessionsForCoordination.filter((session) => {
          const plan = latestReportBySession.get(session.id)?.independencePlan ?? [];
          return plan.some((item) => item.priority === "immediate" && item.status !== "completed" && item.status !== "skipped");
        }).length,
        sessionsWithMemorySupportConcerns: memoryConcernCount,
        sessionsWithNoRecentCareNote,
        pilotMetrics,
        careCoordinationRows,
        serviceRequests: {
          total: totalServiceRequests,
          byType: serviceRequestsByType
            .map((group) => ({ serviceType: group.serviceType, count: group._count._all }))
            .sort((a, b) => b.count - a.count),
          open: openServiceRequests,
          scheduled: scheduledServiceRequests,
          completed: completedServiceRequests,
          highPriorityOpen: highPriorityOpenServiceRequests,
          urgentRiskNoServiceRequest,
        },
      },
    };
  }

  async upsertBetaWaitlistSignup(input: {
    email: string;
    name?: string;
    role?: string;
    zipCode?: string;
    source?: string;
  }): Promise<{ id: string; created: boolean }> {
    const existing = await prisma.betaWaitlistSignup.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      const updated = await prisma.betaWaitlistSignup.update({
        where: { email: input.email },
        data: {
          name: input.name,
          role: input.role,
          zipCode: input.zipCode,
          source: input.source,
        },
        select: { id: true },
      });
      return { id: updated.id, created: false };
    }
    const created = await prisma.betaWaitlistSignup.create({
      data: input,
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  async listContractorLeadsForExport(): Promise<Array<{
    name: string;
    email: string;
    phone?: string;
    zipCode: string;
    preferredContact: string;
    notes?: string;
    status: string;
    projectUrgency?: string;
    estimatedBudget?: string;
    internalNotes?: string;
    createdAt: string;
    sessionId?: string;
  }>> {
    const leads = await prisma.contractorLead.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        email: true,
        phone: true,
        zipCode: true,
        preferredContact: true,
        notes: true,
        status: true,
        projectUrgency: true,
        estimatedBudget: true,
        internalNotes: true,
        createdAt: true,
        sessionId: true,
      },
    });
    return leads.map((lead) => ({
      name: lead.name,
      email: lead.email,
      phone: lead.phone ?? undefined,
      zipCode: lead.zipCode,
      preferredContact: lead.preferredContact,
      notes: lead.notes ?? undefined,
      status: lead.status,
      projectUrgency: lead.projectUrgency ?? undefined,
      estimatedBudget: lead.estimatedBudget ?? undefined,
      internalNotes: lead.internalNotes ?? undefined,
      createdAt: lead.createdAt.toISOString(),
      sessionId: lead.sessionId ?? undefined,
    }));
  }

  async updateContractorLeadOpsById(input: {
    id: string;
    status?: "new" | "contacted" | "qualified" | "rejected" | "converted";
    internalNotes?: string;
  }): Promise<boolean> {
    const data: { status?: string; internalNotes?: string | null } = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.internalNotes !== undefined) {
      const trimmed = input.internalNotes.trim();
      data.internalNotes = trimmed.length ? trimmed : null;
    }
    if (Object.keys(data).length === 0) return false;
    const result = await prisma.contractorLead.updateMany({
      where: { id: input.id },
      data,
    });
    return result.count > 0;
  }

  async deleteContractorLeadById(id: string): Promise<boolean> {
    const result = await prisma.contractorLead.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }

  async addCareNote(input: {
    sessionId: string;
    noteType: CareNoteType;
    authorName?: string;
    authorRole: CareNoteAuthorRole;
    body: string;
    observedChanges?: string;
    concerns?: string;
    followUpNeeded: boolean;
  }): Promise<CareNote> {
    const note = await prisma.careNote.create({ data: input });
    return this.mapCareNote(note);
  }

  async listCareNotes(sessionId: string): Promise<CareNote[]> {
    const notes = await prisma.careNote.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return notes.map((note) => this.mapCareNote(note));
  }

  async buildCareNoteSummary(sessionId: string): Promise<CareNoteSummary> {
    const notes = await this.listCareNotes(sessionId);
    const recent = notes.slice(0, 5);
    const changed = recent
      .map((note) => note.observedChanges?.trim())
      .filter((value): value is string => Boolean(value));
    const concerns = recent
      .flatMap((note) => [note.concerns?.trim(), note.followUpNeeded ? note.body.trim() : undefined])
      .filter((value): value is string => Boolean(value))
      .slice(0, 5);
    return {
      whatChanged: changed.length ? changed : ["No specific changes have been logged yet."],
      whatNeedsAttention: concerns.length ? concerns : ["No urgent attention items have been logged in recent care notes."],
      nextRecommendedAction: concerns.length
        ? "Assign a family member or care coordinator to follow up, and discuss medical concerns with a clinician when appropriate."
        : "Continue routine family check-ins and add a note after the next visit.",
      disclaimer: "This summary is for care coordination only and is not medical advice.",
    };
  }

  async addRecommendationEvidence(input: {
    sessionId: string;
    recommendationActionId: string;
    evidenceType: RecommendationEvidenceType;
    imageUrl?: string;
    note?: string;
    uploadedByRole: EvidenceUploaderRole;
  }): Promise<RecommendationEvidence> {
    const evidence = await prisma.recommendationEvidence.create({ data: input });
    return this.mapRecommendationEvidence(evidence);
  }

  async listRecommendationEvidence(sessionId: string, recommendationActionId?: string): Promise<RecommendationEvidence[]> {
    const evidence = await prisma.recommendationEvidence.findMany({
      where: {
        sessionId,
        ...(recommendationActionId ? { recommendationActionId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return evidence.map((item) => this.mapRecommendationEvidence(item));
  }

  async getEvidenceCountsByRecommendation(sessionId: string): Promise<Record<string, number>> {
    const groups = await prisma.recommendationEvidence.groupBy({
      by: ["recommendationActionId"],
      _count: { _all: true },
      where: { sessionId },
    });
    return groups.reduce<Record<string, number>>((acc, group) => {
      acc[group.recommendationActionId] = group._count._all;
      return acc;
    }, {});
  }

  async updateRecommendationActionStatus(input: {
    sessionId: string;
    recommendationId: string;
    actionStatus?: "pending" | "in_progress" | "completed" | "skipped";
    actionOwner?: string;
    actionPriority?: string;
    dueDate?: string | null;
    skippedReason?: string | null;
    estimatedPreventionImpact?: string;
  }): Promise<boolean> {
    const data: Prisma.RecommendationUpdateManyMutationInput = {};
    if (input.actionStatus) {
      data.actionStatus = input.actionStatus;
      data.completedAt = input.actionStatus === "completed" ? new Date() : null;
    }
    if (input.actionOwner !== undefined) data.actionOwner = input.actionOwner;
    if (input.actionPriority !== undefined) data.actionPriority = input.actionPriority;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.skippedReason !== undefined) data.skippedReason = input.skippedReason;
    if (input.estimatedPreventionImpact !== undefined) data.estimatedPreventionImpact = input.estimatedPreventionImpact;
    if (Object.keys(data).length === 0) return false;
    const result = await prisma.recommendation.updateMany({
      where: { id: input.recommendationId, sessionId: input.sessionId },
      data,
    });
    return result.count > 0;
  }

  async listServiceRequests(sessionId: string): Promise<ServiceRequest[]> {
    const requests = await prisma.serviceRequest.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
    return requests.map((request) => this.mapServiceRequest(request));
  }

  async createServiceRequest(input: {
    sessionId: string;
    recommendationActionId?: string;
    serviceType: ServiceType;
    title: string;
    description: string;
    priority: ServiceRequest["priority"];
    requestedByRole: ServiceRequesterRole;
    requestedByName?: string;
    status?: ServiceRequestStatus;
    preferredDate?: string;
    scheduledAt?: string;
    providerName?: string;
    providerContact?: string;
    notes?: string;
    serviceQualityRating?: number;
    familyFeedback?: string;
    providerFollowupNeeded?: boolean;
    completionVerified?: boolean;
    completionVerifiedBy?: string;
  }): Promise<ServiceRequest> {
    const request = await prisma.serviceRequest.create({
      data: {
        sessionId: input.sessionId,
        recommendationActionId: input.recommendationActionId,
        serviceType: input.serviceType,
        title: input.title,
        description: input.description,
        priority: input.priority,
        requestedByRole: input.requestedByRole,
        requestedByName: input.requestedByName,
        status: input.status ?? "draft",
        preferredDate: input.preferredDate ? new Date(input.preferredDate) : undefined,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        providerName: input.providerName,
        providerContact: input.providerContact,
        notes: input.notes,
        serviceQualityRating: input.serviceQualityRating,
        familyFeedback: input.familyFeedback,
        providerFollowupNeeded: input.providerFollowupNeeded ?? false,
        completionVerified: input.completionVerified ?? false,
        completionVerifiedAt: input.completionVerified ? new Date() : undefined,
        completionVerifiedBy: input.completionVerifiedBy,
      },
    });
    return this.mapServiceRequest(request);
  }

  async updateServiceRequest(input: {
    id: string;
    status?: ServiceRequestStatus;
    priority?: ServiceRequest["priority"];
    preferredDate?: string | null;
    scheduledAt?: string | null;
    completedAt?: string | null;
    providerName?: string | null;
    providerContact?: string | null;
    notes?: string | null;
    serviceQualityRating?: number | null;
    familyFeedback?: string | null;
    providerFollowupNeeded?: boolean;
    completionVerified?: boolean;
    completionVerifiedAt?: string | null;
    completionVerifiedBy?: string | null;
  }): Promise<ServiceRequest | undefined> {
    const data: Prisma.ServiceRequestUpdateInput = {};
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "completed" && input.completedAt === undefined) data.completedAt = new Date();
      if (input.status === "cancelled") data.completedAt = null;
    }
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.preferredDate !== undefined) data.preferredDate = input.preferredDate ? new Date(input.preferredDate) : null;
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.completedAt !== undefined) data.completedAt = input.completedAt ? new Date(input.completedAt) : null;
    if (input.providerName !== undefined) data.providerName = input.providerName;
    if (input.providerContact !== undefined) data.providerContact = input.providerContact;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.serviceQualityRating !== undefined) data.serviceQualityRating = input.serviceQualityRating;
    if (input.familyFeedback !== undefined) data.familyFeedback = input.familyFeedback;
    if (input.providerFollowupNeeded !== undefined) data.providerFollowupNeeded = input.providerFollowupNeeded;
    if (input.completionVerified !== undefined) {
      data.completionVerified = input.completionVerified;
      data.completionVerifiedAt = input.completionVerified ? new Date() : null;
    }
    if (input.completionVerifiedAt !== undefined) data.completionVerifiedAt = input.completionVerifiedAt ? new Date(input.completionVerifiedAt) : null;
    if (input.completionVerifiedBy !== undefined) data.completionVerifiedBy = input.completionVerifiedBy;
    if (Object.keys(data).length === 0) {
      const existing = await prisma.serviceRequest.findUnique({ where: { id: input.id } });
      return existing ? this.mapServiceRequest(existing) : undefined;
    }
    const request = await prisma.serviceRequest.update({ where: { id: input.id }, data }).catch(() => null);
    return request ? this.mapServiceRequest(request) : undefined;
  }

  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const request = await prisma.serviceRequest.findUnique({ where: { id } });
    return request ? this.mapServiceRequest(request) : undefined;
  }

  async saveAnalyticsEvent(input: {
    eventName: string;
    sessionId?: string;
    reportId?: string;
    metadata?: unknown;
  }): Promise<{ id: string }> {
    const metadata =
      input.metadata === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);
    const event = await prisma.analyticsEvent.create({
      data: {
        eventName: input.eventName,
        sessionId: input.sessionId,
        reportId: input.reportId,
        metadata,
      },
    });
    return { id: event.id };
  }

  async saveReport(report: ReportPayload, userId?: string): Promise<void> {
    if (!userId) return;
    await prisma.reportSnapshot.upsert({
      where: { sessionId_userId: { sessionId: report.sessionId, userId } },
      update: { reportJson: report as unknown as object },
      create: {
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

  async listReportsForUser(
    userId: string,
    pagination: { limit: number; cursor?: string } = { limit: 20 }
  ): Promise<{ reports: Array<{ sessionId: string; createdAt: string; reportJson: unknown }>; nextCursor: string | null }> {
    const rows = await prisma.reportSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    return {
      reports: page.map((report) => ({
        sessionId: report.sessionId,
        createdAt: report.createdAt.toISOString(),
        reportJson: report.reportJson,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listSessionsForUser(
    userId: string,
    pagination: { limit: number; cursor?: string } = { limit: 20 }
  ): Promise<{
    sessions: Array<{
      id: string;
      startedAt: string;
      createdAt: string;
      status: string;
      city?: string;
      currentRoom?: string;
      overallRiskLevel?: string;
      reportAvailable: boolean;
    }>;
    nextCursor: string | null;
  }> {
    const rows = await prisma.inspectionSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      include: { reportSnapshots: { select: { id: true } } },
    });
    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    return {
      sessions: page.map((session) => ({
        id: session.id,
        startedAt: session.startedAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        status: session.status,
        city: session.city ?? undefined,
        currentRoom: session.currentRoom ?? undefined,
        overallRiskLevel: session.overallRiskLevel ?? undefined,
        reportAvailable: session.reportSnapshots.length > 0,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listUnassignedSessions(limit = 50): Promise<Array<{ id: string; parentLabel: string; createdAt: string; riskLevel?: string }>> {
    const rows = await prisma.inspectionSession.findMany({
      where: { pilotCohortId: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { seniorProfile: true },
    });
    return rows.map((session, index) => ({
      id: session.id,
      parentLabel: session.seniorProfile?.seniorName ?? `Household ${index + 1}`,
      createdAt: session.createdAt.toISOString(),
      riskLevel: session.overallRiskLevel ?? undefined,
    }));
  }

  async createPartnerOrganization(input: {
    name: string;
    organizationType: PartnerOrganizationType;
    displayName?: string;
    logoUrl?: string;
    primaryContact?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
  }): Promise<PartnerOrganization> {
    const partner = await prisma.partnerOrganization.create({ data: input });
    return this.mapPartnerOrganization(partner);
  }

  async createPilotCohort(input: {
    partnerOrganizationId: string;
    name: string;
    description?: string;
    status?: PilotCohortStatus;
    startDate?: string;
    endDate?: string;
    targetHouseholds?: number;
    consentVersion?: string;
    notes?: string;
  }): Promise<PilotCohort> {
    const cohort = await prisma.pilotCohort.create({
      data: {
        partnerOrganizationId: input.partnerOrganizationId,
        name: input.name,
        description: input.description,
        status: input.status ?? "draft",
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        targetHouseholds: input.targetHouseholds,
        consentVersion: input.consentVersion,
        notes: input.notes,
      },
      include: { partnerOrganization: true },
    });
    return this.mapPilotCohort(cohort);
  }

  async createPartnerReferral(input: {
    partnerOrganizationId: string;
    pilotCohortId?: string;
    inviteType: PartnerReferralInviteType;
    recipientName?: string;
    recipientEmail?: string;
    recipientPhone?: string;
    seniorName?: string;
    sourceLabel?: string;
    notes?: string;
  }): Promise<PartnerReferral> {
    const referral = await prisma.partnerReferral.create({
      data: {
        ...input,
        referralCode: crypto.randomBytes(5).toString("hex"),
        status: "created",
      },
    });
    return this.mapPartnerReferral(referral);
  }

  async getPartnerReferralByCode(referralCode: string): Promise<(PartnerReferral & { partnerDisplayName: string; cohortName?: string }) | undefined> {
    const referral = await prisma.partnerReferral.findUnique({
      where: { referralCode },
      include: { partnerOrganization: true, pilotCohort: true },
    });
    if (!referral) return undefined;
    return {
      ...this.mapPartnerReferral(referral),
      partnerDisplayName: referral.partnerOrganization.displayName || referral.partnerOrganization.name,
      cohortName: referral.pilotCohort?.name ?? undefined,
    };
  }

  async updatePartnerReferralStatus(idOrCode: string, status: PartnerReferralStatus): Promise<PartnerReferral | undefined> {
    const now = new Date();
    const data: Prisma.PartnerReferralUpdateInput = { status };
    if (status === "opened") data.openedAt = now;
    if (status === "started_onboarding") data.startedAt = now;
    if (status === "consent_completed") data.consentCompletedAt = now;
    if (status === "assessment_completed") data.assessmentCompletedAt = now;
    if (status === "report_generated") data.reportGeneratedAt = now;
    // Referral codes are 10-char hex strings; UUIDs are 36 chars.
    // Use UUID pattern match as a robust discriminator rather than a magic length check.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
    const where = isUuid ? { id: idOrCode } : { referralCode: idOrCode };
    const referral = await prisma.partnerReferral.update({ where, data }).catch(() => null);
    return referral ? this.mapPartnerReferral(referral) : undefined;
  }

  async listPartnerReferrals(): Promise<{
    referrals: Array<PartnerReferral & { partnerName: string; cohortName?: string; referralUrl: string }>;
    metrics: {
      created: number;
      opened: number;
      startedOnboarding: number;
      consentCompleted: number;
      assessmentCompleted: number;
      reportGenerated: number;
      inactiveOrCancelled: number;
      openedToReportGeneratedRate: number;
    };
  }> {
    const referrals = await prisma.partnerReferral.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { partnerOrganization: true, pilotCohort: true },
    });
    const atLeast = (statuses: PartnerReferralStatus[]) => referrals.filter((ref) => statuses.includes(ref.status as PartnerReferralStatus)).length;
    const opened = referrals.filter((ref) => ref.openedAt || ["opened", "started_onboarding", "consent_completed", "assessment_completed", "report_generated"].includes(ref.status)).length;
    const generated = referrals.filter((ref) => ref.reportGeneratedAt || ref.status === "report_generated").length;
    return {
      referrals: referrals.map((ref) => ({
        ...this.mapPartnerReferral(ref),
        partnerName: ref.partnerOrganization.displayName || ref.partnerOrganization.name,
        cohortName: ref.pilotCohort?.name ?? undefined,
        referralUrl: `/start/${ref.referralCode}`,
      })),
      metrics: {
        created: referrals.length,
        opened,
        startedOnboarding: atLeast(["started_onboarding", "consent_completed", "assessment_completed", "report_generated"]),
        consentCompleted: atLeast(["consent_completed", "assessment_completed", "report_generated"]),
        assessmentCompleted: atLeast(["assessment_completed", "report_generated"]),
        reportGenerated: generated,
        inactiveOrCancelled: referrals.filter((ref) => ref.status === "inactive" || ref.status === "cancelled").length,
        openedToReportGeneratedRate: opened > 0 ? Math.round((generated / opened) * 1000) / 10 : 0,
      },
    };
  }

  async assignSessionToPilotCohort(sessionId: string, pilotCohortId: string | null): Promise<InspectionSession | undefined> {
    const session = await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { pilotCohortId },
    }).catch(() => null);
    return session ? this.mapSession(session) : undefined;
  }

  async scheduleFollowUpCheckIn(input: {
    sessionId: string;
    pilotCohortId?: string;
    checkInType: FollowUpCheckInType;
    scheduledFor: string;
    notes?: string;
  }): Promise<FollowUpCheckIn> {
    const row = await prisma.followUpCheckIn.create({
      data: {
        sessionId: input.sessionId,
        pilotCohortId: input.pilotCohortId,
        checkInType: input.checkInType,
        status: "scheduled",
        scheduledFor: new Date(input.scheduledFor),
        notes: input.notes,
      },
    });
    return this.mapFollowUpCheckIn(row);
  }

  async listFollowUpCheckInsForSession(sessionId: string): Promise<FollowUpCheckIn[]> {
    const rows = await prisma.followUpCheckIn.findMany({
      where: { sessionId },
      orderBy: { scheduledFor: "desc" },
    });
    return rows.map((row) => this.mapFollowUpCheckIn(row));
  }

  async getFollowUpCheckIn(id: string): Promise<FollowUpCheckIn | undefined> {
    const row = await prisma.followUpCheckIn.findUnique({ where: { id } });
    return row ? this.mapFollowUpCheckIn(row) : undefined;
  }

  async getFollowUpAttentionQueue(): Promise<Array<{
    followUpId: string;
    sessionId: string;
    cohortName?: string;
    riskLevel: string;
    checkInType: string;
    issueReported: string;
    lastSubmittedDate?: string;
    requestedFollowup: boolean;
    reportUrl: string;
  }>> {
    const now = new Date();
    const rows = await prisma.followUpCheckIn.findMany({
      where: {
        OR: [
          { newFallsReported: true },
          { newHospitalVisitReported: true },
          { requestCareCoordinatorFollowup: true },
          { status: "missed" },
          { status: "scheduled", scheduledFor: { lt: now } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        session: {
          include: {
            pilotCohort: true,
            reportSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });
    const highRiskNoFollowUp = await prisma.inspectionSession.findMany({
      where: {
        overallRiskLevel: { in: ["high", "critical", "urgent"] },
        followUpCheckIns: { none: { status: "completed" } },
      },
      take: 25,
      include: {
        pilotCohort: true,
        reportSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const queue = rows.map((row) => ({
      followUpId: row.id,
      sessionId: row.sessionId,
      cohortName: row.session.pilotCohort?.name ?? undefined,
      riskLevel: (row.session.reportSnapshots[0]?.reportJson as unknown as ReportPayload | undefined)?.independenceRiskScore?.overallIndependenceRisk ?? row.session.overallRiskLevel ?? "unknown",
      checkInType: row.checkInType,
      issueReported: [
        row.newFallsReported ? "new fall" : undefined,
        row.newHospitalVisitReported ? "hospital visit" : undefined,
        row.requestCareCoordinatorFollowup ? "care coordinator follow-up requested" : undefined,
        row.status === "missed" || (row.status === "scheduled" && row.scheduledFor < now) ? "missed follow-up" : undefined,
      ].filter(Boolean).join(", ") || "needs attention",
      lastSubmittedDate: row.completedAt?.toISOString() ?? row.updatedAt.toISOString(),
      requestedFollowup: row.requestCareCoordinatorFollowup,
      reportUrl: `/report?sessionId=${row.sessionId}`,
    }));
    for (const session of highRiskNoFollowUp) {
      if (queue.some((item) => item.sessionId === session.id)) continue;
      queue.push({
        followUpId: "",
        sessionId: session.id,
        cohortName: session.pilotCohort?.name ?? undefined,
        riskLevel: (session.reportSnapshots[0]?.reportJson as unknown as ReportPayload | undefined)?.independenceRiskScore?.overallIndependenceRisk ?? session.overallRiskLevel ?? "unknown",
        checkInType: "not_scheduled",
        issueReported: "high or urgent risk with no completed follow-up",
        lastSubmittedDate: "",
        requestedFollowup: false,
        reportUrl: `/report?sessionId=${session.id}`,
      });
    }
    return queue;
  }

  async updateFollowUpCheckIn(input: {
    id: string;
    status?: FollowUpCheckInStatus;
    completedAt?: string | null;
    notes?: string | null;
    newFallsReported?: boolean | null;
    nearFallsReported?: boolean | null;
    newHospitalVisitReported?: boolean | null;
    newCaregiverSupportAdded?: boolean | null;
    majorHomeFixCompleted?: boolean | null;
    medicationRoutineImproved?: boolean | null;
    parentFeelsSafer?: string | null;
    familyFeelsMorePrepared?: string | null;
    currentBiggestConcern?: string | null;
    requestCareCoordinatorFollowup?: boolean;
  }): Promise<FollowUpCheckIn | undefined> {
    const data: Prisma.FollowUpCheckInUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.completedAt !== undefined) data.completedAt = input.completedAt ? new Date(input.completedAt) : null;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.newFallsReported !== undefined) data.newFallsReported = input.newFallsReported;
    if (input.nearFallsReported !== undefined) data.nearFallsReported = input.nearFallsReported;
    if (input.newHospitalVisitReported !== undefined) data.newHospitalVisitReported = input.newHospitalVisitReported;
    if (input.newCaregiverSupportAdded !== undefined) data.newCaregiverSupportAdded = input.newCaregiverSupportAdded;
    if (input.majorHomeFixCompleted !== undefined) data.majorHomeFixCompleted = input.majorHomeFixCompleted;
    if (input.medicationRoutineImproved !== undefined) data.medicationRoutineImproved = input.medicationRoutineImproved;
    if (input.parentFeelsSafer !== undefined) data.parentFeelsSafer = input.parentFeelsSafer;
    if (input.familyFeelsMorePrepared !== undefined) data.familyFeelsMorePrepared = input.familyFeelsMorePrepared;
    if (input.currentBiggestConcern !== undefined) data.currentBiggestConcern = input.currentBiggestConcern;
    if (input.requestCareCoordinatorFollowup !== undefined) data.requestCareCoordinatorFollowup = input.requestCareCoordinatorFollowup;
    if (input.status === "completed" && input.completedAt === undefined) data.completedAt = new Date();
    const row = await prisma.followUpCheckIn.update({ where: { id: input.id }, data }).catch(() => null);
    return row ? this.mapFollowUpCheckIn(row) : undefined;
  }

  async getPilotCohortDashboard(): Promise<PilotCohortDashboard & { unassignedSessions: Awaited<ReturnType<PostgresDatabase["listUnassignedSessions"]>> }> {
    const [partners, cohorts, unassignedSessions] = await Promise.all([
      prisma.partnerOrganization.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.pilotCohort.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          partnerOrganization: true,
          followUpCheckIns: true,
          partnerReferrals: true,
          sessions: {
            orderBy: { createdAt: "desc" },
            include: {
              seniorProfile: true,
              careNotes: { orderBy: { createdAt: "desc" }, take: 1 },
              contractorLeads: { orderBy: { createdAt: "desc" }, take: 1 },
              recommendations: true,
              serviceRequests: true,
              assessmentReview: true,
              reportSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
              followUpCheckIns: { orderBy: { scheduledFor: "desc" } },
            },
          },
        },
      }),
      this.listUnassignedSessions(),
    ]);

    const now = Date.now();
    const cohortCards = cohorts.map((cohort) => {
      const reports = cohort.sessions.map((session) => session.reportSnapshots[0]?.reportJson as unknown as ReportPayload | undefined).filter(Boolean) as ReportPayload[];
      const totalHouseholds = cohort.sessions.length;
      const assessmentsCompleted = reports.length;
      const highUrgent = reports.filter((report) => ["high", "urgent", "critical"].includes(report.independenceRiskScore?.overallIndependenceRisk ?? report.overallRiskSummary?.level ?? "")).length;
      const planItems = reports.flatMap((report) => report.independencePlan ?? []);
      const immediateItems = planItems.filter((item) => item.priority === "immediate");
      const completedItems = planItems.filter((item) => item.status === "completed" || item.status === "skipped");
      const completedImmediateItems = immediateItems.filter((item) => item.status === "completed" || item.status === "skipped");
      const serviceRequests = cohort.sessions.flatMap((session) => session.serviceRequests);
      const completedServices = serviceRequests.filter((request) => request.status === "completed");
      const ratedServices = serviceRequests.filter((request) => request.serviceQualityRating !== null);
      const careNoteSessions = new Set(cohort.sessions.filter((session) => session.careNotes.length > 0).map((session) => session.id));
      const memoryFlagged = cohort.sessions.filter((session) => ["mild", "moderate", "severe"].includes(session.seniorProfile?.memoryConcerns ?? "")).length;
      const reviewed = cohort.sessions.filter((session) => session.assessmentReview?.reviewStatus === "reviewed").length;
      const evidenceRecommendationIds = new Set<string>();
      for (const report of reports) {
        for (const item of report.independencePlan ?? []) {
          if ((item.evidenceCount ?? 0) > 0) evidenceRecommendationIds.add(item.id);
        }
      }
      const followUps = cohort.followUpCheckIns;
      const referrals = cohort.partnerReferrals;
      const openedRefs = referrals.filter((ref) => ref.openedAt || ["opened", "started_onboarding", "consent_completed", "assessment_completed", "report_generated"].includes(ref.status));
      const generatedRefs = referrals.filter((ref) => ref.reportGeneratedAt || ref.status === "report_generated");
      const metrics: CohortMetrics = {
        totalAssessments: assessmentsCompleted,
        totalHouseholds,
        assessmentsCompleted,
        highUrgentRiskPercentage: assessmentsCompleted > 0 ? Math.round((highUrgent / assessmentsCompleted) * 1000) / 10 : 0,
        mostCommonHazardCategories: [],
        averageRecommendationsPerAssessment: assessmentsCompleted > 0 ? Math.round((planItems.length / assessmentsCompleted) * 10) / 10 : 0,
        actionCompletionRate: planItems.length > 0 ? Math.round((completedItems.length / planItems.length) * 1000) / 10 : 0,
        immediateActionCompletionRate: immediateItems.length > 0 ? Math.round((completedImmediateItems.length / immediateItems.length) * 1000) / 10 : 0,
        evidenceAttachmentRate: planItems.length > 0 ? Math.round((evidenceRecommendationIds.size / planItems.length) * 1000) / 10 : 0,
        contractorLeadConversionRate: assessmentsCompleted > 0 ? Math.round((cohort.sessions.filter((session) => session.contractorLeads.length > 0).length / assessmentsCompleted) * 1000) / 10 : 0,
        careNoteUsageRate: totalHouseholds > 0 ? Math.round((careNoteSessions.size / totalHouseholds) * 1000) / 10 : 0,
        memorySupportFlaggedPercentage: totalHouseholds > 0 ? Math.round((memoryFlagged / totalHouseholds) * 1000) / 10 : 0,
        totalServiceRequests: serviceRequests.length,
        serviceRequestGenerationRate: totalHouseholds > 0 ? Math.round((new Set(serviceRequests.map((request) => request.sessionId)).size / totalHouseholds) * 1000) / 10 : 0,
        serviceRequestCompletionRate: serviceRequests.length > 0 ? Math.round((completedServices.length / serviceRequests.length) * 1000) / 10 : 0,
        verifiedCompletionRate: completedServices.length > 0 ? Math.round((completedServices.filter((request) => request.completionVerified).length / completedServices.length) * 1000) / 10 : 0,
        averageServiceRating: ratedServices.length > 0 ? Math.round((ratedServices.reduce((sum, request) => sum + (request.serviceQualityRating ?? 0), 0) / ratedServices.length) * 10) / 10 : 0,
        assessmentReviewCompletionRate: totalHouseholds > 0 ? Math.round((reviewed / totalHouseholds) * 1000) / 10 : 0,
        followUps: {
          scheduled: followUps.filter((item) => item.status === "scheduled").length,
          completed: followUps.filter((item) => item.status === "completed").length,
          missed: followUps.filter((item) => item.status === "missed" || (item.status === "scheduled" && item.scheduledFor.getTime() < now)).length,
          cancelled: followUps.filter((item) => item.status === "cancelled").length,
          selfReportedNewFalls: followUps.filter((item) => item.newFallsReported).length,
          selfReportedNearFalls: followUps.filter((item) => item.nearFallsReported).length,
          selfReportedHospitalVisits: followUps.filter((item) => item.newHospitalVisitReported).length,
          caregiverSupportAdded: followUps.filter((item) => item.newCaregiverSupportAdded).length,
          majorHomeFixCompleted: followUps.filter((item) => item.majorHomeFixCompleted).length,
          medicationRoutineImproved: followUps.filter((item) => item.medicationRoutineImproved).length,
          familiesFeelingSafer: followUps.filter((item) => item.parentFeelsSafer === "yes" || item.parentFeelsSafer === "somewhat").length,
          familiesFeelingMorePrepared: followUps.filter((item) => item.familyFeelsMorePrepared === "yes" || item.familyFeelsMorePrepared === "somewhat").length,
          careCoordinatorFollowupRequested: followUps.filter((item) => item.requestCareCoordinatorFollowup).length,
        },
        intake: {
          created: referrals.length,
          opened: openedRefs.length,
          startedOnboarding: referrals.filter((ref) => ["started_onboarding", "consent_completed", "assessment_completed", "report_generated"].includes(ref.status)).length,
          consentCompleted: referrals.filter((ref) => ["consent_completed", "assessment_completed", "report_generated"].includes(ref.status)).length,
          assessmentCompleted: referrals.filter((ref) => ["assessment_completed", "report_generated"].includes(ref.status)).length,
          reportGenerated: generatedRefs.length,
          inactiveOrCancelled: referrals.filter((ref) => ref.status === "inactive" || ref.status === "cancelled").length,
          openedToReportGeneratedRate: openedRefs.length > 0 ? Math.round((generatedRefs.length / openedRefs.length) * 1000) / 10 : 0,
        },
      };
      const partner = this.mapPartnerOrganization(cohort.partnerOrganization);
      const sharingAllowedForPartner = (session: typeof cohort.sessions[number]) => {
        if (partner.organizationType === "insurer") return session.shareWithInsurer;
        if (partner.organizationType === "contractor_partner") return session.shareWithContractor;
        return session.shareWithCareCoordinator;
      };
      return {
        cohort: this.mapPilotCohort(cohort),
        partner,
        metrics,
        households: cohort.sessions.map((session, index) => {
          const report = session.reportSnapshots[0]?.reportJson as unknown as ReportPayload | undefined;
          const plan = report?.independencePlan ?? [];
          const openServices = session.serviceRequests.filter((request) => !["completed", "cancelled"].includes(request.status));
          const upcoming = session.followUpCheckIns
            .filter((item) => item.status === "scheduled")
            .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
          return {
            sessionId: session.id,
            parentLabel: session.seniorProfile?.seniorName || `Household ${index + 1}`,
            riskLevel: report?.independenceRiskScore?.overallIndependenceRisk ?? session.overallRiskLevel ?? "unknown",
            fallRiskLevel: report?.independenceRiskScore?.fallRisk,
            topRiskDriver: report?.independenceRiskScore?.explanationBullets?.[0] ?? "No risk driver recorded yet.",
            pendingImmediateActions: plan.filter((item) => item.priority === "immediate" && item.status !== "completed" && item.status !== "skipped").length,
            lastCareNoteDate: session.careNotes[0]?.createdAt.toISOString(),
            contractorLeadStatus: session.contractorLeads[0]?.status ?? undefined,
            reportUrl: `/report?sessionId=${session.id}`,
            openServiceRequestsCount: openServices.length,
            serviceStatusSummary: `${openServices.length} open / ${session.serviceRequests.filter((request) => request.status === "completed").length} completed`,
            reviewStatus: session.assessmentReview?.reviewStatus ?? "not_reviewed",
            reviewConfidenceLevel: session.assessmentReview?.confidenceLevel as ReviewConfidenceLevel | undefined,
            consentAccepted: session.consentAccepted,
            shareWithCareCoordinator: session.shareWithCareCoordinator,
            shareWithContractor: session.shareWithContractor,
            shareWithInsurer: session.shareWithInsurer,
            sharingAuthorized: sharingAllowedForPartner(session),
            preventionSummaryUrl: `/api/sessions/${session.id}/prevention-summary.html`,
            upcomingFollowUpDate: upcoming?.scheduledFor.toISOString(),
            upcomingFollowUpId: upcoming?.id,
            missedFollowUpCount: session.followUpCheckIns.filter((item) => item.status === "missed" || (item.status === "scheduled" && item.scheduledFor.getTime() < now)).length,
          };
        }),
      };
    });
    return {
      partnerOrganizations: partners.map((partner) => this.mapPartnerOrganization(partner)),
      cohorts: cohortCards,
      unassignedSessions,
    };
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
