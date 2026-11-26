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

## PATCH BATCH #3 - guarded approval storage (2026-11-26)

- Common read-only V3+ approval contract exists in Monday and Uploader branches, with strict predecessor/DRAFT lineage, SHA/path validation and approved receipt models.
- versioned-graph-files.js now supports V3 approval folder read/list and only create-only freeze, Approved and approval-receipt writes. Sync remains strictly read-only.
- versioned-approval-storage.js (Uploader TEST) adds separately confirmed Monday and Uploader consent, fresh identity/board verification, immutable prefix reconciliation, create-only writes and readback. Ambiguous responses stop the current instance; a new instance rechecks before continuation.
- New tests exercise success, duplicates, uncertain response recovery, stale board, identity changes, unexpected Sync files and denied writes.
- Historical V1/V2 and production main are unchanged. No live Monday bridge, no enabled sync mutation, no TEST deploy of this adapter and no real SharePoint/Monday project writes.
- The first storage-test CI exposed a test-fixture cloning error, fixed in commit 362f92ba364f45a5b000bbac89eca679e40d476b. Verify CI run 45832364819 before marking the package green.
- Manual test pause remains active. Next: verified generic approval read-only bridge, then guarded V3+ per-item journal and full sync verification.

## PATCH BATCH #3 - V3 TEST approval UI checkpoint (2026-11-26)

- Monday: a V3-specific planning panel shows session/revision, a live full Monday-board-checked **local-only** DRAFT change preview, and a before/after field table. V1-specific approval controls remain unavailable on V3.
- Uploader: V3 approval/sync panel reads Session, Drafts, Approved and Sync folder listings after Microsoft login; inventory statuses explicitly NEVER assert approval or sync completion from filenames alone.
- Existing V3 Graph adapter supports approval files but no UI path can yet create an Approved Plan. The versioned approval storage remains unexposed, pending separately verified Monday-Uploader authorization protocol, complete SharePoint lineage evidence and writeback engine.
- Do not confuse the local preview or file inventory with a final authorization, full verified Approved Plan or Monday sync.
- TEST feature branches only. No real board writes, V3 session allocation, Approved/Sync user writes or historical V1/V2 migration. Manual acceptance remains paused.
- New regression tests: Monday tests/versioned-approval-ui-preview.test.mjs; Uploader tests/versioned-approval-status-ui.test.js. Verify newest GitHub CI runs before declaring release successful.
- Next: origin/nonce/session/consent-bound V3 review RPC, verified freeze/approval integration, journaled sync; then a single acceptance test and TEST deployment.

## PATCH BATCH #3 - V3 dual-confirmed approval TEST deployment (2026-11-26)

DONE:
- Monday versioned V3 approval panel compares actual saved DRAFT with independently verified V3 SharePoint source, V2 fully completed predecessor, immutable V3 revision receipts, and fresh full Monday TEST board. It renders the confirmation only after matching receipt/session/revision/generation/board details.
- Uploader has a dedicated nonce/origin-bound V3 approval inspect/approve RPC (not the V1/V2 sync lane), a second visible consent, read-only V3 source inspector, separate approved storage, immutable freeze / Approved Plan / receipt creation, Graph conflict-fail with independent SHA/eTag readback, and fail-closed uncertainty handling.
- V3 Monday WRITE MUTATIONS ARE DISABLED. Only explicit dual-consent SharePoint Approved V3 artifact creation is enabled. V4+ predecessor support remains disabled; existing V1/V2 legacy storage untouched.
- Uploader TEST Pages deployment run 45835504486: SUCCESS, including both source test/build, production root byte-for-byte unchanged and isolated /test/ publication.
- Monday TEST app draft / Board View deployment run 45835512829: SUCCESS, including npm test, locked TEST bundle verification, TEST-only code push, Board View association and release verification.
- Unit and regression CI prior to deployments: Uploader 45835334516 SUCCESS, Monday 45835076430 + 45835064297 + 45835076446 SUCCESS. New V3 origin/nonce/revision/receipt and separate-consent tests included.
- No real user V3 approval / SharePoint project-data write, no real Monday mutation and no live V3 complete-cycle acceptance were performed by development.
- Manual test remains PAUSED by user request. Next PATCH BATCH #3 component: independently verified per-item V3+ Sync write-ahead/result journal, full board readback, terminal closure, successor V4+ proof. Then one integrated user acceptance checklist.

## PATCH BATCH #3 (steps 3-4) - V3 immutable Sync and V4 readiness, TEST (2026-11-26)

- Implemented shared, byte-identical V3 journal contract (`versioned-sync-contract.js` and Monday `src/adapter/versioned-sync-contract.js`): SHA/eTag checked Approved source, task-ordered write-ahead/result receipts, no automatic retry after unknown write, and final V3_SYNC_COMPLETED full-board proof.
- Uploader `versioned-sync-storage.js`: create-only journal, fresh identity/board/Graph proof, explicit Monday+Uploader approval, journal inspection/restart, terminal receipt; `versioned-sync-consent-ui.js`: second in-page consent specifically warning of REAL Monday TEST writes. `versioned-graph-files.js` permits only exact V3 Sync file types/names and fail-on-conflict Graph creates.
- Monday `src/adapter/versioned-full-sync.js`: TEST-only one-item-at-a-time Monday executor with prewrite item/board pinning, single-attempt write, item and full-board readback and result journaling. UI now offers separate read-only review, explicit run and stop at next safe task boundary. Unknown writes require human review, never repeated automatically.
- Independent Approved V3 re-open from complete verified SharePoint journal, no DRAFT editing. `versioned-next-cycle-proof.js` verifies V4 source only after V3 terminal receipt and exact final live board; returns `startEnabled:false`. Actual V4 DRAFT allocation deliberately remains disabled until a separate fully generalized V4 store is implemented.
- Synthetic cross-repo real-executor + real-Uploader-store E2E tests (without external calls): normal sync+V4 proof, restart skips already completed writes, lost Graph result response never duplicates write, denied mutation stops. CI `Flow-LPS` run **45843032713** attempt **2** SUCCESS. Uploader regression/build run **45843260461** SUCCESS. Initial integration failure was fixed by keeping terminal receipt read-only inspectable after completion, without reauthorizing writes.
- TEST-only deployment markers: Uploader `7e175c78569d97a7056f3d7ebee06a007a7fcfdb` (deploy run **45843428407**); Monday `4f5e9cc5c766f2eb5d7bc5d437167014919fba41` (deploy run **45843435714**). Check their final success status before considering TEST released.
- No real user V3 approval, SharePoint project-content mutation, Monday board write or V4 allocation performed by coding/CI/deployment. V3 real run requires active explicit two-window consent; historical V1/V2 untouched. Manual TEST acceptance pause remains active.
- Next: single consolidated user acceptance test for V2 final evidence -> V3 DRAFT/Approved -> V3 journaled Monday writeback -> V4 readiness, then separately implement guarded V4 allocation if accepted.

PATCH BATCH #3 final TEST deployment verification (2026-11-26): Monday isolated TEST app deployment run 45843435714 SUCCESS (TEST code push, board-view connect and release verification). Uploader isolated Pages /test/ deployment run 45843428407 SUCCESS (production root unchanged). Synthetic cross-repository full V3 sync/rollback-stop/V4-ready CI run 45843032713 attempt 2 SUCCESS. No real project-data write during deployment. User manual acceptance remains paused; V4 allocation remains disabled.

## PATCH BATCH #3 acceptance fix - V3 START_NEXT Uploader consent (2026-11-26)

User evidence: Monday state is START_NEXT, version 3, two verified prior versions, zero initialized V3 files. Clicking the V3 start button reached Uploader's "waiting for separate approval" text, but the second consent control did not appear in the visible part of the UI. No confirmed V3 creation.
Changes in Uploader TEST branch:
- Dedicated `planningStartConsentHost` located BEFORE the Uploader Approved V1 status output inside the existing section 4, with an accessible independent V3 approval region.
- `app.js` binds the independent consent UI to the dedicated container (not the V1 status panel itself), explicitly fails closed if missing, and shows cancellation/connection-validation errors instead of stale waiting text.
- `styles.css` makes V3 consent prominent/sticky when shown; `tests/planning-start-visible-ui.test.js` enforces mount location and displayed error feedback.
- Full Uploader regression CI 45850114683 SUCCESS. TEST deployment requested with marker commit 477798176faf8dc76f6b715ea555706dd1f9f353, run 45850187168. Verify completion before user retest.
- This patch does not create SharePoint documents, does not touch Monday tasks, does not relax the two separate consents, and does not modify production Uploader root.
User retest: close old Uploader popup, open freshly from Monday TEST, click read-only planning-inspect, verify START_NEXT and V3.0 button, click start once, then look in Uploader step 4 for a prominent "V3 DRAFT inditasanak jovahagyasa" button. If not visible or error, stop and share Monday/Uploader messages before retry.

Final verification 2026-11-26: Uploader V3 start consent patch deployment run 45850187168 completed SUCCESS, tests run 45850187160 completed SUCCESS. This deployed updated /test/ Uploader UX, not a real V3 SharePoint session. Resume manual acceptance at START_NEXT -> one V3.0 start request -> visible separate Uploader button inside 4. section -> ACTIVE V3.0 confirmation; stop if missing or error.

## PATCH BATCH #3 - acceptance after two V3 confirmations (2026-11-26)

User symptom: START_NEXT V3.0 visible in Monday TEST; after both separate approvals there is no ACTIVE V3 indication. Uploader step 4 retains "waiting for separate approval"; the screenshot does NOT prove whether SharePoint creation succeeded. Never assume the V3 folder is empty or press start again until checked.
- Root of observable failure: onPilotRequest/planning-begin only wrote to Uploader status before the in-page consent and after the entire multi-step SharePoint creation. Any slow/failed intermediate step looked like indefinite waiting. The underlying Graph/SharePoint cause, if any, remains unverified without the new stage diagnostic.
- Added `planning-start-flow.js`: fail-closed staged orchestration (WAITING_FOR_UPLOADER_CONFIRMATION, UPLOADER_CONFIRMED, CREATING_OR_VERIFYING_SHAREPOINT, READBACK_OF_V3_RECEIPTS, ACTIVATING_MONDAY_EDITOR, ACTIVE_V3), abort/error with explicit last phase; consent cancellation produces zero writes; writes are never retried.
- `app.js` now updates the Uploader section 4 at every stage, preserves failed-phase details, indicates uncertain SharePoint creation after any execute attempt, and shows ACTIVE V3 only after final editor attachment. New `tests/planning-start-flow.test.js` verifies exactly-once, cancellation, lost Graph response, failed readback, lost handoff.
- `tests/planning-start-visible-ui.test.js` updated for staged messaging; successful tests+build CI run 45852226577. Isolated Uploader TEST deployment requested: 45852342921 (release marker commit 81e4d2a4c3c28d13f2feea6ce89c74b770ae167d). Verify deployment success before user retry.
- No real SharePoint project files or Monday task data modified by development. V1/V2 unchanged; no user-provided Microsoft token used.
- User recovery: close old Uploader, open fresh /test/ connection; run *read-only* V3 folder inventory and Monday planning-inspect FIRST. If Session/Drafts files exist, do NOT start again: inspect RESUME_DRAFT or incomplete cycle; if empty and START_NEXT, click once, approve in both windows, observe stage message. If FAIL, capture exact Uploader status and Monday error, do not repeat.

V3 post-consent telemetry release verified: Uploader TEST Pages GitHub Actions run 45852342921 completed SUCCESS; new staged UI + fail-closed start orchestration live at /test/. Unit/build run 45852226577 SUCCESS. The screenshot's exact underlying SharePoint failure cannot be proved without the newly visible phase/error, so do not claim a user session was successfully created. Read-only inspect V3 inventory and project status before any repeat start request.

## PATCH BATCH #3 user acceptance - Failed to fetch in read-only planning inspection (2026-11-26)

User screenshot: Monday TEST "Aktualis terv ellenorzese" returns generic "Failed to fetch" while prior V3 start after dual consent was not visibly completed. This is a transport/Graph-or-SDK read failure, not evidence that no V3 SharePoint files exist. Avoid re-pressing START_NEXT until V3 has been read-only inspected.

Safety changes:
- Uploader `planning-inspection-diagnostics.js` maps exact read stages: V0_APPROVED, V1_SYNC_JOURNAL/PROOF, V2_SYNC_JOURNAL/PROOF, V1_SESSION_CLAIM, VERSION_FOLDER_CATALOG, V3_SESSION_CHAIN, PROJECT_LINEAGE. Network/CORS failures get a scrubbed NETWORK_FETCH_FAILED label without Graph URL, download links, tokens, document contents or automatic retry. `single-draft-session-storage.js` reports each step; `app.js` displays it locally and propagates the read-only error to Monday.
- Monday `planning-read-steps.js` distinguishes MONDAY_EDITOR, MONDAY_FULL_BOARD and UPLOADER_SHAREPOINT to isolate the network failure without any write. `src/main.js` uses those labels. `src/ui/view.js` no longer misleadingly asserts no V3 exists when a read-only check fails.
- Uploader `project-live-state-adapter.js` returns BLOCKED/MANUAL_REVIEW (not START_NEXT) for read-back-verified START_INCOMPLETE or APPROVAL_FROZEN V3 artifacts. Never allocate a duplicate session or treat a folder as proof.
- Test coverage in `tests/planning-inspection-diagnostics.test.js`, `tests/planning-read-steps.test.mjs`, and `tests/project-live-state-adapter.test.js`.
- No live Monday/SharePoint project writes, no deletions, no token access. The exact cause of failed network access is still UNKNOWN pending the newly labeled diagnostic; avoid claiming it is CORS, auth or Graph without user evidence.
- Next user action after TEST deployment: close old Uploader, fresh Monday TEST/Uploader connection, run only Uploader V3 inventory (0 writes) then Monday planning-inspect (0 writes); copy two status messages. No V3 start until reviewed.
