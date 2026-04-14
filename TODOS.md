# HFE TODOS

Items deferred from the CEO/hardening review (2026-04-13).
Each item has a rationale, effort estimate, and priority.

---

## TODO-1: Migrate to actual Gemini Live WebSocket API

**What:** Replace `GeminiLiveClient.sendTurn` (currently `generateContentStream` HTTP) with the Gemini Live bidirectional WebSocket API (`this.ai.live.connect()`).

**Why:** Current implementation sends a new HTTP request per user turn, with full conversation history as payload. This is not "live" in any meaningful sense. True Live API enables persistent streaming, native video stream support, and much lower turn latency.

**Pros:** Unlocks the real-time UX the product promises. Eliminates per-turn HTTP overhead. Native video stream avoids base64 encoding.

**Cons:** Significant rearchitecture of `GeminiLiveClient` and `SessionOrchestrator`. Gemini Live API has different error semantics and may require quota changes.

**Context:** `server/src/realtime/geminiLiveClient.ts` currently uses `@google/genai` `models.generateContentStream`. The Live API uses a different connection pattern. History/image pruning fix (in current hardening pass) helps with the HTTP approach but is a workaround, not a solution.

**Effort:** L (human: 1 week / CC: 2-3 hrs) | **Priority:** P1 | **Depends on:** Hardening pass ships first.

---

## TODO-2: Rename `inMemoryDatabase.ts` to `repository.ts`

**What:** Rename `server/src/data/inMemoryDatabase.ts` to `repository.ts` (or `db.ts`) and update all imports.

**Why:** The file is fully Postgres-backed via Prisma. The name is actively misleading — any new engineer will spend time questioning whether there's a real in-memory layer in the code path.

**Pros:** Reduces onboarding confusion. Makes intent clear.

**Cons:** Churn — every file that imports it needs updating (~10 files).

**Context:** Grep `from "../data/inMemoryDatabase"` to find all callers.

**Effort:** S (human: 30 min / CC: 5 min) | **Priority:** P3 | **Depends on:** None.

---

## TODO-3: Idempotent report persistence (`persistReportPayload`)

**What:** Change `persistReportPayload` to upsert by `sessionId` rather than insert. Add a unique constraint on `ReportSnapshot.sessionId`.

**Why:** Two code paths can write a report for the same session: WS `request_report` and REST `POST /api/sessions/:id/finalize`. Frontend uses only WS, but the REST endpoint is live and callable. Concurrent or duplicate calls produce duplicate report rows.

**Pros:** Closes a latent data integrity bug. Makes the endpoint idempotent (safe to retry).

**Cons:** Small — Prisma upsert + schema migration.

**Context:** `server/src/reporting/reportBuilder.ts#persistReportPayload`. Prisma schema: `ReportSnapshot` model.

**Effort:** S (human: 30 min / CC: 10 min) | **Priority:** P2 | **Depends on:** Hardening pass ships first.

---

## TODO-4: Pagination for session and report history endpoints

**What:** Add limit/cursor pagination to `GET /api/sessions` and `GET /api/reports`.

**Why:** Both endpoints return all records for the user. Fine at MVP scale (< 10 sessions), slow and memory-heavy at 100+.

**Pros:** Predictable response size. Standard API practice.

**Cons:** Requires frontend History page updates to load more.

**Context:** `server/src/index.ts` — `GET /api/sessions` calls `db.listSessionsForUser(req.authUser!.id)` with no pagination. `server/src/data/inMemoryDatabase.ts` repository methods need limit/offset or cursor params.

**Effort:** M (human: 1 day / CC: 30 min) | **Priority:** P3 | **Depends on:** None.

---

## TODO-5: Wire premium services for revenue

**What:** Connect the premium section's CTAs to real revenue paths. Priority order:
1. Amazon affiliate links in `ShoppingList.tsx` — product map already exists, each product just needs an affiliate link
2. Lead capture form in `ContractorScope.tsx` — brief already generated, just needs email submission + CRM/notification
3. Subsidy eligibility finder — call a grants API (NCOA, Benefits.gov) based on user age, income, state

**Why:** Premium section is 100% cosmetic today. No conversion path, no revenue. The infrastructure (hazard → product map, hazard → trade map) is already built.

**Pros:** First revenue. Validates willingness to pay.

**Cons:** Affiliate program approval takes time. Contractor lead gen needs a contractor supply side.

**Context:** `client/src/components/PremiumSection.tsx`, `ShoppingList.tsx`, `ContractorScope.tsx`. Architecture doc has "Extension Path" section describing subsidyEngine and contractorMatchService as post-assessment enrichments.

**Effort:** M (human: 1 week / CC: 1 hr for affiliate links) | **Priority:** P1 | **Depends on:** Hardening pass ships first.
