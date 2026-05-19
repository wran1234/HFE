# HFE Public Beta Runbook

HFE public beta is AI-assisted home safety guidance. It is not diagnosis, medical advice, emergency response, or a substitute for an occupational therapist.

## Pre-Deploy

- Run Prisma migrations against staging first: `cd server && npm run prisma:migrate`.
- Run gates locally: server TypeScript, client TypeScript, server Jest, client Vitest, and the browser smoke flows in `BETA_QA.md`.
- Confirm required production env is set: `DATABASE_URL`, `AUTH_SESSION_SECRET`, `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, `ADMIN_EMAILS`, `ALLOWED_ORIGIN`, `STORAGE_PROVIDER`, `GCS_BUCKET_NAME`, `SENTRY_DSN`.
- Confirm `/ready` returns `ready` in staging before promoting a build.

## Deploy

1. Update `server/.env` with production values.
2. Run `./deploy.sh <gcp-project-id>`.
3. Confirm Cloud Run revision is serving.
4. Open `/health` and `/ready`.
5. Complete one admin-denied check with a normal user and one admin-allowed check with an `ADMIN_EMAILS` user.

## Rollback

1. In Cloud Run, route 100% traffic back to the previous healthy revision.
2. Re-run `/health` and `/ready`.
3. Verify login, assessment start failure recovery, and report reload.
4. If a migration caused the incident, do not roll database backward blindly. Create a forward fix migration or restore from a tested backup.

## Gemini Live Outage

- Symptoms: websocket startup errors, `session_started` never arrives, high Gemini error logs.
- Action: check `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, and Google status. If the model is unavailable, update `GEMINI_LIVE_MODEL` to an active Live preview model and redeploy.
- User impact: assessments must return to idle with recovery copy and must not create an active in-progress state.

## Storage Outage

- Symptoms: evidence upload failures, missing evidence images, `/ready` storage check fails.
- Action: verify `STORAGE_PROVIDER=gcs`, bucket permissions, `GCS_BUCKET_NAME`, and signed URL TTL.
- User impact: reports can still render text findings, but beta support must disclose missing image evidence and collect affected session IDs.

## User Data Deletion

1. Verify requester ownership through the login email tied to the account.
2. Delete or anonymize inspection sessions, reports, evidence objects, contractor leads, analytics events, and auth sessions for that user.
3. Confirm GCS evidence objects are removed and signed URLs have expired.
4. Reply with completion date and scope. Do not include internal notes or admin-only metadata in the user response.

## Incident Severity

- P0: admin/user data exposure, cross-user evidence access, missing privacy consent, broken auth, or unsafe medical/emergency claims.
- P1: login, assessment, report, contractor lead, or admin workflow unavailable.
- P2: degraded UX, non-critical empty states, copy polish, or minor mobile layout issues.
