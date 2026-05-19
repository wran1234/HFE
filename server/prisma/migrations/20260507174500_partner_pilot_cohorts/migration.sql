ALTER TABLE "InspectionSession" ADD COLUMN "pilotCohortId" TEXT;

CREATE TABLE "PartnerOrganization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "organizationType" TEXT NOT NULL,
  "displayName" TEXT,
  "logoUrl" TEXT,
  "primaryContact" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PartnerOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotCohort" (
  "id" TEXT NOT NULL,
  "partnerOrganizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "targetHouseholds" INTEGER,
  "consentVersion" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PilotCohort_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FollowUpCheckIn" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "pilotCohortId" TEXT,
  "checkInType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "newFallsReported" BOOLEAN,
  "newHospitalVisitReported" BOOLEAN,
  "newCaregiverSupportAdded" BOOLEAN,
  "majorHomeFixCompleted" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FollowUpCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InspectionSession_pilotCohortId_createdAt_idx" ON "InspectionSession"("pilotCohortId", "createdAt");
CREATE INDEX "PartnerOrganization_organizationType_createdAt_idx" ON "PartnerOrganization"("organizationType", "createdAt");
CREATE INDEX "PilotCohort_partnerOrganizationId_status_idx" ON "PilotCohort"("partnerOrganizationId", "status");
CREATE INDEX "PilotCohort_status_createdAt_idx" ON "PilotCohort"("status", "createdAt");
CREATE INDEX "FollowUpCheckIn_sessionId_scheduledFor_idx" ON "FollowUpCheckIn"("sessionId", "scheduledFor");
CREATE INDEX "FollowUpCheckIn_pilotCohortId_scheduledFor_idx" ON "FollowUpCheckIn"("pilotCohortId", "scheduledFor");
CREATE INDEX "FollowUpCheckIn_status_scheduledFor_idx" ON "FollowUpCheckIn"("status", "scheduledFor");

ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_pilotCohortId_fkey"
  FOREIGN KEY ("pilotCohortId") REFERENCES "PilotCohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PilotCohort" ADD CONSTRAINT "PilotCohort_partnerOrganizationId_fkey"
  FOREIGN KEY ("partnerOrganizationId") REFERENCES "PartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpCheckIn" ADD CONSTRAINT "FollowUpCheckIn_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpCheckIn" ADD CONSTRAINT "FollowUpCheckIn_pilotCohortId_fkey"
  FOREIGN KEY ("pilotCohortId") REFERENCES "PilotCohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
