# V1 readback: explicit note representation reconciliation

2026-11-25. Isolated TEST branches only. Never production, never a mutation during development/deployment.

## Observed failure and boundaries
An acknowledged single item write can return READBACK_MISMATCH when the approved note has a trailing ASCII U+0020 space and the stored note does not. This release does NOT normalize global hashes or equality, does NOT edit Approved V1, and does NOT convert an uncertain result to a successful result. All original files remain byte-for-byte unchanged. The cause of a specific representation change is not generalized to every text column or browser.

## Exact eligibility
The final contiguous record must have an existing valid ahead/result pair, ITEM_UNCERTAIN, exactly one attempt, replyConfirmed=true, error=READBACK_MISMATCH, and both readback flags=false. Removing only final ASCII spaces from that task's approved note must reconstruct BOTH the recorded full-item hash and the recorded whole-board hash exactly. The result must be nonempty. Leading/internal spaces, tabs, nonbreaking spaces, any other item/field/metadata difference, missing result or lost mutation response do not qualify. Unknown, orphan and duplicate files remain blocking.

The fresh live full board must still match that exact recorded state before consent and again afterward. The raw note JSON value and text must both match, and the current item hash must match independently. Existing identity, TEST target, Approved/checkpoint, time limit and origin/nonce guards remain unchanged.

## Explicit consent, no replay
The existing inline full-sync consent panel shows the task, exact approved and observed strings with character counts, and the number of NEVER-attempted tasks remaining. The button explicitly accepts that one note difference AND continuing the remaining full sync. No extra batch checkpoints or ten-task manual tests are introduced. Cancellation, expiry, lost context or changed ledger cannot authorize recovery.

Only after that consent: create-only `sync-v1-step-NNNNNN-reconciliation.json`. It binds original ahead/result hashes, exact note strings, original expected and observed item/board hashes, identity, consent candidate hash and fresh verification time. newMutationAttempts=0; approvedExactMatch=false. No retry of the original item, no rollback, no deletion/overwrite of any existing file. Missing/failed receipt stops downstream work. Lost receipt response can only be resolved by independent full readback on a new explicitly initiated connection.

## Subsequent chain and closure
Only a validated receipt permits a derived effective board state with that one accepted note representation. Later tasks still use exact hashes/equality, and the next ahead binds the reconciliation receipt. Original Approved bytes/hashes and earlier expectations stay available unchanged. The final receipt stores both the raw approved-final hash and the actual projected board hash, plus the full list of accepted note differences. The UI must not claim exact Approved equality when a representation variance was accepted.

The ordinary full-sync button performs the read-only reconciliation plus the remaining sequential writes in one authorized run. V2, active-session release, draft cleanup, and general uncertainty recovery are NOT part of this release. Concurrent editing remains forbidden during sync; there is no cross-service transaction or board lock.

## Verification
Local tests before release: all existing Monday 284 and Uploader 189 tests pass. Cross-repository suite includes 49-task complete sync, explicit note recovery and 48 new writes, immutable historical data, no duplicate mutation, all relevant drift/lost-response/orphan/false-consent failures, multiple independent reconciliations and concurrency. Real two-way bridge synthetic UI test includes the initial mismatch, displayed exact variance consent, no replay, remaining writes, annotated closure and no-write reopening. All network data writes in these tests: 0. CI and TEST deployment evidence must be recorded separately; code presence is not proof of runtime completion.

## User continuation after confirmed release
Close old Uploader window, refresh Monday TEST, reopen the existing Approved V1 connection and verify the existing plan. Use button 5. In the Uploader accept the displayed note difference and full remaining sync. Do not recreate checkpoint/pilot, delete journals, or manually edit the note. Keep both windows open. A new error requires inspection rather than blind restart.
