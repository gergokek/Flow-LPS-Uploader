# M-Flow TEST bookmark — PATCH BATCH

Date: 2026-11-26
Status: **MANUAL TEST PAUSED** (explicit user instruction)
Mode: **PATCH BATCH — multiple cohesive changes, automated checks only**
Applies to: Flow-LPS TEST branch `feat/msal-browser-integration` and Flow-LPS-Uploader TEST branch `feat/test-single-draft-session`.

## Working agreement
- Do not ask the user for step-by-step manual testing in the middle of development.
- Develop and verify logically connected components in batches; run automated regression/integration/browser tests and record actionable failures.
- Preserve the historical TEST board `5107075373`, Approved V1/V2, legacy SharePoint V1/V2 receipts, and production `main` branches.
- No real Monday board mutations, V3 session allocation, Approved/Sync writes, or destructive migration without explicit later consent.
- New project storage starts at Versions/V0001; this TEST board V1/V2 remain the legacy exception.
- Resolve the current verified state, not a hardcoded V2-to-V3 transition. Unknown, incomplete or uncertain states fail closed.

## Manual testing resumes at one patch-batch acceptance point
Only propose one integrated user checklist **after**: (1) dynamic current-state detection is wired, (2) active-session resume and the safe next-version start are wired with explicit confirmation, (3) versioned DRAFT save and readback are wired, (4) Monday ↔ Uploader TEST deployment and automated cross-repo suite pass. Mark each as verified, blocked or incomplete; never claim live-test success from synthetic tests.

Current baseline: Uploader TEST deployment run 45798802181 success, Monday TEST run 45799019995 success; a read-only planning-inspect button is released. Actual next-version creation remains unexposed to the user.

## Patch batch #1 — automated development checkpoint (2026-11-26)
Completed in source (not yet a user-approved end-to-end V3 session):
- Generic state-selected planning action gate; separate Monday/Uploader consent inputs and full state reinspection. Uncertain creation never automatically retries.
- New-project V0-only to V1 selection and V1/V2/V3+ state resolution tests.
- V3 create-only store receives the authenticated Monday snapshot during the final preflight.
- Frozen V3 and any unverified Approved/Sync artifact fail closed before further DRAFT editing.
- V3 immutable editor handoff verifies SHA-256, source, session, revision and versioned file path.
- Origin/nonce-bound Uploader planning-inspect RPC whitelist fixed and regression-tested.
- Version-bound draft bridge: V3 edits cannot be sent to V1/V2 sessions; V1 approval RPC cannot approve a V3 draft.
- Monday editor remembers the verified selected planVersion rather than labeling everything V1.
- Uploader unit/build CI succeeded on patch source at run 45800509430.
- Monday/Uploader integration CI pins Uploader patch commit baf736461ed8dd1be70bf4fa9a733aa28aebf568. Workflow run 45800591964 completed SUCCESS: paired Monday + pinned Uploader regression, TEST-only build and synthetic Chromium browser checks passed.

Still NOT done: public execution RPC and dual-confirmation UX, complete integration of V3 session activation into the Monday editor autosave queue, generic Approved/Sync for V3+, and a one-shot user acceptance checklist. Do not interpret automated synthetic proof as an actual user V3 session. Continue PATCH BATCH mode and request NO manual test yet.

## PATCH BATCH #2 — state-selected start / resume / save (2026-11-26)

Source integration completed:
- Monday version-state discovery now offers either **Resume verified active V3 DRAFT** or **Start verified next V3.0**. No "V2 -> V3" version transition is used for decision; the V3 implementation is deliberately the only enabled successor executor until V4+ evidence verifiers exist.
- Starting V3.0 requires explicit Monday confirmation **and a separate in-page Uploader confirmation**, plus fresh full-board fingerprint, immutable V2 completion SHA, current Microsoft identity, re-inspected SharePoint version inventory, and matching verification on both sides. No Monday task write.
- The origin/nonce/Approved-V1-bound browser protocol now supports planning-begin and planning-open. The Uploader checks the selected DRAFT; Monday independently checks SHA-256, SharePoint path, session ID and version before opening the editor.
- Reopening active V3 does not allocate a second session. Any further DRAFT edit uses the immutable queue, strict expected-parent SHA and Graph content/eTag readback. Existing V1 approval controls are disabled/hidden for V3.
- The current Uploader source includes a single-package synthetic integration test (verified start -> V3.0 -> V3.1 -> reopen, no duplicate writes), dual-consent tests, origin binding tests, stale-version rejection and prior V2 regressions.
- Fixed V3 persistence preserving boardId in saved revisions, display of actual Vn, and V3 source receipt pinning.
- Current Uploader CI: 45802716758 SUCCESS. Paired Monday–Uploader workflow pins Uploader commit 7c9f1e609e46c9acdf656d2392053253cbedad6e; integrated run 45802832465.

Manual testing remains PAUSED. No real V3 files were created by development or CI, and no live Monday task was mutated.

Open next: generalized V3+ Approved and Sync engines, partial/uncertain version-start recovery with explicit user reconciliation, cross-version V4+ predecessor proof, final one-shot patch-batch acceptance. Actual live SharePoint + Monday TEST end-to-end behavior remains unverified until the eventual user acceptance.
