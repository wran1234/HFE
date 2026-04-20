import { describe, it, expect } from "vitest";
import { toAssessmentReport } from "./reportTransform";
import type { UserProfile } from "./types";

// To run: add vitest to client dev dependencies and add "test": "vitest" to package.json
// npm: npm install -D vitest  |  then: npm test

const PROFILE: UserProfile = {
  assessmentFor: "family",
  age: 78,
  livesAlone: false,
  mobilityLevel: "cane",
  fallHistoryCount: 1,
  visionImpaired: false,
  medicationCount: 3,
  houseType: "single-story",
  hasStairs: false,
  hasOutdoorSteps: true,
  nightBathroomTrips: true,
};

function makeReport(hazardType: string, severity: "low" | "medium" | "high" | "critical" = "high") {
  return {
    sessionId: "test-session",
    overallRiskSummary: { summary: "Test summary" },
    roomBreakdown: [{
      roomType: "bathroom" as const,
      hazards: [{
        id: "h1",
        roomType: "bathroom" as const,
        hazardType,
        severity,
        reason: "Test reason",
        priority: severity as "low" | "medium" | "high" | "critical",
      }],
    }],
    recommendations: [{
      hazardId: "h1",
      title: "Fix it",
      description: "Install a grab bar",
      estimatedCostMin: 25,
      estimatedCostMax: 60,
      priority: severity as "low" | "medium" | "high" | "critical",
    }],
  };
}

describe("toAssessmentReport — hazard mapping", () => {
  it("maps missing_grab_bar to Grab Bars / handyman / isDIY=true", () => {
    const report = toAssessmentReport(makeReport("missing_grab_bar"), PROFILE);
    const obs = report.observations[0];
    expect(obs.category).toBe("Grab Bars");
    expect(obs.trade).toBe("handyman");
    expect(obs.isDIY).toBe(true);
  });

  it("maps missing_handrail to Stairs & Steps / general-contractor / isDIY=false", () => {
    const report = toAssessmentReport(makeReport("missing_handrail"), PROFILE);
    const obs = report.observations[0];
    expect(obs.category).toBe("Stairs & Steps");
    expect(obs.trade).toBe("general-contractor");
    expect(obs.isDIY).toBe(false);
  });

  it("maps poor_lighting to Lighting / electrician / isDIY=true", () => {
    const report = toAssessmentReport(makeReport("poor_lighting"), PROFILE);
    const obs = report.observations[0];
    expect(obs.category).toBe("Lighting");
    expect(obs.trade).toBe("electrician");
    expect(obs.isDIY).toBe(true);
  });

  it("maps outdoor_step_risk to Outdoor Safety / general-contractor / isDIY=false", () => {
    const report = toAssessmentReport(makeReport("outdoor_step_risk"), PROFILE);
    const obs = report.observations[0];
    expect(obs.category).toBe("Outdoor Safety");
    expect(obs.trade).toBe("general-contractor");
    expect(obs.isDIY).toBe(false);
  });

  it("falls back to General / handyman / isDIY=true for unknown hazard type", () => {
    const report = toAssessmentReport(makeReport("unknown_future_hazard"), PROFILE);
    const obs = report.observations[0];
    expect(obs.category).toBe("General");
    expect(obs.trade).toBe("handyman");
    expect(obs.isDIY).toBe(true);
  });
});
