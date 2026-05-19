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

## ~~TODO-2: Rename `inMemoryDatabase.ts` to `repository.ts`~~

**Fixed by feat/hardening-and-revenue-layer, 2026-04-20.** File renamed to `server/src/data/repository.ts`, all imports updated.

---

## ~~TODO-3: Idempotent report persistence (`persistReportPayload`)~~

**Fixed by feat/hardening-and-revenue-layer, 2026-04-20.** Unique constraint added via migration `20260414000000_report_snapshot_unique_constraint`. `persistReportPayload` updated to upsert by `sessionId`.

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

**Progress (2026-04-20):** ContractorScope lead capture form + `/api/leads/contractor` endpoint are now wired. PremiumSection subsidy eligibility checker and OT/3D links are live. ShoppingList component built. Affiliate links still need to be added to ShoppingList products.

**Effort:** S remaining (affiliate links only) | **Priority:** P1 | **Depends on:** Hardening pass ships first.

---

## TODO-6: Shareable report + family sharing loop

**What:** After a report is generated, let the user share it via a link. Non-owners can view the report without logging in (or with a lightweight invite flow). Add pre-written share text for family forwarding.

**Why:** The adult child who does the walkthrough often wants their siblings to see the report. The sibling who receives it is the next user. Turns one assessment into a family event with a built-in acquisition loop.

**Pros:** Viral coefficient — one assessment potentially generates 2-4 new users. Report quality already earns sharing.

**Cons:** Requires auth changes (read-only report access for non-owners). Shareable tokens need expiry logic.

**Context:** Approach C from the /office-hours design doc (2026-04-19). The report endpoint at `GET /api/sessions/:id/report` is currently auth-gated. A shareable token approach would add a `/api/reports/shared/:token` endpoint. See `/plan-ceo-review` CEO plan at `~/.gstack/projects/HFE/ceo-plans/2026-04-19-revenue-hardening.md`.

**Effort:** M (human: 3-4 days / CC: ~2 hrs) | **Priority:** P2 | **Depends on:** Revenue layer (TODO-5) ships first.
