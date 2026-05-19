# HFE Beta QA Checklist

Use this checklist before each beta rollout. Record pass/fail and notes for each item.

## Launch Severity

- **P0 Safety/Security:** Blocks launch. Includes admin data exposure, cross-user report/evidence access, missing privacy consent, missing safety disclaimers, broken auth, or unhandled camera/Gemini failures that leave users in an active assessment state.
- **P1 Core Flow:** Blocks beta cohort expansion. Includes failed login, onboarding, assessment, report generation, contractor lead submission, or mobile dead ends.
- **P2 Polish:** Does not block a small controlled beta, but must be tracked. Includes copy polish, minor spacing issues, table ergonomics, and non-critical empty states.

## 1) Account and Auth

- [ ] Register/login request works with valid email.
- [ ] Verification code login succeeds and sets session cookie.
- [ ] Invalid/expired verification code shows user-safe error.
- [ ] Logout clears session and protected routes require re-login.
- [ ] Auth rate limiting triggers with repeated rapid attempts.
- [ ] Production cookie is `httpOnly`, `secure`, `SameSite=Lax`, and logout clears it.
- [ ] Mutating authenticated REST requests without `x-hfe-csrf: same-origin` are rejected.

## 2) Assessment Flow

- [ ] Onboarding captures profile and starts assessment.
- [ ] Websocket connection succeeds after login.
- [ ] Privacy consent is visible before camera/live assessment starts.
- [ ] Camera permission denied path shows recovery instructions and returns to idle.
- [ ] Gemini/websocket failure state shows recovery instructions and does not mark assessment active.
- [ ] Room-by-room flow progresses and captures observations.
- [ ] Session can resume after reconnect.
- [ ] Finalize assessment returns report-ready payload.
- [ ] Incomplete assessment finalization prompts for confirmation or returns `INCOMPLETE_ASSESSMENT`.

## 3) Report Generation

- [ ] Report page loads from server `sessionId`.
- [ ] Fallback to local report works if remote fetch fails.
- [ ] Risk score, findings, and recommendations render correctly.
- [ ] Report disclaimers are visible.
- [ ] Report copy presents AI-assisted home safety guidance, not diagnosis, emergency advice, medical advice, or guaranteed fall prevention.
- [ ] High-risk findings advise consulting a qualified professional.

## 4) Shopping List and Affiliate Clicks

- [ ] Shopping list appears for relevant hazards.
- [ ] "Buy on Amazon" opens external link.
- [ ] Affiliate click tracking endpoint returns success.
- [ ] Duplicate click suppression window behaves as expected.

## 5) Contractor Lead Form

- [ ] Form opens from report and premium CTA.
- [ ] Required field validation works (name/email/zip/contact).
- [ ] Optional fields work: urgency and budget.
- [ ] Submit success state displays confirmation.
- [ ] Disclaimer text on contact sharing is visible.

## 6) Admin Revenue Dashboard

- [ ] Dashboard is denied for a normal authenticated user.
- [ ] Dashboard loads for an admin user from `ADMIN_EMAILS`.
- [ ] Refresh button updates metrics.
- [ ] Last updated timestamp changes on refresh.
- [ ] Empty states render when no data exists.
- [ ] Error state is user-friendly on API failure.

## 7) CSV Export

- [ ] CSV endpoint returns 403 for normal authenticated users.
- [ ] CSV endpoint downloads for admins.
- [ ] CSV headers include lead ops columns:
  - `status`, `projectUrgency`, `estimatedBudget`, `internalNotes`
- [ ] CSV rows match dashboard lead data.

## 8) Lead Status and Notes Operations

- [ ] Lead status dropdown updates and persists.
- [ ] Internal notes editing updates and persists.
- [ ] Lead delete action removes row and refreshes dashboard.
- [ ] Normal authenticated users cannot update/delete leads through API calls.
- [ ] Invalid status update request returns 400.

## 9) Mobile Responsiveness

- [ ] Report page readable on mobile widths.
- [ ] Contractor form is usable on mobile.
- [ ] Revenue dashboard table remains usable (scroll/stack behavior).

## 10) Privacy and Disclaimers

- [ ] Report disclaimer text is present.
- [ ] Contractor form privacy sharing disclaimer is present.
- [ ] Admin-only data does not appear on user report page.
- [ ] Evidence image URLs are owner-scoped and cannot be accessed by another authenticated user.
- [ ] Evidence storage and deletion request path are documented for beta users.

## 11) Monitoring and Operations

- [ ] `/health` returns ok when the server and database are available.
- [ ] `/ready` passes only when DB, auth secret, Gemini, storage, allowed origin, and Sentry production configuration are ready.
- [ ] Server Sentry event appears from staging without PII/image payloads.
- [ ] Structured logs appear for auth, websocket lifecycle, Gemini failure, report finalization, evidence storage, and contractor lead submission.
- [ ] Deploy includes `GEMINI_LIVE_MODEL`, `ADMIN_EMAILS`, and `SENTRY_DSN`.
- [ ] Rollback, Gemini outage, storage outage, and deletion request runbooks are current.

## QA Sign-off

- Date:
- Environment:
- Tester:
- Build commit:
- Result: Pass / Fail
- Notes:
