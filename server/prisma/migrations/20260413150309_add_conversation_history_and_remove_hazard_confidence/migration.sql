/*
  Warnings:

  - You are about to drop the column `confidence` on the `HazardObservation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."HazardObservation" DROP COLUMN "confidence";

-- AlterTable
ALTER TABLE "public"."InspectionSession" ADD COLUMN     "conversationHistory" JSONB;
