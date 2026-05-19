-- Add missing indexes identified by DB performance audit.
-- Each index is created with IF NOT EXISTS to be safe against partial drift.

-- HazardObservation: queried by sessionId in listObservations; roomScanId is a FK
CREATE INDEX IF NOT EXISTS "HazardObservation_sessionId_createdAt_idx" ON "HazardObservation"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "HazardObservation_roomScanId_idx" ON "HazardObservation"("roomScanId");

-- FinalHazard: deleteMany/createMany by sessionId in saveAssessment
CREATE INDEX IF NOT EXISTS "FinalHazard_sessionId_idx" ON "FinalHazard"("sessionId");

-- Recommendation: queried by sessionId (deleteMany, count with filters) and finalHazardId (FK)
CREATE INDEX IF NOT EXISTS "Recommendation_sessionId_actionStatus_idx" ON "Recommendation"("sessionId", "actionStatus");
CREATE INDEX IF NOT EXISTS "Recommendation_finalHazardId_idx" ON "Recommendation"("finalHazardId");
-- Supports count queries filtering on actionPriority + actionStatus (getRevenueSummary)
CREATE INDEX IF NOT EXISTS "Recommendation_actionPriority_actionStatus_idx" ON "Recommendation"("actionPriority", "actionStatus");

-- ReportSnapshot: queried by userId (listReportsForUser) and sessionId (getReport)
CREATE INDEX IF NOT EXISTS "ReportSnapshot_userId_createdAt_idx" ON "ReportSnapshot"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportSnapshot_sessionId_createdAt_idx" ON "ReportSnapshot"("sessionId", "createdAt");

-- EvidenceAsset: has userId and sessionId FKs used in cascade deletes and future lookups
CREATE INDEX IF NOT EXISTS "EvidenceAsset_sessionId_createdAt_idx" ON "EvidenceAsset"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "EvidenceAsset_userId_createdAt_idx" ON "EvidenceAsset"("userId", "createdAt");

-- EmailLoginToken: queried by expiresAt and usedAt in cleanupAuthRecords
CREATE INDEX IF NOT EXISTS "EmailLoginToken_expiresAt_idx" ON "EmailLoginToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailLoginToken_usedAt_idx" ON "EmailLoginToken"("usedAt");

-- ContractorLead: findRecentContractorLeadByEmailZip queries by email + zipCode
CREATE INDEX IF NOT EXISTS "ContractorLead_email_zipCode_createdAt_idx" ON "ContractorLead"("email", "zipCode", "createdAt");
