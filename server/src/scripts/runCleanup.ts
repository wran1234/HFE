import dotenv from "dotenv";
import { runAuthCleanup } from "../auth/authCleanup";

dotenv.config();

async function main(): Promise<void> {
  const retentionHours = Number(process.env.AUTH_TOKEN_RETENTION_HOURS || 48);
  const startedAt = new Date().toISOString();
  console.info(`[AUTH_CLEANUP] start retentionHours=${retentionHours}`);
  const result = await runAuthCleanup(retentionHours);
  const finishedAt = new Date().toISOString();
  console.info(`[AUTH_CLEANUP] done expiredSessions=${result.expiredSessionsDeleted} expiredTokens=${result.expiredTokensDeleted} usedTokens=${result.usedTokensDeleted}`);
  console.info(
    JSON.stringify({
      startedAt,
      finishedAt,
      ...result,
    })
  );
}

main().catch((error) => {
  console.error(`[AUTH_CLEANUP] failed: ${String(error)}`);
  process.exit(1);
});
