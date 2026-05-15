/*
  Warnings:

  - You are about to drop the column `scopeSummary` on the `ContractorLead` table. All the data in the column will be lost.
  - You are about to drop the column `zip` on the `ContractorLead` table. All the data in the column will be lost.
  - Added the required column `preferredContact` to the `ContractorLead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scopeText` to the `ContractorLead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `zipCode` to the `ContractorLead` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."ContractorLead" DROP CONSTRAINT "ContractorLead_userId_fkey";

-- AlterTable
ALTER TABLE "public"."ContractorLead" DROP COLUMN "scopeSummary",
DROP COLUMN "zip",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "preferredContact" TEXT NOT NULL,
ADD COLUMN     "scopeText" TEXT NOT NULL,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "zipCode" TEXT NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."AffiliateClick" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "reportId" TEXT,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateClick_createdAt_idx" ON "public"."AffiliateClick"("createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_userId_createdAt_idx" ON "public"."AffiliateClick"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_sessionId_createdAt_idx" ON "public"."AffiliateClick"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractorLead_createdAt_idx" ON "public"."ContractorLead"("createdAt");

-- CreateIndex
CREATE INDEX "ContractorLead_userId_createdAt_idx" ON "public"."ContractorLead"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractorLead_sessionId_createdAt_idx" ON "public"."ContractorLead"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ContractorLead" ADD CONSTRAINT "ContractorLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractorLead" ADD CONSTRAINT "ContractorLead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."InspectionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateClick" ADD CONSTRAINT "AffiliateClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateClick" ADD CONSTRAINT "AffiliateClick_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."InspectionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
