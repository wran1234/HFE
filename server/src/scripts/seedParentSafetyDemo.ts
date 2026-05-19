import { Prisma } from "@prisma/client";
import { buildRecommendation } from "../assessment/recommendationEngine";
import { prisma } from "../db/prisma";
import { FinalHazard, Recommendation, SeniorProfile } from "../domain/types";
import { buildReportPayload } from "../reporting/reportBuilder";

const DEMO_USER_EMAIL = "parent-safety-demo@hfe.local";
const DEMO_PARTNER_NAME = "Demo Care Partner";
const DEMO_COHORT_NAME = "Aging-at-Home Prevention Pilot";
const CONSENT_VERSION = "demo-parent-safety-consent-v1";

type DemoHazard = Pick<FinalHazard, "roomType" | "hazardType" | "severity" | "reason" | "priority">;

interface DemoHousehold {
  label: string;
  city: string;
  residentAge: number;
  mobilityAid: string;
  fallHistory: number;
  nightBathroomTrips: boolean;
  referralStatus: string;
  seniorProfile: Omit<SeniorProfile, "sessionId">;
  hazards: DemoHazard[];
  actionStatuses: Array<{
    status: "pending" | "in_progress" | "completed" | "skipped";
    owner?: string;
    priority?: string;
    evidenceCount?: number;
    skippedReason?: string;
  }>;
}

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const assertSafeToRun = (): void => {
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "production") {
    throw new Error("Refusing to run parent safety demo seed in production.");
  }
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_DEMO_SEED=true to run this demo seed script.");
  }
};

const statusTimestamps = (status: string, offset: number) => {
  const openedAt = ["opened", "started_onboarding", "consent_completed", "assessment_completed", "report_generated"].includes(status) ? daysAgo(offset) : undefined;
  const startedAt = ["started_onboarding", "consent_completed", "assessment_completed", "report_generated"].includes(status) ? daysAgo(offset - 0.2) : undefined;
  const consentCompletedAt = ["consent_completed", "assessment_completed", "report_generated"].includes(status) ? daysAgo(offset - 0.3) : undefined;
  const assessmentCompletedAt = ["assessment_completed", "report_generated"].includes(status) ? daysAgo(offset - 0.4) : undefined;
  const reportGeneratedAt = status === "report_generated" ? daysAgo(offset - 0.5) : undefined;
  return { openedAt, startedAt, consentCompletedAt, assessmentCompletedAt, reportGeneratedAt };
};

const households: DemoHousehold[] = [
  {
    label: "Demo Household - urgent fall risk",
    city: "Columbus",
    residentAge: 88,
    mobilityAid: "walker",
    fallHistory: 2,
    nightBathroomTrips: true,
    referralStatus: "report_generated",
    seniorProfile: {
      seniorName: "Margaret Demo",
      relationshipToUser: "mother",
      ageRange: "85_plus",
      livingArrangement: "alone",
      mobilityLevel: "cane_walker",
      priorFalls: "multiple",
      chronicConditions: ["arthritis", "blood pressure management"],
      medicationComplexity: "high",
      memoryConcerns: "mild",
      visionConcerns: true,
      hearingConcerns: false,
      emergencyContactName: "Alex Demo",
      emergencyContactPhone: "555-0101",
      primaryCaregiver: "Alex Demo",
    },
    hazards: [
      { roomType: "bathroom", hazardType: "missing_grab_bar", severity: "critical", priority: "critical", reason: "No stable support near shower transfer area." },
      { roomType: "stairs", hazardType: "unsafe_stairs", severity: "high", priority: "high", reason: "Stairs have inconsistent lighting and only one rail." },
      { roomType: "bedroom", hazardType: "poor_lighting", severity: "high", priority: "high", reason: "Bedroom-to-bathroom route is dim at night." },
      { roomType: "living_room", hazardType: "clutter_trip_hazard", severity: "medium", priority: "medium", reason: "Walker route has floor-level clutter." },
    ],
    actionStatuses: [
      { status: "in_progress", owner: "contractor", priority: "immediate", evidenceCount: 1 },
      { status: "pending", owner: "contractor", priority: "this_week" },
      { status: "completed", owner: "family", priority: "this_week", evidenceCount: 2 },
      { status: "completed", owner: "family", priority: "this_month", evidenceCount: 1 },
    ],
  },
  {
    label: "Demo Household - bathroom prevention plan",
    city: "Minneapolis",
    residentAge: 79,
    mobilityAid: "cane",
    fallHistory: 1,
    nightBathroomTrips: true,
    referralStatus: "report_generated",
    seniorProfile: {
      seniorName: "Robert Demo",
      relationshipToUser: "father",
      ageRange: "75_84",
      livingArrangement: "with_spouse",
      mobilityLevel: "cane_walker",
      priorFalls: "one",
      chronicConditions: ["joint pain"],
      medicationComplexity: "medium",
      memoryConcerns: "none",
      visionConcerns: false,
      hearingConcerns: true,
      emergencyContactName: "Nina Demo",
      emergencyContactPhone: "555-0102",
      primaryCaregiver: "Spouse",
    },
    hazards: [
      { roomType: "bathroom", hazardType: "slippery_floor", severity: "high", priority: "high", reason: "Smooth tile and no anti-slip mat near shower." },
      { roomType: "bathroom", hazardType: "missing_grab_bar", severity: "high", priority: "high", reason: "No anchored support beside toilet." },
      { roomType: "entryway", hazardType: "high_threshold", severity: "medium", priority: "medium", reason: "Entry threshold catches cane tip." },
    ],
    actionStatuses: [
      { status: "completed", owner: "family", priority: "this_week", evidenceCount: 1 },
      { status: "in_progress", owner: "contractor", priority: "this_week" },
      { status: "pending", owner: "contractor", priority: "this_month" },
    ],
  },
  {
    label: "Demo Household - memory support",
    city: "Phoenix",
    residentAge: 82,
    mobilityAid: "none",
    fallHistory: 0,
    nightBathroomTrips: false,
    referralStatus: "report_generated",
    seniorProfile: {
      seniorName: "Elaine Demo",
      relationshipToUser: "aunt",
      ageRange: "75_84",
      livingArrangement: "alone",
      mobilityLevel: "independent",
      priorFalls: "none",
      chronicConditions: ["diabetes"],
      medicationComplexity: "high",
      memoryConcerns: "moderate",
      visionConcerns: false,
      hearingConcerns: false,
      emergencyContactName: "Maya Demo",
      emergencyContactPhone: "555-0103",
      primaryCaregiver: "Maya Demo",
    },
    hazards: [
      { roomType: "kitchen", hazardType: "clutter_trip_hazard", severity: "medium", priority: "medium", reason: "Frequently used items are spread across counters and walking paths." },
      { roomType: "bedroom", hazardType: "poor_lighting", severity: "medium", priority: "medium", reason: "Night route to medication area is dim." },
    ],
    actionStatuses: [
      { status: "in_progress", owner: "family", priority: "this_month", evidenceCount: 1 },
      { status: "pending", owner: "family", priority: "this_month" },
    ],
  },
  {
    label: "Demo Household - low risk emergency planning",
    city: "Raleigh",
    residentAge: 71,
    mobilityAid: "none",
    fallHistory: 0,
    nightBathroomTrips: false,
    referralStatus: "report_generated",
    seniorProfile: {
      seniorName: "Samuel Demo",
      relationshipToUser: "father-in-law",
      ageRange: "65_74",
      livingArrangement: "with_spouse",
      mobilityLevel: "independent",
      priorFalls: "none",
      chronicConditions: [],
      medicationComplexity: "low",
      memoryConcerns: "none",
      visionConcerns: false,
      hearingConcerns: false,
      emergencyContactName: "Jordan Demo",
      emergencyContactPhone: "555-0104",
      primaryCaregiver: "Family",
    },
    hazards: [
      { roomType: "exterior_entry", hazardType: "poor_lighting", severity: "low", priority: "low", reason: "Porch light does not reliably cover the key path." },
    ],
    actionStatuses: [
      { status: "completed", owner: "family", priority: "monitor", evidenceCount: 1 },
    ],
  },
  {
    label: "Demo Household - completed improvements",
    city: "Portland",
    residentAge: 84,
    mobilityAid: "walker",
    fallHistory: 1,
    nightBathroomTrips: true,
    referralStatus: "report_generated",
    seniorProfile: {
      seniorName: "Lucille Demo",
      relationshipToUser: "mother",
      ageRange: "75_84",
      livingArrangement: "with_family",
      mobilityLevel: "cane_walker",
      priorFalls: "one",
      chronicConditions: ["osteoporosis"],
      medicationComplexity: "medium",
      memoryConcerns: "mild",
      visionConcerns: true,
      hearingConcerns: true,
      emergencyContactName: "Chris Demo",
      emergencyContactPhone: "555-0105",
      primaryCaregiver: "Chris Demo",
    },
    hazards: [
      { roomType: "living_room", hazardType: "loose_rug", severity: "medium", priority: "medium", reason: "Loose rug edge is near main walking path." },
      { roomType: "bathroom", hazardType: "missing_grab_bar", severity: "high", priority: "high", reason: "Bathroom transfer area lacks anchored hand support." },
      { roomType: "bedroom", hazardType: "poor_lighting", severity: "medium", priority: "medium", reason: "Dim route for nighttime bathroom trips." },
    ],
    actionStatuses: [
      { status: "completed", owner: "family", priority: "this_month", evidenceCount: 2 },
      { status: "completed", owner: "contractor", priority: "this_week", evidenceCount: 2 },
      { status: "completed", owner: "family", priority: "this_week", evidenceCount: 1 },
    ],
  },
];

const createReferralCode = (index: number): string => `DEMO${String(index + 1).padStart(6, "0")}`;

async function resetDemoScope(): Promise<void> {
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
  const demoPartner = await prisma.partnerOrganization.findFirst({ where: { name: DEMO_PARTNER_NAME } });
  if (demoUser) await prisma.user.delete({ where: { id: demoUser.id } });
  if (demoPartner) await prisma.partnerOrganization.delete({ where: { id: demoPartner.id } });
  await prisma.analyticsEvent.deleteMany({ where: { metadata: { path: ["source"], equals: "parent-safety-demo-seed" } } });
  await prisma.affiliateClick.deleteMany({ where: { affiliateUrl: { contains: "demo-parent-safety" } } });
  await prisma.contractorLead.deleteMany({ where: { email: { endsWith: "@demo-care.local" } } });
}

async function createReportForHousehold(input: {
  userId: string;
  cohortId: string;
  referralId: string;
  household: DemoHousehold;
  index: number;
}): Promise<{ sessionId: string; reportUrl: string; firstRecommendationId?: string }> {
  const home = await prisma.home.create({
    data: {
      userId: input.userId,
      city: input.household.city,
      homeType: "single_family",
      floorCount: input.index === 0 ? 2 : 1,
      hasElevator: false,
    },
  });
  const session = await prisma.inspectionSession.create({
    data: {
      userId: input.userId,
      homeId: home.id,
      status: "completed",
      residentAge: input.household.residentAge,
      mobilityAid: input.household.mobilityAid,
      fallHistory: input.household.fallHistory,
      nightBathroomTrips: input.household.nightBathroomTrips,
      city: input.household.city,
      overallRiskLevel: input.index === 0 ? "critical" : input.index === 3 ? "low" : "high",
      consentAccepted: true,
      consentAcceptedAt: daysAgo(12 - input.index),
      consentVersion: CONSENT_VERSION,
      recordingPermissionConfirmed: true,
      shareWithCareCoordinator: true,
      shareWithContractor: input.index !== 2,
      shareWithInsurer: true,
      pilotCohortId: input.cohortId,
      referralId: input.referralId,
      endedAt: daysAgo(11 - input.index),
      startedAt: daysAgo(12 - input.index),
    },
  });

  await prisma.seniorProfile.create({
    data: {
      ...input.household.seniorProfile,
      chronicConditions: input.household.seniorProfile.chronicConditions as Prisma.InputJsonValue,
      sessionId: session.id,
    },
  });

  const rooms = Array.from(new Set(input.household.hazards.map((hazard) => hazard.roomType)));
  await prisma.roomScan.createMany({
    data: rooms.map((roomType) => ({
      sessionId: session.id,
      roomType,
      coverageStatus: "covered",
      requiredViews: ["wide_view", "walking_path"] as Prisma.InputJsonValue,
      capturedViews: ["wide_view", "walking_path"] as Prisma.InputJsonValue,
      missingViews: [] as Prisma.InputJsonValue,
      notes: `Demo covered ${roomType.replace("_", " ")}.`,
    })),
  });

  const finalHazards: FinalHazard[] = input.household.hazards.map((hazard, idx) => ({
    ...hazard,
    id: `demo_fh_${input.index}_${idx}`,
    sessionId: session.id,
  })) as FinalHazard[];

  await prisma.finalHazard.createMany({
    data: finalHazards.map((hazard) => ({
      id: hazard.id,
      sessionId: session.id,
      roomType: hazard.roomType,
      hazardType: hazard.hazardType,
      severity: hazard.severity,
      reason: hazard.reason,
      priority: hazard.priority,
    })),
  });

  await prisma.hazardObservation.createMany({
    data: finalHazards.map((hazard, idx) => ({
      sessionId: session.id,
      roomType: hazard.roomType,
      hazardType: hazard.hazardType,
      severityHint: hazard.severity,
      modelNote: hazard.reason,
      followUpNeeded: hazard.priority === "critical" || hazard.priority === "high",
      status: "validated",
      createdAt: daysAgo(11 - input.index + idx / 10),
    })),
  });

  const recommendations: Recommendation[] = finalHazards.map((hazard, idx) => {
    const base = buildRecommendation(session.id, hazard);
    const action = input.household.actionStatuses[idx] ?? { status: "pending" };
    const completedAt = action.status === "completed" ? daysAgo(5 - Math.min(input.index, 4)).toISOString() : undefined;
    return {
      ...base,
      id: `demo_rec_${input.index}_${idx}`,
      actionStatus: action.status,
      actionOwner: action.owner as Recommendation["actionOwner"] | undefined,
      actionPriority: action.priority as Recommendation["actionPriority"] | undefined,
      completedAt,
      skippedReason: action.skippedReason,
      evidenceCount: action.evidenceCount ?? 0,
    };
  });

  await prisma.recommendation.createMany({
    data: recommendations.map((rec) => ({
      id: rec.id,
      sessionId: session.id,
      finalHazardId: rec.finalHazardId,
      fixType: rec.fixType,
      title: rec.title,
      description: rec.description,
      priority: rec.priority,
      estimatedCostMin: rec.estimatedCostMin,
      estimatedCostMax: rec.estimatedCostMax,
      materialsJson: rec.materialsJson as Prisma.InputJsonValue,
      installationComplexity: rec.installationComplexity,
      actionStatus: rec.actionStatus ?? "pending",
      actionOwner: rec.actionOwner,
      actionPriority: rec.actionPriority,
      completedAt: rec.completedAt ? new Date(rec.completedAt) : undefined,
      skippedReason: rec.skippedReason,
      estimatedPreventionImpact: rec.estimatedPreventionImpact,
    })),
  });

  const evidenceRows = recommendations
    .filter((rec) => (rec.evidenceCount ?? 0) > 0)
    .flatMap((rec) => [
      {
        sessionId: session.id,
        recommendationActionId: rec.id,
        evidenceType: "note",
        uploadedByRole: rec.actionOwner === "contractor" ? "contractor" : "family",
        note: `Before update: ${rec.title} was identified as part of the demo prevention plan.`,
        createdAt: daysAgo(8 - input.index),
      },
      ...(rec.actionStatus === "completed"
        ? [{
            sessionId: session.id,
            recommendationActionId: rec.id,
            evidenceType: "contractor_update",
            uploadedByRole: rec.actionOwner === "contractor" ? "contractor" : "family",
            note: `After update: ${rec.title} was marked complete with note-based demo evidence.`,
            createdAt: daysAgo(4 - input.index),
          }]
        : []),
    ]);
  if (evidenceRows.length > 0) await prisma.recommendationEvidence.createMany({ data: evidenceRows });

  const assessment = {
    sessionId: session.id,
    overallRiskLevel: session.overallRiskLevel as "low" | "medium" | "high" | "critical",
    finalHazards,
    recommendations,
    summary: `${input.household.label} includes ${finalHazards.length} demo findings for prevention support and care coordination.`,
  };
  const report = buildReportPayload(assessment, { ...input.household.seniorProfile, sessionId: session.id } as SeniorProfile);
  report.consent = {
    consentAccepted: true,
    consentAcceptedAt: session.consentAcceptedAt?.toISOString(),
    consentVersion: CONSENT_VERSION,
    recordingPermissionConfirmed: true,
    shareWithCareCoordinator: true,
    shareWithContractor: input.index !== 2,
    shareWithInsurer: true,
  };
  report.assessmentReview = {
    sessionId: session.id,
    reviewStatus: input.index === 2 ? "needs_followup" : "reviewed",
    reviewedBy: "Demo Care Coordinator",
    reviewedAt: daysAgo(3).toISOString(),
    reviewerNotes: input.index === 2 ? "Memory-support concerns flagged for care coordination follow-up." : "Demo assessment reviewed for pilot demonstration.",
    confidenceLevel: input.index === 0 ? "high" : "medium",
    flaggedIssues: input.index === 2 ? ["memory support follow-up"] : [],
  };
  await prisma.reportSnapshot.create({
    data: {
      sessionId: session.id,
      userId: input.userId,
      reportJson: report as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.assessmentReview.create({
    data: {
      sessionId: session.id,
      reviewStatus: report.assessmentReview.reviewStatus,
      reviewedBy: report.assessmentReview.reviewedBy,
      reviewedAt: new Date(report.assessmentReview.reviewedAt ?? new Date().toISOString()),
      reviewerNotes: report.assessmentReview.reviewerNotes,
      confidenceLevel: report.assessmentReview.confidenceLevel,
      flaggedIssues: report.assessmentReview.flaggedIssues as Prisma.InputJsonValue,
    },
  });

  return { sessionId: session.id, reportUrl: `/report?sessionId=${session.id}`, firstRecommendationId: recommendations[0]?.id };
}

async function run(): Promise<void> {
  assertSafeToRun();
  if (process.env.DEMO_SEED_RESET === "true") {
    await resetDemoScope();
  }

  const existingPartner = await prisma.partnerOrganization.findFirst({ where: { name: DEMO_PARTNER_NAME } });
  if (existingPartner) {
    const existingCohort = await prisma.pilotCohort.findFirst({ where: { partnerOrganizationId: existingPartner.id, name: DEMO_COHORT_NAME } });
    if (existingCohort) {
      const [sessionCount, referralCount] = await Promise.all([
        prisma.inspectionSession.count({ where: { pilotCohortId: existingCohort.id } }),
        prisma.partnerReferral.count({ where: { pilotCohortId: existingCohort.id } }),
      ]);
      if (sessionCount > 0 || referralCount > 0) {
        throw new Error("Demo pilot already exists. Set DEMO_SEED_RESET=true to reset only the recognizable demo partner/user scope.");
      }
    }
  }

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    create: { email: DEMO_USER_EMAIL, name: "Parent Safety Demo Admin", role: "admin" },
    update: { name: "Parent Safety Demo Admin", role: "admin" },
  });
  const partner = await prisma.partnerOrganization.create({
    data: {
      name: DEMO_PARTNER_NAME,
      organizationType: "care_coordinator",
      displayName: "Demo Care Partner",
      primaryContact: "Pilot Team",
      contactName: "Demo Pilot Lead",
      contactEmail: "pilot@demo-care.local",
      notes: "DEMO_PARENT_SAFETY_PILOT",
    },
  });
  const cohort = await prisma.pilotCohort.create({
    data: {
      partnerOrganizationId: partner.id,
      name: DEMO_COHORT_NAME,
      description: "Demo pilot for prevention support, family safety, service coordination, and self-reported follow-up tracking.",
      status: "active",
      startDate: daysAgo(30),
      targetHouseholds: 25,
      consentVersion: CONSENT_VERSION,
      notes: "DEMO_PARENT_SAFETY_PILOT",
    },
  });

  const referralStatuses = ["created", "opened", "started_onboarding", "consent_completed", "assessment_completed", "report_generated", "inactive", "cancelled"];
  const referrals = await Promise.all(referralStatuses.map((status, idx) =>
    prisma.partnerReferral.create({
      data: {
        partnerOrganizationId: partner.id,
        pilotCohortId: cohort.id,
        referralCode: createReferralCode(idx),
        inviteType: idx % 2 === 0 ? "family_invite" : "insurer_member",
        recipientName: `Demo Recipient ${idx + 1}`,
        recipientEmail: `recipient${idx + 1}@demo-care.local`,
        seniorName: households[idx % households.length]?.seniorProfile.seniorName,
        status,
        sourceLabel: "demo-pilot",
        notes: "DEMO_PARENT_SAFETY_PILOT referral",
        ...statusTimestamps(status, 14 - idx),
      },
    })
  ));

  const createdSessions: Array<{ sessionId: string; reportUrl: string; firstRecommendationId?: string }> = [];
  for (let index = 0; index < households.length; index += 1) {
    createdSessions.push(await createReportForHousehold({
      userId: user.id,
      cohortId: cohort.id,
      referralId: referrals[5].id,
      household: households[index],
      index,
    }));
  }

  const [urgent, bathroom, memory, lowRisk, completed] = createdSessions;
  await prisma.serviceRequest.createMany({
    data: [
      {
        sessionId: urgent.sessionId,
        recommendationActionId: urgent.firstRecommendationId,
        serviceType: "home_modification",
        title: "Demo grab bar and nighttime safety request",
        description: "Coordinate bathroom grab bar installation and lighting updates for prevention support.",
        priority: "immediate",
        requestedByRole: "care_coordinator",
        requestedByName: "Demo Care Coordinator",
        status: "scheduled",
        scheduledAt: daysFromNow(4),
        providerName: "Demo Home Mods",
        providerContact: "mods@demo-care.local",
        notes: "Demo home modification request linked to urgent bathroom safety plan.",
      },
      {
        sessionId: bathroom.sessionId,
        recommendationActionId: bathroom.firstRecommendationId,
        serviceType: "rehab_evaluation",
        title: "Demo rehab evaluation request",
        description: "Discuss mobility and transfer support with an appropriate professional.",
        priority: "this_week",
        requestedByRole: "family",
        requestedByName: "Nina Demo",
        status: "matched",
        providerName: "Demo Therapy Partner",
      },
      {
        sessionId: memory.sessionId,
        serviceType: "memory_support",
        title: "Demo memory support planning request",
        description: "Coordinate routine cues, family communication, and professional evaluation discussion if appropriate.",
        priority: "this_week",
        requestedByRole: "care_coordinator",
        requestedByName: "Demo Care Coordinator",
        status: "requested",
        notes: "Prevention support only; not diagnostic.",
      },
      {
        sessionId: lowRisk.sessionId,
        serviceType: "family_checkin",
        title: "Demo family check-in routine",
        description: "Set up a simple weekly family check-in and emergency contact review.",
        priority: "monitor",
        requestedByRole: "family",
        status: "completed",
        completedAt: daysAgo(2),
        providerName: "Family",
        completionVerified: true,
        completionVerifiedAt: daysAgo(2),
        completionVerifiedBy: "Jordan Demo",
        serviceQualityRating: 5,
        familyFeedback: "Simple plan made the family feel more prepared.",
      },
      {
        sessionId: completed.sessionId,
        recommendationActionId: completed.firstRecommendationId,
        serviceType: "caregiver_visit",
        title: "Demo caregiver visit",
        description: "Review daily routine and confirm home changes are working for the family.",
        priority: "this_month",
        requestedByRole: "care_coordinator",
        status: "completed",
        completedAt: daysAgo(3),
        providerName: "Demo Home Care",
        providerContact: "care@demo-care.local",
        completionVerified: true,
        completionVerifiedAt: daysAgo(2),
        completionVerifiedBy: "Demo Care Coordinator",
        serviceQualityRating: 4,
        familyFeedback: "Caregiver helped confirm the new routine was easy to follow.",
      },
      {
        sessionId: completed.sessionId,
        serviceType: "smart_monitoring",
        title: "Demo monitoring option discussion",
        description: "Placeholder request to discuss non-hardware future monitoring options with family consent.",
        priority: "monitor",
        requestedByRole: "care_coordinator",
        status: "cancelled",
        notes: "Cancelled by family preference in demo scenario.",
      },
    ],
  });

  await prisma.careNote.createMany({
    data: [
      { sessionId: urgent.sessionId, noteType: "family_check_in", authorName: "Alex Demo", authorRole: "family", body: "Family cleared bedroom pathway and is waiting for contractor visit.", observedChanges: "Parent reports nighttime route feels easier.", concerns: "Bathroom grab bar still pending.", followUpNeeded: true },
      { sessionId: urgent.sessionId, noteType: "contractor_update", authorName: "Demo Home Mods", authorRole: "contractor", body: "Install visit scheduled for grab bar and lighting scope.", observedChanges: "Photos reviewed remotely.", followUpNeeded: false },
      { sessionId: memory.sessionId, noteType: "caregiver_visit", authorName: "Demo Caregiver", authorRole: "caregiver", body: "Medication cue card and appointment calendar were added.", observedChanges: "Family noticed fewer missed reminder calls this week.", concerns: "Continue watching cooking routine.", followUpNeeded: true },
      { sessionId: completed.sessionId, noteType: "family_check_in", authorName: "Chris Demo", authorRole: "family", body: "All priority home fixes completed and family check-ins are scheduled weekly.", observedChanges: "Parent says bathroom feels safer at night.", followUpNeeded: false },
    ],
  });

  await prisma.followUpCheckIn.createMany({
    data: [
      {
        sessionId: urgent.sessionId,
        pilotCohortId: cohort.id,
        checkInType: "thirty_day",
        status: "completed",
        scheduledFor: daysAgo(1),
        completedAt: daysAgo(1),
        notes: "Self-reported near-fall before contractor visit; care coordinator follow-up requested.",
        newFallsReported: false,
        nearFallsReported: true,
        newHospitalVisitReported: false,
        newCaregiverSupportAdded: false,
        majorHomeFixCompleted: false,
        medicationRoutineImproved: true,
        parentFeelsSafer: "somewhat",
        familyFeelsMorePrepared: "somewhat",
        currentBiggestConcern: "Bathroom transfer support remains the highest priority.",
        requestCareCoordinatorFollowup: true,
      },
      {
        sessionId: completed.sessionId,
        pilotCohortId: cohort.id,
        checkInType: "thirty_day",
        status: "completed",
        scheduledFor: daysAgo(3),
        completedAt: daysAgo(2),
        notes: "Self-reported update: major fixes completed and family feels more prepared.",
        newFallsReported: false,
        nearFallsReported: false,
        newHospitalVisitReported: false,
        newCaregiverSupportAdded: true,
        majorHomeFixCompleted: true,
        medicationRoutineImproved: true,
        parentFeelsSafer: "yes",
        familyFeelsMorePrepared: "yes",
        currentBiggestConcern: "Maintain weekly check-in routine.",
        requestCareCoordinatorFollowup: false,
      },
      { sessionId: bathroom.sessionId, pilotCohortId: cohort.id, checkInType: "sixty_day", status: "scheduled", scheduledFor: daysFromNow(18), notes: "Upcoming demo 60-day check-in." },
      { sessionId: memory.sessionId, pilotCohortId: cohort.id, checkInType: "ninety_day", status: "missed", scheduledFor: daysAgo(6), notes: "Missed demo check-in; needs coordinator outreach." },
    ],
  });

  await prisma.contractorLead.create({
    data: {
      userId: user.id,
      sessionId: urgent.sessionId,
      name: "Alex Demo",
      email: "alex@demo-care.local",
      phone: "555-0199",
      zipCode: "43215",
      preferredContact: "email",
      notes: "Demo lead for urgent bathroom home modification.",
      status: "converted",
      internalNotes: "DEMO_PARENT_SAFETY_PILOT converted lead.",
      projectUrgency: "immediately",
      estimatedBudget: "2000_5000",
      scopeText: "Install grab bars, non-slip treatment, and nighttime lighting.",
    },
  });
  await prisma.affiliateClick.createMany({
    data: [
      { userId: user.id, sessionId: completed.sessionId, productName: "Demo Motion Night Lights", category: "Lighting", affiliateUrl: "https://example.com/demo-parent-safety/night-lights" },
      { userId: user.id, sessionId: bathroom.sessionId, productName: "Demo Non-Slip Bath Mat", category: "Bathroom Safety", affiliateUrl: "https://example.com/demo-parent-safety/bath-mat" },
    ],
  });
  await prisma.analyticsEvent.createMany({
    data: ["report_viewed", "contractor_form_opened", "contractor_lead_submitted", "affiliate_click_started"].map((eventName, index) => ({
      eventName,
      sessionId: createdSessions[index % createdSessions.length]?.sessionId,
      metadata: { source: "parent-safety-demo-seed", demo: true } as Prisma.InputJsonValue,
      createdAt: daysAgo(index + 1),
    })),
  });

  console.info("[PARENT_SAFETY_DEMO_SEED] Created demo partner pilot", {
    partnerId: partner.id,
    cohortId: cohort.id,
    referralLink: `/start/${referrals[0].referralCode}`,
    highRiskReport: urgent.reportUrl,
    completedReport: completed.reportUrl,
  });
}

run()
  .catch((error) => {
    console.error(`[PARENT_SAFETY_DEMO_SEED] failed: ${String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
