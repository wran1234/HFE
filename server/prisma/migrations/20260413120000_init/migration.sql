-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

CREATE TABLE "EmailLoginToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLoginToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLoginToken_email_createdAt_idx" ON "EmailLoginToken"("email", "createdAt");

CREATE TABLE "Home" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "city" TEXT,
    "homeType" TEXT,
    "floorCount" INTEGER,
    "hasElevator" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Home_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Home_userId_idx" ON "Home"("userId");

CREATE TABLE "InspectionSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeId" TEXT,
    "status" TEXT NOT NULL,
    "residentAge" INTEGER,
    "mobilityAid" TEXT,
    "fallHistory" INTEGER,
    "nightBathroomTrips" BOOLEAN,
    "city" TEXT,
    "currentRoom" TEXT,
    "overallRiskLevel" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InspectionSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InspectionSession_userId_createdAt_idx" ON "InspectionSession"("userId", "createdAt");

CREATE TABLE "RoomScan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "coverageStatus" TEXT NOT NULL,
    "requiredViews" JSONB NOT NULL,
    "capturedViews" JSONB NOT NULL,
    "missingViews" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomScan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomScan_sessionId_roomType_key" ON "RoomScan"("sessionId", "roomType");

CREATE TABLE "EvidenceAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomType" TEXT,
    "hazardObservationId" TEXT,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HazardObservation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomScanId" TEXT,
    "roomType" TEXT NOT NULL,
    "hazardType" TEXT NOT NULL,
    "severityHint" TEXT,
    "confidence" DOUBLE PRECISION,
    "evidenceImagePath" TEXT,
    "modelNote" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "evidenceAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HazardObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinalHazard" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "hazardType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "evidenceImagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinalHazard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "finalHazardId" TEXT NOT NULL,
    "fixType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "estimatedCostMin" INTEGER,
    "estimatedCostMax" INTEGER,
    "materialsJson" JSONB,
    "installationComplexity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLoginToken" ADD CONSTRAINT "EmailLoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Home" ADD CONSTRAINT "Home_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomScan" ADD CONSTRAINT "RoomScan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAsset" ADD CONSTRAINT "EvidenceAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAsset" ADD CONSTRAINT "EvidenceAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HazardObservation" ADD CONSTRAINT "HazardObservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HazardObservation" ADD CONSTRAINT "HazardObservation_roomScanId_fkey" FOREIGN KEY ("roomScanId") REFERENCES "RoomScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HazardObservation" ADD CONSTRAINT "HazardObservation_evidenceAssetId_fkey" FOREIGN KEY ("evidenceAssetId") REFERENCES "EvidenceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinalHazard" ADD CONSTRAINT "FinalHazard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_finalHazardId_fkey" FOREIGN KEY ("finalHazardId") REFERENCES "FinalHazard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
