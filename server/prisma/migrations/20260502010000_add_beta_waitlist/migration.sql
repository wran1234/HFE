CREATE TABLE IF NOT EXISTS "BetaWaitlistSignup" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" TEXT,
  "zipCode" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BetaWaitlistSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BetaWaitlistSignup_email_key" ON "BetaWaitlistSignup"("email");
CREATE INDEX IF NOT EXISTS "BetaWaitlistSignup_createdAt_idx" ON "BetaWaitlistSignup"("createdAt");
CREATE INDEX IF NOT EXISTS "BetaWaitlistSignup_zipCode_createdAt_idx" ON "BetaWaitlistSignup"("zipCode", "createdAt");
