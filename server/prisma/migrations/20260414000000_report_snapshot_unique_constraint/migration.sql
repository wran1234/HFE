-- AddUniqueConstraint: ReportSnapshot(sessionId, userId)
-- Idempotent report persistence: prevents duplicate rows when both the WS
-- request_report path and the REST POST /api/sessions/:id/finalize path
-- write a report for the same session concurrently.

-- Remove any existing duplicate rows first (keep the most recent per session+user)
DELETE FROM "ReportSnapshot"
WHERE id NOT IN (
  SELECT DISTINCT ON ("sessionId", "userId") id
  FROM "ReportSnapshot"
  ORDER BY "sessionId", "userId", "createdAt" DESC
);

CREATE UNIQUE INDEX "ReportSnapshot_sessionId_userId_key" ON "ReportSnapshot"("sessionId", "userId");
