# V2 review, approval and full board writeback

2026-11-25. Isolated TEST implementation only. Code and automated evidence are not proof of the user's completed V2 sync. Release evidence belongs in V2_APPROVAL_SYNC_RELEASE.md after CI/deployment checks.

## Scope and user flow

The existing saved V2 session is reused, not recreated. Button 7 reads the full V1 ancestry, V2 revision chain, approval files and V2 journals, then independently compares the current complete Monday TEST board. It displays the selected revision, every before/after field and the verified/remaining counts. It creates no files and performs no Monday mutation.

Button 8 starts one authorized full run. The inline Uploader panel explicitly grants BOTH finalization of the pinned V2 revision and its real Monday TEST writeback. Nothing is written before this approval. There is no separate pilot, manual batch checkpoint or ten-item confirmation. The complete plan is frozen and approved first, then changed tasks are written serially with per-task write-ahead, item/full-board readback, immutable result and final receipt. Zero-change plans can be approved and completed with zero task mutations.

All old V1 and V2 draft files remain unchanged. No V3, session-v2-closed.json, draft deletion/archiving, accepted-timeline change or production promotion is implemented by this package. The V2 claim remains historical ACTIVE-shaped bytes; approval freeze prevents further editing. A later successor-session package must explicitly close it.

## Immutable files

- Draft-Plans/session-v2-freeze.json binds the latest saved DRAFT, its generation, complete source/target hashes, identities and one explicit execution.
- Approved-Plans/approved-v2.json stores the exact frozen V2 base, working state, history and lineage.
- Draft-Plans/session-v2-approved.json binds the checked Approved V2 file, including raw SHA-256, item id and eTag.
- Sync-Status/sync-v2-step-000001-ahead.json and matching result, then consecutive numbered pairs, record each changed task.
- Sync-Status/sync-v2-completed.json is created only after every changed task and the full board are verified. Approved files remain immutable NOT_STARTED-shaped source documents; runtime completion is in this separate receipt.

The first journal step is the first V2 change, not a continuation of V1 step numbers. The original V1 accepted note representation is inherited in the V2 baseline and explicitly retained in lineage/inheritedReconciliations. Exact Approved V2 equality is checked; there is no new automatic variance acceptance. Newly changed notes ending in ASCII spaces are blocked BEFORE approval, with a request to fix the DRAFT, rather than silently trimming or creating a known readback mismatch.

## Integrity and recovery

Both applications independently validate the same pure V2 contract. The full saved V2 chain must be consecutive and identical to the freeze source. The unchanged origin/nonce/request transport is anchored to verified Approved V1 and restricted to six explicit V2 actions. The TEST-only single-use mutation capability admits only the exact task and encoded values authorized by its verified write-ahead. Ordinary TEST APIs remain read-only.

The inline panel focuses its heading, not its affirmative button. Cancellation, timeout, identity/window changes and Enter without clicking the affirmative control never authorize. The same draft/session/generation is checked after consent. Board proof is fresh for at most two minutes. Live whole-board and task preflight happen again after the durable write-ahead, before the one allowed mutation attempt. Failed or unacknowledged writes do not retry even when a later readback happens to match.

After a freeze, the new editor/storage refuse further revisions before and after the create boundary. A concurrent older client or manual board edit is unsupported; source-generation and full-board checks fail closed instead of reconciling automatically. The freeze/approval/journal system is not a distributed transaction or exclusive editing lease.

Fresh connections can re-read a partial approval and, after a new explicit consent, create ONLY missing approval stages. They never overwrite an existing file. Fully verified journal prefixes are skipped. A saved result whose response was lost can be recognized without resending the mutation; a missing/uncertain result or dangling ahead always blocks. An existing valid final receipt is read-only and requires no new consent or write. Original errors/journals are never deleted.

The Stop control requests a safe stop. Between verified tasks a new authorized run can continue only the unwritten suffix. A stop after write-ahead but before mutation is conservatively recorded as an abort and requires review, not an automatic resume.

Source-model memoization is bounded to four fully validated models and keyed by ALL serialized source bytes/receipt metadata and identities. Models are copied in and out. Any source mutation revalidates. No journal or live-board check is cached. Metadata pins are refreshed between independent full-content scans. No credentials enter the contract, preview, logs or source artifacts.

## Automated evidence

Local existing regressions: Monday 284 tests; Uploader 218 tests including 15 dedicated V2 full-run consent cases and an extended actual Graph-storage adapter fixture exercising V2 start, edit, resume, approval, journals, completion and V1 preservation. All service responses in these tests are synthetic.

Cross-repository V2 approval/sync suite: 60 passing cases, comprising 35 previously imported session/full-sync cases and 25 new full-cycle cases. Includes zero/multi/50-task changes; inherited note variance; cancellation; drift; partial approval; lost ahead/result/final responses; lost mutation acknowledgement; immutable result creation failure; verified-prefix stop/resume; forged result flags; warmed-cache tampering; changed identities/generation; stale board proof; forbidden journal reads.

The offline Chromium browser test uses the real Monday application, two-way origin-bound bridge, actual Uploader callback and real queue installation with synthetic services. It resumes V2, edits twice, checks the complete preview, cancels without writes, reconnects, explicitly approves the full flow, verifies Approved V2 and final receipt, and reopens completion with no mutation or duplicate files. It checks original V1 evidence preservation. Existing full V1, note-reconciliation and V2-session browser regressions also passed locally. Build/CI/deployment evidence is recorded separately.

Do not commit user JSON, real plan contents, tokens, temporary download URLs or private fixtures to the public Uploader repository. Development and release do not approve the user's actual plan or mutate their Monday/SharePoint project data.

## User continuation after confirmed deployment

Close old Uploader windows and refresh Monday TEST. Reopen the EXISTING Approved V1 connection via button 1 and verify that plan in Uploader. This is the source connection, not a request to rerun V1 sync. For direct finalization of the latest saved V2, use button 7; button 6 is not required. To edit before approval, button 6 resumes the still-unfrozen V2 first, then use 7 when saves are verified.

After reviewing the exact changes, use button 8 and explicitly approve the inline Uploader V2 finalization/full-sync panel. Keep both windows open; do not edit the board elsewhere. Only the final result is needed for the next user test, not an extra separate pilot or batch test.

If a previous V2 attempt froze or approved the plan, reconnect through Approved V1 and use 7 directly. Do not use 6 to open a frozen editor, recreate V1/V2, rerun V1 sync or delete logs. Unknown/uncertain results require inspection, not a blind retry. Successful result: V2_SYNC_COMPLETED, all V2 changed tasks verified, remaining zero, exact final receipt. V3 still does not start.
