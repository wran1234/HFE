# HFE Primary Assessment Workflow Spec

**Branch:** `feat/hardening-and-revenue-layer`
**Generated:** 2026-05-14

---

## 1. Complete State Map — InspectionSession Status

| Status | Set By | Transitions To | Notes |
|---|---|---|---|
| `active` | `db.createSession()` (always) | `finalizing`, `completed` | Default on creation; live and photo paths both start here |
| `in_progress` | Findable via `findActiveSessionForUser` but never written by the app | `active` (search matches) | Effectively an alias in the DB query; no code explicitly sets this value |
| `finalizing` | REST `POST /:id/finalize` (now, after fix); `SessionOrchestrator.finalizeSession()` | `completed` | Set immediately before `runAssessmentEngine()`; concurrent finalize calls are now rejected with `ALREADY_FINALIZED` |
| `completed` | REST `POST /:id/finalize`; `SessionOrchestrator.finalizeSession()` | terminal | Set after `db.updateSession()`; report persisted after this |

**State machine for InspectionStateMachine (in-memory, live path only):**

```
constructor → completionScore=0, currentRoom=first room
captureView()     → adds to capturedViews, recomputes completionScore
autoCaptureNextMissingView() → delegates to captureView()
canAdvanceRoom()  → coverage >= 60% or skipped
advanceRoom()     → pushes to roomsCompleted, moves currentRoom
markRoomSkipped() → sets skipped=true, calls advanceRoom()
isComplete()      → all rooms in roomsCompleted
canFinalizeReport() → completionScore >= 60 (orchestrator wrapper)
```

---

## 2. Step-by-Step Workflow Tree

### 2A. Onboarding / Consent Capture (Onboarding.tsx)

```
User navigates to /onboarding
  → 6-step wizard (Steps 1–6)
    Step 1: assessmentFor (self/family) — required
    Step 2: age + livesAlone — required
    Step 3: mobilityLevel + fallHistoryCount — required
    Step 4: visionImpaired + medicationCount — required
    Step 5: houseType — required (determines roomSequence)
    Step 6: seniorProfile extras + consent checkboxes — required
      consentAccepted = all 4 acknowledgement checkboxes checked
      recordingPermissionConfirmed = checkbox 0 checked
    isStepValid() gates Next/Start button at each step

  On final "Start Assessment" click (handleNext at step 6):
    → saveProfile(complete) — writes to localStorage
    → if referral: updateReferralStatus(code, "consent_completed") [fire-and-forget, errors swallowed]
    → navigate("/assessment")
```

**Consent NOT given path:**
- `isStepValid()` at step 6 returns false if `!consent.consentAccepted || !consent.recordingPermissionConfirmed`
- "Start Assessment" button is disabled; user cannot proceed
- No session is created; no DB write occurs

**Referral context:**
- `loadReferralContext()` reads localStorage key set by `/start/:code` (ReferralStart.tsx)
- Pre-populates `assessmentFor="family"`, `subjectName`, `pilotCohortId`, `referralId`, `referralCode`

---

### 2B. Photo Assessment Path (Assessment.tsx)

```
User is at /assessment
  → profile loaded from localStorage (if missing → redirect /onboarding)
  → roomSequence built from profile.houseType (buildRoomSequence)
  → Privacy consent re-confirmed via checkbox (pre-filled from profile)

  First photo upload (handlePhoto):
    → ensureSession() — lazy session creation
        POST /api/sessions → db.createSession() → status="active"
        Room scans created: Promise.all(REQUIRED_ROOM_ORDER.map(getOrCreateRoomScan))
        seniorProfile upserted if present
      → returns sessionId; stored in component state

    → fileToResizedBase64(file) — client-side resize to 1100px, JPEG 78%
    → POST /api/sessions/:id/photo-evidence
        storage.saveEvidence() → GCS or local disk
        db.createEvidenceAsset()
        db.getOrCreateRoomScan(), update capturedViews/missingViews/coverageStatus
        analyzePhotoForHazards() → Gemini vision → AI observations
        manuallyFlaggedObservations from selectedConcerns (deduped vs AI)
        db.createObservation() x N
      → response: { photo.publicUrl, roomScan, observations }
    → uploadedKeys[key] = publicUrl (shown as "Photo saved")

  Skip room:
    → ensureSession()
    → POST /api/sessions/:id/rooms/:roomType/progress
        coverageStatus="skipped", capturedViews=[], missingViews=all
    → advance to next room in UI

  Generate Report (generateReport):
    → ensureSession()
    → allowIncomplete = uploadedCount < ceil(totalPrompts * 0.6)
    → POST /api/sessions/:id/finalize
    → toAssessmentReport(response.report, profile)
    → saveReport(report) — localStorage
    → navigate("/report?sessionId=...")
```

---

### 2C. Live Assessment Path (LiveAssessment.tsx + VideoAssistant + WS)

```
User navigates to /assessment/live
  → profile loaded from localStorage (if missing → redirect /onboarding)
  → VideoAssistant rendered with profile

  WebSocket connect:
    → HFEWebSocketClient.connect() → new WebSocket(wss://host/ws)
    → Server: auth via cookie, findActiveSessionForUser()
      If active session exists → SessionOrchestrator.resume() → sends "session_resumed"
      Else → sends "connected"

  start_session message:
    → Server: SessionOrchestrator.create()
        db.createSession() → status="active"
        db.getOrCreateRoomScan() for each room
        db.upsertSeniorProfile() if present
      → orchestrator.start() → Gemini greeting + "session_started" msg
    → Client: wsClient resolves connect() promise on "session_started"

  During session:
    video_frame → orchestrator.handleVideoFrame()
        every 3rd frame: autoCaptureNextMissingView(), syncRoomScan(), "inspection_state"
    text_message / audio_chunk → orchestrator.sendUserText()
        Gemini turn → captureHazards() → db.createObservation()
        handleRoomGuidance() → advance room if ready
        handleFollowUps() → "follow_up_prompt" + "inspection_state"
    
  request_report:
    → canFinalizeReport() check: completionScore >= 60 or allowIncomplete
    → orchestrator.finalizeSession()
        Status guard: rejects if already finalizing/completed
        status="finalizing" → db.updateSession()
        runAssessmentEngine() → db.listObservations, dedupeObservations, applyRiskRules
        db.saveAssessment() [transaction: delete+recreate finalHazards+recommendations]
        status="completed" → db.updateSession()
        referral "assessment_completed" [now with warn-on-fail]
        buildReportPayload() → independence plan, risk score, family dashboard
        persistReportPayload() [try/catch → warn if fails]
        referral "report_generated" [now with warn-on-fail]
      → "report_ready" → client saveReport() → navigate("/report")

  end_session / ws.close:
    → orchestrators.delete(ws), userSessionMap.delete(userId)
    → gemini.close()
```

---

### 2D. Report Viewing (Report.tsx)

```
/report?sessionId=...
  → loadReport() from localStorage
  → GET /api/sessions/:id/report (if sessionId param present)
  → Renders hazards, recommendations, independence plan, shopping list
```

---

### 2E. Referral Sub-Workflow

```
Partner generates referral → db.createPartnerReferral() → referralCode (10-char hex)
  Referral link: /start/:referralCode

User clicks link (ReferralStart.tsx):
  → GET /api/public/referral/:code → partner/cohort name
  → localStorage.setItem("hfe_referral", JSON.stringify({referralId, referralCode, ...}))
  → navigate("/onboarding")
  → updateReferralStatus(code, "opened") [fire-and-forget]

Onboarding completes:
  → updateReferralStatus(code, "consent_completed") [fire-and-forget]
  → referralId stored in profile → sent to POST /api/sessions at session creation
  → referralId stored in InspectionSession row

Finalize:
  → db.updatePartnerReferralStatus(referralId, "assessment_completed")
  → db.updatePartnerReferralStatus(referralId, "report_generated")

Status funnel:
  created → opened → started_onboarding → consent_completed
    → assessment_completed → report_generated
```

---

## 3. Observable States at Each Step

| Step | User Sees | DB State | Key Logs |
|---|---|---|---|
| Onboarding step 1-5 | Wizard with disabled Next | Nothing | Nothing |
| Onboarding step 6, consent incomplete | "Start Assessment" button disabled | Nothing | Nothing |
| Onboarding complete | Navigates to /assessment | localStorage: profile | (referral PATCH fires) |
| First photo upload | Spinner → "Photo saved" | Session row status=active; RoomScan row; EvidenceAsset; N HazardObservations | None |
| Session creation failure | Error banner (setError) | Nothing (ensureSession threw) | None |
| Room skipped | Next room shown | RoomScan coverageStatus=skipped | None |
| Finalize initiated | "Generating report..." button | Session status=finalizing | None |
| Finalize complete | Navigates to /report | Session status=completed; FinalHazards; Recommendations; ReportSnapshot | [FINALIZE] warn lines if referral fails |
| Report persist failure | Report still shown (local); History won't show it | Session=completed; no ReportSnapshot | console.error [FINALIZE] |
| WS drop mid-session | Error toast: "Disconnected from server" | Session status=active (orphaned in DB) | [WS] close handler log |

---

## 4. Gaps Found

### GAP-01: `status="in_progress"` is never written
`findActiveSessionForUser()` queries for `status IN ("active", "in_progress")`, but no code path ever sets `status="in_progress"`. This status is a dead enum value. **No data loss, but schema/query confusion.**

### GAP-02: REST finalize had no atomicity guard (FIXED)
Before this fix, `POST /:id/finalize` had no check for `session.status === "finalizing"`. Two simultaneous requests could both read `status="active"`, both pass all guards, and both call `runAssessmentEngine()` + `db.saveAssessment()` (which uses a delete+recreate transaction), creating a race where the second write clears the first's hazards. **Fixed:** status is now set to `"finalizing"` and persisted before `runAssessmentEngine()` is called, and the route now rejects if status is already `"finalizing"` or `"completed"`.

### GAP-03: `SessionOrchestrator.finalizeSession()` had no re-entrancy guard (FIXED)
The WS `request_report` handler checks `canFinalizeReport()` before calling `finalizeSession()`, but a second concurrent `request_report` message arriving before the first completes could bypass this because `canFinalizeReport()` only checks `completionScore`, not `status`. **Fixed:** `finalizeSession()` now checks `this.session.status` at entry and throws `ALREADY_FINALIZED` if already in-flight.

### GAP-04: Referral status update failures were silent (FIXED)
In both the REST finalize route and `SessionOrchestrator.finalizeSession()`, `updatePartnerReferralStatus("assessment_completed")` was called without any error handling. A DB failure would propagate and abort the entire finalize, leaving the session in `"completed"` state with no report. **Fixed:** both calls now use `.catch()` with `console.warn()` so they degrade gracefully.

### GAP-05: `ensureSession()` promise leak on concurrent photo uploads
`sessionPromiseRef.current` is cleared in `.finally()` after the promise resolves. If two photo uploads fire simultaneously before any session exists, both calls enter `ensureSession()`, the first sets `sessionPromiseRef.current`, and the second returns the same promise. This is intentional deduplication. However, if the promise rejects, `sessionPromiseRef.current = null` is set in `.finally()`, and the next call will re-attempt. The `sessionId` state is never set on failure. **This is correct behavior** but the error surface is the generic `setError()` in the calling `catch` block — the user sees the error message but the session is never created, leaving no orphaned DB rows (correct).

### GAP-06: Skip room uses ensureSession() — session created on skip
If a user clicks "Skip this room" as their first action (before any upload), `skipRoom()` calls `ensureSession()`, which creates a DB session. If the user then abandons the page, an orphaned session row with `status="active"` remains indefinitely. There is no TTL, cleanup job, or abandonment detection for these sessions.

### GAP-07: Photo assessment finalize route has no `"finalizing"` DB intermediate state visible to the progress UI
The REST finalize route sets `status="finalizing"`, persists it, then runs `runAssessmentEngine()`. However, the client does not poll or subscribe for status; `setFinalizing(true)` is purely local React state. If the HTTP request times out (e.g., >10s AI processing), the client shows an error, but the DB may still be in `status="finalizing"`. The next `GET /:id` call would return `status="finalizing"` but no UI handles this case — the user would see a stale "active" session if they return.

### GAP-08: WS mid-session drop leaves session `status="active"` forever
When the WebSocket closes (`ws.on("close")`), `orchestrator.close()` (Gemini close) is called but the session is not transitioned to a terminal state in the DB. `db.findActiveSessionForUser()` will find it on reconnect and resume, which is intentional. However, if the user never reconnects (e.g., switches to photo mode, completes a report via REST), the `status="active"` session row remains. No cleanup path exists.

---

## 5. Test Cases (One Per Branch)

| TC | Branch | Setup | Action | Expected Outcome |
|---|---|---|---|---|
| TC-01 | Happy path: photo assessment | User completes onboarding; uploads 1 photo per room | Click "Generate prevention report" | `POST /finalize` returns 200; session=completed; report in localStorage; navigate to /report |
| TC-02 | Consent not given | User reaches step 6, does not check all 4 acknowledgements | Attempt to click "Start Assessment" | Button is disabled; no navigation; no DB write |
| TC-03 | Session creation failure | `POST /api/sessions` returns 500 | Upload first photo | Error banner shown; uploadedKeys unchanged; no session in DB |
| TC-04 | Mid-session WebSocket drop | User in live assessment; network disconnects | WS `onclose` fires | Client shows "Disconnected from server" error; session stays `status="active"` in DB; on reconnect, `session_resumed` fires |
| TC-05 | Photo upload timeout (>10s) | Upload slow; `apiFetch` 10s timeout | Photo upload hits timeout | Error banner: "Request timed out"; `busyKey` cleared; uploadedKeys not updated; session still active |
| TC-06 | Finalize with incomplete rooms (REST) | Session has 0% room coverage | `POST /finalize` without `allowIncomplete: true` | 409 INCOMPLETE_ASSESSMENT; session status unchanged |
| TC-07 | Finalize with incomplete rooms — allowIncomplete | Session has 0% coverage | `POST /finalize` with `allowIncomplete: true` | 200; report generated with 0 hazards; session=completed |
| TC-08 | Concurrent finalize calls | Two simultaneous `POST /:id/finalize` requests | Fire both at ~same time | First succeeds (200); second gets 409 ALREADY_FINALIZED |
| TC-09 | Report persist failure | `db.saveReport()` throws | Normal finalize | console.error logged; response still returns assessment+report JSON; History won't show entry |
| TC-10 | Referral status update failure (assessment_completed) | `updatePartnerReferralStatus` throws for network error | Normal finalize | console.warn logged; finalize continues; report generated; referral row stays at `consent_completed` |
| TC-11 | Referral status update failure (report_generated) | First referral update succeeds; second throws | Normal finalize | console.warn logged; finalize completes; referral stuck at `assessment_completed` |
| TC-12 | Skip room as first action (session creation on skip) | User clicks "Skip this room" before any upload | Session created in DB; user then abandons page | Orphaned session with `status="active"` in DB; no cleanup occurs |
| TC-13 | WS finalize re-entrancy guard | Orchestrator in `finalizeSession()`; second `request_report` arrives before completion | Second WS message | `ALREADY_FINALIZED` error sent; first finalize continues normally |
| TC-14 | canFinalizeReport() client-side vs server-side | completionScore < 60 in live session | Client sends `request_report` without `allowIncomplete` | Server (WS handler): `canFinalizeReport()` returns false → error message; report not generated |
| TC-15 | Referral sub-workflow happy path | User arrives via `/start/:code`; completes onboarding + assessment | Navigate referral link, complete all steps | Referral row progresses through: opened → consent_completed → assessment_completed → report_generated |
