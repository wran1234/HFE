ALTER TABLE "FollowUpCheckIn" ADD COLUMN "nearFallsReported" BOOLEAN;
ALTER TABLE "FollowUpCheckIn" ADD COLUMN "medicationRoutineImproved" BOOLEAN;
ALTER TABLE "FollowUpCheckIn" ADD COLUMN "parentFeelsSafer" TEXT;
ALTER TABLE "FollowUpCheckIn" ADD COLUMN "familyFeelsMorePrepared" TEXT;
ALTER TABLE "FollowUpCheckIn" ADD COLUMN "currentBiggestConcern" TEXT;
ALTER TABLE "FollowUpCheckIn" ADD COLUMN "requestCareCoordinatorFollowup" BOOLEAN NOT NULL DEFAULT false;
