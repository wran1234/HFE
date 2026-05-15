CREATE TABLE "ServiceRequest" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "recommendationActionId" TEXT,
  "serviceType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "requestedByRole" TEXT NOT NULL,
  "requestedByName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "preferredDate" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "providerName" TEXT,
  "providerContact" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceRequest_sessionId_createdAt_idx" ON "ServiceRequest"("sessionId", "createdAt");
CREATE INDEX "ServiceRequest_recommendationActionId_idx" ON "ServiceRequest"("recommendationActionId");
CREATE INDEX "ServiceRequest_serviceType_status_idx" ON "ServiceRequest"("serviceType", "status");

ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
