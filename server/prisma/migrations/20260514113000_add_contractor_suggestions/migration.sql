-- Add stored contractor suggestions for local care-network/contractor scope recommendations.
CREATE TABLE "ContractorSuggestion" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "trade" TEXT NOT NULL,
  "zipCode" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'google_places',
  "externalId" TEXT,
  "name" TEXT NOT NULL,
  "rating" DOUBLE PRECISION,
  "reviewCount" INTEGER,
  "address" TEXT,
  "phone" TEXT,
  "websiteUrl" TEXT,
  "profileUrl" TEXT,
  "sourceUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContractorSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractorSuggestion_sessionId_createdAt_idx" ON "ContractorSuggestion"("sessionId", "createdAt");
CREATE INDEX "ContractorSuggestion_zipCode_trade_rating_idx" ON "ContractorSuggestion"("zipCode", "trade", "rating");
CREATE UNIQUE INDEX "ContractorSuggestion_sessionId_trade_zipCode_provider_externalId_key" ON "ContractorSuggestion"("sessionId", "trade", "zipCode", "provider", "externalId");

ALTER TABLE "ContractorSuggestion" ADD CONSTRAINT "ContractorSuggestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
