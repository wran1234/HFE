import { PrismaClient } from "@prisma/client";
import { computeOverallRisk, dedupeObservations, runAssessmentEngine } from "../assessmentEngine";
import { FinalHazard, HazardObservation, InspectionSession } from "../../domain/types";

const mkObs = (overrides: Partial<HazardObservation>): HazardObservation => ({
  id: "obs_default",
  sessionId: "s1",
  roomType: "bathroom",
  hazardType: "slippery_floor",
  severityHint: "medium",
  modelNote: "note",
  followUpNeeded: false,
  status: "candidate",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("dedupeObservations", () => {
  it("keeps all observations when there are no duplicates", () => {
    const input = [
      mkObs({ id: "a", roomType: "bathroom", hazardType: "slippery_floor" }),
      mkObs({ id: "b", roomType: "kitchen", hazardType: "poor_lighting" }),
    ];
    expect(dedupeObservations(input)).toHaveLength(2);
  });

  it("keeps higher severity for same room + hazard", () => {
    const input = [
      mkObs({ id: "a", severityHint: "low" }),
      mkObs({ id: "b", severityHint: "high" }),
    ];
    const result = dedupeObservations(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("keeps first when same room + hazard + same severity", () => {
    const input = [
      mkObs({ id: "a", severityHint: "medium" }),
      mkObs({ id: "b", severityHint: "medium" }),
    ];
    const result = dedupeObservations(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("keeps both for different rooms with same hazard type", () => {
    const input = [
      mkObs({ id: "a", roomType: "bathroom", hazardType: "poor_lighting" }),
      mkObs({ id: "b", roomType: "bedroom", hazardType: "poor_lighting" }),
    ];
    const result = dedupeObservations(input);
    expect(result).toHaveLength(2);
  });
});

describe("computeOverallRisk", () => {
  const hazard = (severity: FinalHazard["severity"]): FinalHazard => ({
    id: "fh",
    sessionId: "s1",
    roomType: "bathroom",
    hazardType: "slippery_floor",
    severity,
    reason: "r",
    priority: "high",
  });

  it("returns low for empty hazards", () => {
    expect(computeOverallRisk([])).toBe("low");
  });

  it("returns critical for all critical hazards", () => {
    expect(computeOverallRisk([hazard("critical"), hazard("critical")])).toBe("critical");
  });

  it("returns expected bucket for mixed severities", () => {
    expect(computeOverallRisk([hazard("low"), hazard("medium"), hazard("high")])).toBe("medium");
  });
});

const integrationDescribe = process.env.DATABASE_URL_TEST ? describe : describe.skip;

integrationDescribe("runAssessmentEngine integration", () => {
  let prisma: PrismaClient;
  const testId = `test_${Date.now()}`;

  const session: InspectionSession = {
    id: `${testId}_session`,
    userId: `${testId}_user`,
    homeId: `${testId}_home`,
    status: "active",
    residentAge: 78,
    mobilityAid: "walker",
    fallHistory: 1,
    nightBathroomTrips: true,
    city: "TestCity",
    startedAt: new Date().toISOString(),
    skippedRooms: [],
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_TEST as string } },
    });
    await prisma.user.create({
      data: { id: session.userId, email: `${testId}@example.com` },
    });
    await prisma.home.create({
      data: { id: session.homeId, userId: session.userId },
    });
    await prisma.inspectionSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        homeId: session.homeId,
        status: "active",
        residentAge: session.residentAge,
        mobilityAid: session.mobilityAid,
        fallHistory: session.fallHistory,
        nightBathroomTrips: session.nightBathroomTrips,
        city: session.city,
      },
    });
    await prisma.hazardObservation.create({
      data: {
        id: `${testId}_obs1`,
        sessionId: session.id,
        roomType: "bathroom",
        hazardType: "slippery_floor",
        severityHint: "high",
        modelNote: "wet floor",
        followUpNeeded: false,
        status: "candidate",
      },
    });
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { sessionId: { startsWith: testId } } });
    await prisma.finalHazard.deleteMany({ where: { sessionId: { startsWith: testId } } });
    await prisma.hazardObservation.deleteMany({ where: { sessionId: { startsWith: testId } } });
    await prisma.inspectionSession.deleteMany({ where: { id: { startsWith: testId } } });
    await prisma.home.deleteMany({ where: { id: { startsWith: testId } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: testId } } });
    await prisma.$disconnect();
  });

  it("persists final hazards and returns overall risk level", async () => {
    const result = await runAssessmentEngine(session);
    expect(result.finalHazards.length).toBeGreaterThan(0);
    expect(["low", "medium", "high", "critical"]).toContain(result.overallRiskLevel);
  });
});
