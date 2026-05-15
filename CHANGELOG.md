# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-15

### Added
- **Revenue layer**: affiliate product links, referral start page (`/start/:referralCode`), admin revenue dashboard (`/admin/revenue`), analytics event tracking, Prisma migrations for affiliate + analytics tables
- **Waitlist / beta access**: `/api/beta/waitlist` endpoint, beta QA runbook (`BETA_QA.md`), public beta runbook (`PUBLIC_BETA_RUNBOOK.md`)
- **Pagination**: cursor-based pagination for `/api/sessions` and `/api/reports`; History page loads more
- **Live assessment page**: `/assessment/live` route with `LiveAssessment.tsx`
- **Report deep-link**: `/report/:sessionId` path param (replaces query string); both `/report` and `/report/:sessionId` registered
- **Report component extraction**: `ReportHeader` and `ReportTabBar` components (`client/src/components/report/`); tab bar scrolls horizontally on mobile
- **Report opening narrative**: empathetic summary block before the tab view, generated from session observations
- **Mobile hamburger nav**: responsive `Header` with animated slide-down menu, closes on route change
- **Agency counterweight block**: motivational CTA in the stats section on the Home page
- **ScoreRing component**: extracted animated ring from Report into `client/src/components/ScoreRing.tsx`
- **Skeleton loading states**: shimmer skeletons for History page
- **Route module decomposition**: 2317-line `server/src/index.ts` split into `routes/sessions`, `routes/reports`, `routes/admin`, `routes/auth`, `routes/public`
- **Security hardening**: Helmet headers, timing-safe maintenance key check, cached admin set, non-blocking `lastSeenAt`, zip validation in contractor search
- **DB performance**: missing indexes added, select fields narrowed to reduce query cost
- **Assessment state machine spec**: `WORKFLOW-primary-assessment.md` documents the 9-state machine
- **AGENTS.md**: AI agent architecture documentation
- **Evidence storage**: Google Cloud Storage adapter (`gcsStorageAdapter.ts`) for production evidence photos
- **10s fetch timeout**: `apiFetch` wrapper enforces 10-second timeout to prevent infinite loading states
- **Upstash rate limiting**: `upstashRateLimitProvider.ts` for auth endpoints

### Changed
- **HazardCard copy**: clinical labels → conversational ("What we noticed", "Why this matters", "What to do", "Risk without action")
- **Score label**: "Unsafe — Act Now" → "Action Needed — Let's Fix This"
- **Disclaimer**: rewritten to warm human voice
- **Login subtitle**: "Email-based login…" → "Sign in to access your saved reports and share your family's safety plan."
- **Fall history empathy**: 3+ falls acknowledgment changed from red alert to amber `HeartHandshake` message
- **Bathroom hazard copy**: rewritten to be plain and actionable instead of alarming
- **`btn-secondary`**: dark slate → light warm (`bg-white border-warm-200`)
- **Scrollbar**: dark slate track → warm neutrals
- **Evidence dropdown labels**: "TODO" placeholders replaced with real labels
- **Nested HazardCard**: `bg-white` → `bg-warm-50` to fix depth inversion
- **AI status label**: "AI-generated prevention support; not yet reviewed by a care coordinator." → shorter, cleaner copy
- **`inMemoryDatabase.ts`** → renamed `repository.ts` (all imports updated) *(TODO-2 done)*
- **`persistReportPayload`**: now upserts by `sessionId` with unique constraint migration *(TODO-3 done)*

### Fixed
- **ISSUE-006**: `apiFetch` timeout prevents infinite "Sending…" spinner
- **ISSUE-005 / 005b**: Guard NaN in report stats and contractor cost display when transform fields absent
- **ISSUE-004**: Annotate completed TODOs
- **ISSUE-003**: Suppress React Router v7 future flag warnings
- **WS handler leak**: cleanup on disconnect
- **ID collision**: session ID deduplication fix
- **History links**: correct `/report/:sessionId` navigation
- **N+1 queries**: eliminated in report loading paths
- **URL param validation**: validate sessionId before DB query
- **Finalize race conditions**: documented and guarded in `sessionOrchestrator`
- **Magic constant**: named constant for session timeout
- **Clipboard error handling**: graceful fallback when clipboard API unavailable
- **WCAG 2.2 AA**: form labels, button accessible names, icon aria-hidden, heading hierarchy, live regions

### Infrastructure
- `Dockerfile` and `docker-compose.yml` updated for production build
- `deploy.sh` updated
- `.env.example` updated with all new required variables
- Prisma schema updated with revenue, analytics, waitlist tables
- New migrations: `add_revenue_layer`, `add_analytics_event`

---

## [1.0.0] - 2026-04-01

Initial release — MVP with Gemini Live video assessment, magic-link auth, hazard extraction, report generation, and GCS evidence storage.
