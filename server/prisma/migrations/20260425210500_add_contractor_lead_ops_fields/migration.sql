-- AlterTable
ALTER TABLE "public"."ContractorLead"
ADD COLUMN     "estimatedBudget" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "projectUrgency" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'new';
