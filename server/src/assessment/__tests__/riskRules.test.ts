import { applyRiskRules, scoreToSeverity, severityToScore } from "../riskRules";
import { HazardObservation, InspectionSession } from "../../domain/types";

const baseSession: InspectionSession = {
  id: "s1",
  userId: "u1",
  homeId: "h1",
  status: "active",
  residentAge: 72,
  mobilityAid: "none",
  fallHistory: 0,
  nightBathroomTrips: false,
  city: "SF",
  startedAt: new Date().toISOString(),
  skippedRooms: [],
};

const makeObs = (overrides: Partial<HazardObservation>): HazardObservation => ({
  id: "o1",
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

describe("applyRiskRules", () => {
  it("escalates wheelchair + narrow walkway to high", () => {
    const result = applyRiskRules(
      "narrow_walkway",
      "medium",
      { ...baseSession, mobilityAid: "wheelchair" },
      [makeObs({ hazardType: "narrow_walkway", roomType: "living_room" })]
    );
    expect(result.severity).toBe("high");
  });

  it("escalates poor lighting when night bathroom trips are true", () => {
    const result = applyRiskRules(
      "poor_lighting",
      "medium",
      { ...baseSession, nightBathroomTrips: true },
      [makeObs({ hazardType: "poor_lighting", roomType: "bedroom" })]
    );
    expect(result.severity).toBe("high");
  });

  it("keeps unsafe stairs at least medium", () => {
    const result = applyRiskRules(
      "unsafe_stairs",
      "low",
      baseSession,
      [makeObs({ hazardType: "unsafe_stairs", roomType: "stairs" })]
    );
    expect(result.severity).toBe("medium");
  });

  it("escalates slippery floor + missing grab bar combination", () => {
    const roomHazards = [
      makeObs({ hazardType: "slippery_floor", roomType: "bathroom" }),
      makeObs({ id: "o2", hazardType: "missing_grab_bar", roomType: "bathroom" }),
    ];
    const result = applyRiskRules("slippery_floor", "medium", baseSession, roomHazards);
    expect(result.severity).toBe("high");
  });

  it("escalates to high when fallHistory is >= 2", () => {
    const result = applyRiskRules(
      "poor_lighting",
      "low",
      { ...baseSession, fallHistory: 2 },
      [makeObs({ hazardType: "poor_lighting", roomType: "bedroom" })]
    );
    expect(result.severity).toBe("high");
  });

  it("returns base severity and baseline reason when no rules apply", () => {
    const result = applyRiskRules(
      "loose_rug",
      "low",
      baseSession,
      [makeObs({ hazardType: "loose_rug", roomType: "living_room" })]
    );
    expect(result.severity).toBe("low");
    expect(result.reason).toContain("Baseline model severity.");
  });
});

describe("severity mappings", () => {
  it("maps severity scores correctly", () => {
    expect(severityToScore.critical).toBe(4);
    expect(severityToScore.high).toBe(3);
    expect(severityToScore.medium).toBe(2);
    expect(severityToScore.low).toBe(1);
    expect(scoreToSeverity(4)).toBe("critical");
    expect(scoreToSeverity(3)).toBe("high");
    expect(scoreToSeverity(2)).toBe("medium");
    expect(scoreToSeverity(1)).toBe("low");
  });
});
