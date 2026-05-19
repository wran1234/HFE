# HFE MVP Architecture

## End-to-End Request/Data Flow

1. User registers or requests login code (`/api/auth/register`, `/api/auth/request-login`).
2. User verifies code (`/api/auth/verify`), server issues HTTP-only session cookie (`hfe_session`).
3. Protected frontend routes (`/onboarding`, `/assessment`, `/report`) require authenticated user.
4. Browser opens websocket `/ws` with cookie; server validates auth session before allowing realtime flow.
5. `SessionOrchestrator` creates persistent `InspectionSession` + `RoomScan` records in Neon/Postgres.
6. Live frames/text flow through `GeminiLiveClient`, while state machine tracks room coverage/missing views.
7. Structured extraction creates `HazardObservation` rows; evidence snapshots are stored and linked as `EvidenceAsset`.
8. Finalization runs assessment/recommendation engines, writes `FinalHazard` and `Recommendation`, and stores report snapshot.
9. Report UI renders structured risk/hazards/recommendations/evidence output.

## Auth Flow (Hardened)

- Email code based auth for MVP:
  - request code (or register + request code)
  - verify code
  - issue session cookie (HTTP-only, SameSite=Lax, secure in production)
- One-time code hashing and expiry:
  - raw code is never stored
  - `EmailLoginToken.tokenHash` + `expiresAt` + `usedAt` enforce one-time use
  - `attemptCount` + `lastAttemptAt` + `invalidatedAt` throttle brute-force attempts
- Session validation:
  - `AuthSession.tokenHash` stores hashed session token
  - middleware resolves current user for REST and websocket handshake
  - expired sessions are deleted on lookup and invalid cookies are cleared
- Email abstraction:
  - `ConsoleEmailSender` logs codes in dev
  - `ResendEmailSender` supports production email delivery
  - sender selected by env via `emailSenderFactory` (`EMAIL_PROVIDER=console|resend`)
- Rate limiting:
  - shared provider abstraction for auth endpoints (`register`, `request-login`, `verify`)
  - IP + email keyed throttling
  - `AUTH_RATE_LIMIT_PROVIDER=upstash` enables centralized multi-instance limiting
  - non-production fallback to local limiter if shared provider is unavailable
  - configurable windows/limits via env vars
- Cleanup strategy:
  - startup cleanup runs automatically
  - scheduler-friendly endpoint (`POST /api/maintenance/auth-cleanup`) guarded by `x-maintenance-key`
  - backward-compatible endpoint (`POST /api/auth/cleanup`) remains available
  - CLI entrypoint (`npm run auth:cleanup`) supports cron/ops runs
  - clears expired sessions/tokens and old used tokens based on retention window

## Neon Persistence Layer

- Prisma schema under `server/prisma/schema.prisma`, migrations in `server/prisma/migrations`.
- DB access centralized in `server/src/data/inMemoryDatabase.ts` (now Postgres-backed repository class).
- Core persisted entities:
  - `User`, `AuthSession`, `EmailLoginToken`
  - `Home`, `InspectionSession`, `RoomScan`
  - `HazardObservation`, `FinalHazard`, `Recommendation`
  - `ReportSnapshot`, `EvidenceAsset`
- In-memory persistence is deprecated as primary path; Neon/Postgres is now the source of truth.

## Evidence Pipeline

1. Live frame arrives in orchestrator.
2. Hazard extraction identifies candidate observations.
3. Storage adapter saves frame using selected provider:
   - `evidence/{userId}/{sessionId}/{roomType}/{timestamp}.jpg`
4. DB record written in `EvidenceAsset` with storage metadata.
5. `HazardObservation` is linked to evidence asset and public URL.
6. Assessment/report layers propagate evidence path to final hazards and report payload.
7. Report UI renders image when URL exists (falls back to base64 snapshots when available).

## Storage Abstraction and GCS Mode

- Current adapter: `LocalStorageAdapter` in `server/src/storage/storageAdapter.ts`.
- Production adapter: `GcsStorageAdapter` in `server/src/storage/gcsStorageAdapter.ts`.
- Provider selected by `STORAGE_PROVIDER` env (`local` or `gcs`).
- Contract separates storage write + evidence URL resolution from orchestration/assessment logic.
- In GCS mode:
  - objects stored under deterministic evidence keys
  - report/evidence fetch resolves signed URLs dynamically (`resolveEvidenceUrl`)
  - DB stores stable storage keys rather than ephemeral signed links
- Lifecycle readiness:
  - object naming and provider metadata support future bucket lifecycle policies without schema changes.

## Session and Report History Flow

- `GET /api/sessions` returns authenticated user session history with status, timestamps, risk metadata, and report availability.
- `GET /api/reports` returns authenticated user report summaries for dashboard/history UI.
- `GET /api/sessions/:id` and `GET /api/sessions/:id/report` enforce strict ownership.
- Frontend `History` page provides empty states + quick navigation to historical reports.

## Module Responsibilities

- `server/src/realtime/*`: Gemini relay + room state machine + session orchestration.
- `server/src/assessment/*`: extraction, deterministic risk rules, dedupe/scoring, recommendation generation.
- `server/src/reporting/*`: report payload build + persistence snapshot.
- `server/src/auth/*`: email auth service, sender abstraction, middleware/session enforcement.
- `server/src/auth/rateLimit.ts`: limiter interfaces + local provider.
- `server/src/auth/sharedAuthRateLimiter.ts`: centralized limiter orchestration and fallback behavior.
- `server/src/auth/upstashRateLimitProvider.ts`: Upstash-backed distributed limiter.
- `server/src/auth/authCleanup.ts`: token/session cleanup entrypoint.
- `server/src/auth/emailProviders/resendSender.ts`: production email provider adapter.
- `server/src/scripts/runCleanup.ts`: scheduler/CLI cleanup runner.
- `server/src/data/inMemoryDatabase.ts`: Postgres-backed repository methods.
- `server/src/storage/*`: local + GCS evidence adapters behind one interface.
- `server/src/db/prisma.ts` + `server/prisma/*`: Neon/Postgres schema and client.

## Cloud Scheduler Setup

1. Deploy server with `AUTH_MAINTENANCE_KEY` set.
2. Create a Cloud Scheduler HTTP job targeting:
   - `POST https://<your-domain>/api/maintenance/auth-cleanup`
3. Add header:
   - `x-maintenance-key: <AUTH_MAINTENANCE_KEY>`
4. Run every 15-60 minutes depending on traffic profile.
5. Monitor logs for `[AUTH] cleanup start` and `[AUTH] cleanup done`.

## Extension Path (Subsidies and Contractor Matching)

- Add `subsidyEngine` after recommendation generation to enrich each recommendation with local grants/rebates.
- Add `contractorMatchService` after report creation to attach provider matches by fix type and urgency.
- These remain post-assessment enrichments consuming stable `FinalHazard` and `Recommendation` entities.

## Beta Launch Commands and Flow

### Local startup

1. Install deps:
   - `npm install --prefix server`
   - `npm install --prefix client`
2. Start backend:
   - `npm run dev --prefix server`
3. Start frontend:
   - `npm run dev --prefix client`

### Migrations

- Apply migrations locally:
  - `npx prisma migrate dev --prefix server`
- Deploy migrations in deployed environments:
  - `npm run prisma:migrate --prefix server`

### Builds

- Server build:
  - `npm run build --prefix server`
- Client build:
  - `npm run build --prefix client`

### Demo seed data (local only)

- Demo seed is intentionally blocked in production.
- Local command:
  - `ALLOW_DEMO_SEED=true npm run seed:demo --prefix server`

### Beta testing flow

1. Apply latest DB migrations.
2. (Optional) seed demo revenue data locally.
3. Run server and client builds.
4. Execute checklist in `BETA_QA.md`.
5. Verify auth-protected admin endpoints from an authenticated session.
6. Export CSV and verify lead ops columns + values.
