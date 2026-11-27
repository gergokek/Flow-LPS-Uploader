# V1 planning closure and one V2 DRAFT session

2026-11-25. TEST-only implementation. Companion release evidence is recorded separately in V2_DRAFT_SESSION_RELEASE.md when CI and deployment are confirmed. Code presence is not proof of a user's V2 runtime start.

## Scope

After the completed V1 sync, button 6 closes the historical V1 planning session and starts or resumes a single V2 DRAFT. The ordinary planning UI edits V2; every accepted command is saved as an immutable revision. This release does not approve V2, sync V2 to Monday, start V3, delete/archive old drafts, change the approved baseline timeline, or promote production/main. Development and deployment perform no live Monday or SharePoint project-data writes.

The V2 baseline is the effective full-board state proven by the original Approved V1, the complete immutable sync journal, completion receipt and every explicitly accepted note reconciliation. It is not V0 and does not restore a rejected trailing space. The original Approved V1, every original journal and all V1 drafts remain unchanged.

## Append-only lifecycle

All new files live in `Projects/5107075373/Draft-Plans/`:

- `session-v1-closed.json`: immutable closure of the original V1 session, bound to its claim, approved plan, completion receipt, source revision, effective board hash, identity and accepted variances.
- `active-session-v2.json`: atomic create-only successor claim, bound to the closure SHA and source lineage, with a new session UUID.
- `draft-v2.json`: unchanged effective baseline, revision 0.
- `draft-v2-r000001.json`, `draft-v2-r000002.json`, etc.: full consecutive V2 snapshots, each linked to the previous file's SHA and unchanged history prefix.

The old `active-session.json` is historical evidence and is not overwritten, deleted or recycled. Its original ACTIVE-shaped bytes remain; the verified closure supersedes its logical activity. V1 is already frozen by its original approval, so old clients cannot edit it or create another V1. One fixed successor filename admits only one V2 claim. Concurrent editors may resume that same session; atomic revision filenames prevent conflicting writers from overwriting one another. This is not a cross-service transaction or a distributed edit lock.

## Start, resume and guards

The existing origin/nonce-bound Approved V1 bridge carries `v2-inspect`, `v2-begin`, `v2-open`. Both apps validate the complete source evidence and V2 file chain independently. Live Monday full-board equality is required before consent, after consent and before editor activation. Fresh board proof is bound to identity and source hashes and is valid for at most two minutes. Account/project changes fail closed, including changes during asynchronous token acquisition.

Starting requires an explicit inline Uploader approval; there is no native confirmation popup, automatic approval or timed lease expiry. The consent panel states that SharePoint files will be created, Monday tasks will not be written and no files will be deleted. Acknowledging consent alone creates no file. Only the later fresh-board-checked operation can create the closure/claim/baseline.

Existing valid V2 is resumed without another creation consent or new files. All revisions and the current board are rechecked. A missing baseline after a proven claim can be completed only in a fresh explicitly approved connection, using the same session ID. A failed or uncertain create blocks that instance; it does not retry, delete, overwrite or allocate another claim automatically. Existing valid files are read back rather than recreated. Corrupt, orphan, sparse, unknown or duplicate V2 evidence and another version's claim block progress.

V2 editing uses the existing LPS engine and immutable save queue. Base/source, IDs/order, protected fields, session lineage and prior history cannot change. Parent-SHA and revision sequence must match the latest verified file. Conflicting/lost save outcomes stop the writer; a fresh independent resume can recognize an already saved revision without resubmitting it. Up to 1,000 consecutive revisions can be read in this initial TEST implementation. Each file remains capped at 5 MB by the existing storage adapter.

## UI

Monday button: `6. V1 lezarasa es V2 DRAFT inditasa / folytatasa` (Hungarian labels may include accents).
Uploader approval: `V1 lezarasa es V2 DRAFT inditasa`.
After activation the ordinary planning view uses V2 and labels saved revisions V2.1, V2.2, etc. V1 approval controls are replaced with an explicit V2 approval/sync-not-yet-implemented notice. To resume after reloading, connect to the existing Approved V1 and use button 6; do not create a new V1 or rerun V1 sync.

## Automated evidence before release

Local full regressions: Monday 284/284, Uploader 203/203, including 13 targeted inline-consent tests and one real Graph-adapter fixture roundtrip covering completed V1, three-file V2 start, edit, resume and old-file preservation. Graph and SDK responses are synthetic; no external data writes.

Cross-repository V2 suite: 35 passing cases (22 V2 cases plus 13 imported full-sync regressions). Covers actual LPS editor commands, two revisions, note variance, cancellation, failure before/after each file creation, parallel starts, board drift before/after consent, stale proof, identity/pin drift, incomplete V1, V2 gaps/orphans/tampering, protected fields, stale parents and lost save responses.

Offline Chromium test uses the real Monday app, two-way bridge, actual Uploader onPilotRequest/onSaveRevision callbacks and actual queue-install function extracted from app.js. A synthetic V1 with an accepted note variance is seeded first. It verifies explicit heading-focused consent, no pre-consent file writes, V2 start, two UI edits saved as V2.1/V2.2, same-session read-only reopen, original V1 evidence preservation, and zero additional Monday mutations. Synthetic V1 seeding mutations are counted separately. Screenshot artifacts are synthetic, not images of the user's project.

## User continuation after confirmed TEST deployment

Close the old Uploader, refresh Monday TEST, reopen the existing Approved V1 connection, authenticate and verify the existing plan. Use button 6 and approve the inline V2-start panel. Expected baseline for this project: 193 tasks, inherited accepted note difference, zero new changes. Make one ordinary planning edit and save it as V2.1. Reopening through the same route must resume the same session and revision without new baseline files. Keep both windows open during saves. Do not rerun checkpoint/pilot/full V1 sync, delete evidence or manually restore the trailing space.

The deployed code does not itself create the user's V2 session. Runtime creation and first V2 save still require the user's authenticated action and confirmation.
