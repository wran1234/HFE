import express from "express";
import { requireAuth } from "../auth/authMiddleware";
import { db } from "../data/repository";
import { ReportPayload } from "../domain/types";

export function createReportsRouter() {
  const router = express.Router();

  router.get("/", requireAuth, async (req, res) => {
    const limit = Math.min(Math.max(1, Number(req.query.limit ?? 20)), 100);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    let items: Awaited<ReturnType<typeof db.listReportsForUser>>["reports"];
    let nextCursor: string | null;
    try {
      ({ reports: items, nextCursor } = await db.listReportsForUser(req.authUser!.id, { limit, cursor }));
    } catch {
      return res.status(400).json({ error: "Invalid cursor." });
    }
    return res.json({
      reports: items.map((item) => {
        const report = item.reportJson as ReportPayload;
        return {
          sessionId: item.sessionId,
          createdAt: item.createdAt,
          riskLevel: report?.overallRiskSummary?.level,
          hazardCount: report?.overallRiskSummary?.totalHazards,
          roomCount: report?.roomBreakdown?.length ?? 0,
          summary: report?.overallRiskSummary?.summary ?? "",
        };
      }),
      nextCursor,
    });
  });

  return router;
}
