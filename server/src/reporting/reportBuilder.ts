import { db } from "../data/repository";
import {
  buildFamilyDashboard,
  buildIndependencePlan,
  buildIndependenceRiskScore,
  buildMemorySupportChecklist,
  buildPreventionSummary,
} from "../domain/independenceRisk";
import { AssessmentResult, ReportPayload, SeniorProfile } from "../domain/types";

export function buildReportPayload(assessment: AssessmentResult, seniorProfile?: SeniorProfile): ReportPayload {
  const grouped = new Map<string, AssessmentResult["finalHazards"]>();
  for (const hazard of assessment.finalHazards) {
    const list = grouped.get(hazard.roomType) ?? [];
    list.push(hazard);
    grouped.set(hazard.roomType, list);
  }

  const independenceRiskScore = buildIndependenceRiskScore({
    profile: seniorProfile,
    finalHazards: assessment.finalHazards,
  });
  const independencePlan = buildIndependencePlan({
    profile: seniorProfile,
    finalHazards: assessment.finalHazards,
    recommendations: assessment.recommendations,
    riskScore: independenceRiskScore,
  });
  const familyDashboard = buildFamilyDashboard({
    riskScore: independenceRiskScore,
    plan: independencePlan,
    finalHazards: assessment.finalHazards,
    profile: seniorProfile,
  });
  const memorySupportChecklist = buildMemorySupportChecklist(seniorProfile);
  const preventionSummary = buildPreventionSummary({
    profile: seniorProfile,
    riskScore: independenceRiskScore,
    plan: independencePlan,
  });

  const report: ReportPayload = {
    sessionId: assessment.sessionId,
    generatedAt: new Date().toISOString(),
    overallRiskSummary: {
      level: assessment.overallRiskLevel,
      totalHazards: assessment.finalHazards.length,
      highPriorityCount: assessment.finalHazards.filter((hazard) => hazard.priority === "high" || hazard.priority === "critical").length,
      summary: assessment.summary,
    },
    roomBreakdown: Array.from(grouped.entries()).map(([roomType, hazards]) => ({
      roomType: roomType as ReportPayload["roomBreakdown"][number]["roomType"],
      hazards,
    })),
    recommendations: assessment.recommendations,
    evidenceImages: assessment.finalHazards
      .filter((hazard) => !!hazard.evidenceImagePath)
      .map((hazard) => ({
        hazardId: hazard.id,
        imagePath: hazard.evidenceImagePath ?? "",
        roomType: hazard.roomType,
    })),
    plainLanguageSummary: assessment.summary,
    seniorProfile,
    independenceRiskScore,
    independencePlan,
    familyDashboard,
    memorySupportChecklist,
    preventionSummary,
    export: {
      schemaVersion: "2.0.0",
      canRenderPdf: true,
    },
  };

  // report snapshot persistence is user-scoped and handled by caller
  return report;
}

export async function persistReportPayload(report: ReportPayload, userId: string): Promise<void> {
  await db.saveReport(report, userId);
}
