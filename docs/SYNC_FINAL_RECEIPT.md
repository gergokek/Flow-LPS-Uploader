# TEST-only immutable SharePoint final sync receipt

Source branch: `feat/test-sync-final-receipt`, not deployed `main`. [Draft PR #1](https://github.com/gergokek/Flow-LPS-Uploader/pull/1).

Two distinct user confirmations are required: Monday TEST sends a nonce/origin-bound final intent only after full-board closure preview, then Uploader requires an explicit button click.

The Uploader re-inspects SharePoint pilot and all immutable batch journal files directly, requests a fresh whole-board Monday attestation with a new challenge, checks Entra /me against the Approved Plan finalizer, and creates exactly one new `Projects/5107075373/Sync-Status/sync-final-{ApprovedSHA24}.json`. Graph conflictBehavior=fail, no overwrite, no automatic retry. It then reads back the entire file and verifies its SHA-256 and stable eTag. No Monday mutations or PPC-board writes occur.

Stored history recovery: reopen **Korábbi szinkron helyreállítása**, select the checkpoint and inspect. When the SharePoint batch ledger is `ALL_VERIFIED`, the historical final receipt is read from Graph and fully validated. This does not prove that the current Monday board remains unchanged.

Modules: `sync-final-receipt-save.js`, `sync-final-receipt-ui.js`, `sync-final-receipt-inspect.js`, `draft-handoff-receiver.js`, `sync-recovery-history-ui.js`; tests: the corresponding `sync-final-receipt-*.test.js`.

CI on branch and PR: [Uploader run 45410976796](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45410976796), test and build passed. Keep PR as draft until actual end-to-end TEST authentication and manual integration checks pass. Do not merge/deploy automatically.
