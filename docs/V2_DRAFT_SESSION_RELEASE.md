# V1 closure and V2 DRAFT - verified TEST release

2026-11-25. Companion to V2_DRAFT_SESSION.md. This is code/deployment evidence, NOT confirmation of the user's live V2 start.

## Implementation and verification

- Monday implementation: 25bcde64a05974b679c12f56ecddb3ddae3c7af8, branch feat/msal-browser-integration.
- Uploader implementation: 352b13e0b2ed5ac3fb4c3466fb0e949c091d1e92, branch feat/test-single-draft-session.
- Uploader verification run 45651412083: success, including regressions, TEST build and existing actual-callback inline-consent browser test before source commit.
- Joint verification run 45651997181: completed/success at 16:15:51 UTC. Monday 284/284, Uploader 203/203, V2 integration suite 35/35 (22 V2 cases plus 13 imported full-sync cases), prior note-reconciliation suite 37/37, locked TEST build and full V1/note/V2 browser suites passed.
- Artifact 15041840911 (v2-session-verified-ui) downloaded and checked. ZIP SHA-256 e25145a9702119851d8d779512eac63cdcdabcd6fcdc9e2fcea0aefab375fea4. Screenshots and result.json confirm synthetic V1 closure, one V2 claim, inherited accepted note representation, two saved revisions, same-session resume, zero new Monday mutations and unchanged old evidence. External service writes: zero. Fixture closedV1=true does not mean a live project closure.

## Confirmed deployments

- Monday release f2bfd55bf5f5738aaf5d66febe0a380251ffc5d9; run 45652347080 completed/success at 16:18:02 UTC. TEST upload, Board View connection and post-release check passed.
- Uploader initial release 3fd24e5a69f9d2636d7ea752c5aade6f5f9197ba; run 45652299925 passed regressions/build/assembly/artifact checks but Pages deployment returned HTTP 500. Connector rerun calls returned 502; no new attempt was observed.
- Uploader controlled retry release f0e5c9daa8cc1f7ec036275e222111fdee56068b; run 45652803004 completed/success at 16:21:53 UTC. Only the release marker changed; application source stayed identical. The /test/ deployment succeeded and the assembled main root was checked unchanged.
- Targets: TEST board 5107075373, view 60155394, app 12560827, draft 19537785, feature 127885536; Uploader /test/. No production/main promotion.

## Runtime scope

Button 6 verifies completed V1, the full sync/reconciliation evidence and the fresh live board before creating one successor V2 DRAFT. Its baseline is the effective V1 final state, including accepted note differences, not V0 or an unqualified exact copy of raw Approved V1.

First confirmed start adds only Draft-Plans/session-v1-closed.json, active-session-v2.json and draft-v2.json. Edits add consecutive draft-v2-r000001.json, draft-v2-r000002.json, etc. Original Approved V1, all V1 drafts and every checkpoint/sync/reconciliation file stay unchanged. Old active-session.json remains immutable historical evidence; its logical activity is superseded by the closure. V1 is already frozen by approval. Fixed create-only successor and revision names prevent duplicate claims or conflicting overwrite; this is not a distributed edit lock.

Existing valid V2 resumes the same session/latest revision without creating another baseline. Partial/uncertain creation or saving stops; a fresh independently checked connection can recognize already saved data or explicitly complete a proven incomplete start. No automatic retry, deletion or rollback. Concurrent manual board editing is unsupported.

Implemented: V1 planning closure, V2 start/resume, ordinary planning edits and immutable versioned SharePoint saves. Not enabled: V2 approval, V2 board sync, V3, draft deletion/archiving or production release. Development/deployment performed no live Monday or SharePoint project-data writes.

## User continuation

Close old Uploader, refresh Monday TEST, reopen the existing Approved V1 connection from Monday, authenticate and verify the existing plan. Do not create another V1 DRAFT or rerun full V1 sync.

Use `6. V1 lezarasa es V2 DRAFT inditasa / folytatasa` (accented UI). On first start approve the inline Uploader V2-start panel. This creates SharePoint lifecycle files, not Monday task writes. Keep both windows open. Expected project baseline: V2 DRAFT active, 193 tasks, accepted note representation inherited, no new planning changes.

Make one ordinary planning edit and check the verified V2.1 save. Reconnecting through the same route resumes the same session/latest revision. Do not recreate checkpoint/pilot, delete evidence or manually restore the removed trailing space.

The user's actual V2 creation and first save are still unconfirmed. This release did not create them. Next feature package: V2 approval and its later board-sync lifecycle; do not imply these are already implemented.
