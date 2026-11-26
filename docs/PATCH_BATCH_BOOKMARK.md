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
