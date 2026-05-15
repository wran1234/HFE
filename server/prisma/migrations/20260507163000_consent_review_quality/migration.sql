ALTER TABLE "InspectionSession" ADD COLUMN "consentAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InspectionSession" ADD COLUMN "consentAcceptedAt" TIMESTAMP(3);
ALTER TABLE "InspectionSession" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "InspectionSession" ADD COLUMN "recordingPermissionConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InspectionSession" ADD COLUMN "shareWithCareCoordinator" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InspectionSession" ADD COLUMN "shareWithContractor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InspectionSession" ADD COLUMN "shareWithInsurer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ServiceRequest" ADD COLUMN "serviceQualityRating" INTEGER;
ALTER TABLE "ServiceRequest" ADD COLUMN "familyFeedback" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "providerFollowupNeeded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceRequest" ADD COLUMN "completionVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceRequest" ADD COLUMN "completionVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ServiceRequest" ADD COLUMN "completionVerifiedBy" TEXT;

CREATE TABLE "AssessmentReview" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewerNotes" TEXT,
  "confidenceLevel" TEXT NOT NULL DEFAULT 'medium',
  "flaggedIssues" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssessmentReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentReview_sessionId_key" ON "AssessmentReview"("sessionId");

ALTER TABLE "AssessmentReview" ADD CONSTRAINT "AssessmentReview_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
