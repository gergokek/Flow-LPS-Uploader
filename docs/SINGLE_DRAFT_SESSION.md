# M-Flow – egy aktív SharePoint DRAFT-munkamenet (TEST)

Forráság: `feat/test-single-draft-session`, a `feat/test-sync-final-receipt` bázisából. Nem a telepített `main`. Az eredeti Uploader Pages változatlan.

## Indítás és folytatás

Microsoft Entra login → aktuális Monday-projekt `5107075373` → V0-ból V1 munkamenet létrehozása **vagy** meglévő V1.X folytatása. A projekthez feltételezzük a teljes `Projects/{BoardId}/...` mappaszerkezetet. A manuálisan feltöltött V0 alap: `Projects/5107075373/Approved-Plans/approved-v0.json`; szigorúan egyeznie kell a `flow-lps-approved-plan`, `draftVersion:0` sémával, és a `plan.base.tasks` megegyezik a `plan.working` feladatlistával.

A tároló `Draft-Plans/active-session.json` változtathatatlan, konfliktusvédett foglalással kizárja a második aktív munkamenet indítását. A V1 alap: `draft-v1.json`. Minden elfogadott módosítás **külön** `draft-v1-r000001.json`, `draft-v1-r000002.json` stb. fájl, saját teljes `working` állapottal, `history` előzménnyel, `sessionId`-vel, `approvedV0Sha256` és `parentSha256` lánccal.

Új fájl írása: Graph createUploadSession + `conflictBehavior=fail`, pontosan egyszer; teljes Graph tartalom letöltés, SHA-256/eTag és stabil metadata-visszaolvasás. Hiba / timeout / versengő másik szerkesztés esetén stop; nincs automatikus retry. Recovery a foglalást és a V0-t, minden V1.X fájlt és az összes parent hash kapcsolódást visszaellenőrzi. Sérült/hézagos lánc nem folytatható automatikusan.

`single-draft-session-bridge.js` a kiválasztott, ellenőrzött DRAFT-ot új, origin/nonce-bound protokollon átadja a Monday TEST-nek; a következő revíziók státuszát és nyugtáját ugyanazon munkamenethez köti. `single-draft-write-queue.js` minden elfogadott revíziót külön, sorrendben ír, nem hagy ki köztes állapotot.

## Modulok / ellenőrzések
- `single-draft-session-core.js` – sémák, V0 vizsgálat, V1/v1.X invariánsok.
- `single-draft-session-storage.js` – Graph start/resume/append + teljes readback.
- `single-draft-write-queue.js` – nem összevonható, hibánál leálló mentési sor.
- `single-draft-session-bridge.js` – Monday↔Uploader munkamenetkiválasztás és nyugta.
- `single-draft-session-core.test.js`, `single-draft-session-storage.test.js`, `single-draft-session-bridge.test.js` – kockázatos esetek regressziója.
- `.github/workflows/verify-single-draft-session.yml` – csak `npm test` és `npm run build`, nincs Pages deployment.

**NINCS még:** Approved Plan V1-re másolás és takarítás, single-Approve automatikus Monday-sync, V2 indítása. A lock nem jár le magától, nem törlődik automatikusan. A teljes bejelentkezett Monday/Graph TEST integrációt még külön kell ellenőrizni.
