-- Migration: add ContractorLead table
CREATE TABLE "ContractorLead" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "zip" TEXT NOT NULL,
  "phone" TEXT,
  "scopeSummary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractorLead_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ContractorLead" ADD CONSTRAINT "ContractorLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
