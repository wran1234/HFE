import { db } from "../data/repository";

export async function runAuthCleanup(retentionHours: number): Promise<{
  expiredSessionsDeleted: number;
  expiredTokensDeleted: number;
  usedTokensDeleted: number;
}> {
  return db.cleanupAuthRecords(retentionHours);
}
