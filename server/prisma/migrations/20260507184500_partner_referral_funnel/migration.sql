ALTER TABLE "InspectionSession" ADD COLUMN "referralId" TEXT;

CREATE TABLE "PartnerReferral" (
  "id" TEXT NOT NULL,
  "partnerOrganizationId" TEXT NOT NULL,
  "pilotCohortId" TEXT,
  "referralCode" TEXT NOT NULL,
  "inviteType" TEXT NOT NULL,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "recipientPhone" TEXT,
  "seniorName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'created',
  "sourceLabel" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "openedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "consentCompletedAt" TIMESTAMP(3),
  "assessmentCompletedAt" TIMESTAMP(3),
  "reportGeneratedAt" TIMESTAMP(3),

  CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerReferral_referralCode_key" ON "PartnerReferral"("referralCode");
CREATE INDEX "InspectionSession_referralId_createdAt_idx" ON "InspectionSession"("referralId", "createdAt");
CREATE INDEX "PartnerReferral_partnerOrganizationId_status_idx" ON "PartnerReferral"("partnerOrganizationId", "status");
CREATE INDEX "PartnerReferral_pilotCohortId_status_idx" ON "PartnerReferral"("pilotCohortId", "status");
CREATE INDEX "PartnerReferral_status_createdAt_idx" ON "PartnerReferral"("status", "createdAt");

ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "PartnerReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_partnerOrganizationId_fkey"
  FOREIGN KEY ("partnerOrganizationId") REFERENCES "PartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_pilotCohortId_fkey"
  FOREIGN KEY ("pilotCohortId") REFERENCES "PilotCohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
