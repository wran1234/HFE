ALTER TABLE "Recommendation" ADD COLUMN "actionOwner" TEXT;
ALTER TABLE "Recommendation" ADD COLUMN "actionPriority" TEXT;
ALTER TABLE "Recommendation" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Recommendation" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Recommendation" ADD COLUMN "skippedReason" TEXT;
ALTER TABLE "Recommendation" ADD COLUMN "estimatedPreventionImpact" TEXT;

CREATE TABLE "RecommendationEvidence" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "recommendationActionId" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "imageUrl" TEXT,
  "note" TEXT,
  "uploadedByRole" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecommendationEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecommendationEvidence_sessionId_createdAt_idx" ON "RecommendationEvidence"("sessionId", "createdAt");
CREATE INDEX "RecommendationEvidence_recommendationActionId_createdAt_idx" ON "RecommendationEvidence"("recommendationActionId", "createdAt");

ALTER TABLE "RecommendationEvidence" ADD CONSTRAINT "RecommendationEvidence_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
