ALTER TABLE "Recommendation" ADD COLUMN "actionStatus" TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE "SeniorProfile" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "seniorName" TEXT,
  "relationshipToUser" TEXT,
  "ageRange" TEXT NOT NULL DEFAULT 'unknown',
  "livingArrangement" TEXT NOT NULL DEFAULT 'unknown',
  "mobilityLevel" TEXT NOT NULL DEFAULT 'unknown',
  "priorFalls" TEXT NOT NULL DEFAULT 'unknown',
  "chronicConditions" JSONB,
  "medicationComplexity" TEXT NOT NULL DEFAULT 'unknown',
  "memoryConcerns" TEXT NOT NULL DEFAULT 'unknown',
  "visionConcerns" BOOLEAN,
  "hearingConcerns" BOOLEAN,
  "emergencyContactName" TEXT,
  "emergencyContactPhone" TEXT,
  "primaryCaregiver" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SeniorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareNote" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "noteType" TEXT NOT NULL,
  "authorName" TEXT,
  "authorRole" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "observedChanges" TEXT,
  "concerns" TEXT,
  "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CareNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeniorProfile_sessionId_key" ON "SeniorProfile"("sessionId");
CREATE INDEX "CareNote_sessionId_createdAt_idx" ON "CareNote"("sessionId", "createdAt");

ALTER TABLE "SeniorProfile" ADD CONSTRAINT "SeniorProfile_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CareNote" ADD CONSTRAINT "CareNote_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
