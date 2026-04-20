import { db } from "../data/repository";
import { AssessmentResult, ReportPayload } from "../domain/types";

export function buildReportPayload(assessment: AssessmentResult): ReportPayload {
  const grouped = new Map<string, AssessmentResult["finalHazards"]>();
  for (const hazard of assessment.finalHazards) {
    const list = grouped.get(hazard.roomType) ?? [];
    list.push(hazard);
    grouped.set(hazard.roomType, list);
  }

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
    export: {
      schemaVersion: "1.0.0",
      canRenderPdf: true,
    },
  };

  // report snapshot persistence is user-scoped and handled by caller
  return report;
}

export async function persistReportPayload(report: ReportPayload, userId: string): Promise<void> {
  await db.saveReport(report, userId);
}
