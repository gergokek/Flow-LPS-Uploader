# Approved V1 – TEST sync előnézet és 0-írásos checkpoint

A munkamenet már APPROVED PLAN V1 státuszban, a DRAFT V1.X befagyasztva. A V2 indítása ekkor még **tilos**.

Új TEST Uploader 4. panel: **Approved Plan V1 ellenőrzése és szinkronelőnézet átadása**. Csak a Monday TEST alkalmazásból nonce-kötötten megnyitott popupban, Microsoft-bejelentkezéssel használható. A `single-draft-session-storage.js` `inspectApprovedSync` metódusa független Graph olvasást hajt végre: V0, teljes V1 → V1.X lánc, session claim, freeze, approval receipt és `Approved-Plans/approved-v1.json`. Az összes tartalommal megegyező SHA-256/eTag/id nyugta és Entra `homeAccountId` ellenőrzés szükséges.

Az izolált postMessage kapcsolat `approved-sync-selected` üzenetben adja át a teljes, ellenőrzött Approved V1-et és a fájlnyugtát a Monday TEST-nek. A Monday ellenőrzi az Approved Plan JSON bájtok SHA-256-értékét és az aktuális boardot, majd a valódi writer oszlopkódolójával **írásmentes** előnézetet állít elő.

A Monday külön, kifejezetten megerősített **0-írásos szinkron checkpoint** gombja `prepare-sync-checkpoint` üzenetet küld. Az Uploader újra ellenőrzi a teljes Approved V1 fájlláncot, a Microsoft Graph `/me` azonosságát, az aktuális board-forrás SHA-256 egyezését. Ekkor készül el egyszer, konfliktusvédett Graph PUT metódussal, teljes readback-kel:

`Projects/5107075373/Sync-Status/sync-v1-prepared.json`

A fájl a következőket rögzíti: `status:'PREPARED_NO_WRITES'`, `mondayWrites:0`, `mutationAttempts:0`, `writeAuthorization:'NOT_GRANTED'`, Approved V1 SHA-256/eTag/id és a Monday V0-azonosság ellenőrzőösszege. Ez **nem jogosít** Monday mutationre. Ha a file már létezik vagy az írás bizonytalan, nincs felülírás vagy automatikus újrapróbálás. A meglévő V1.x, V0 és Approved V1 fájlok nem módosulnak.

TEST-forrás: `single-approved-v1-sync-core.js`, `single-draft-session-storage.js`, `single-draft-session-bridge.js`, `app.js`, `index.html`. Unit/regressziós tesztek: `single-draft-session-storage.test.js` és `single-draft-session-bridge.test.js`.

**Következő külön fejlesztés:** független pilot előnapló, legfeljebb egy feladat egyszeri Monday TEST mutationje, utónapló és visszaellenőrzés, majd 10-es batch-ek, teljes zárónyugta. V2 csak ezután indulhat. A régi legacy workflow moduljai nem alkalmazhatók automatikusan az új Approved V1 fájlnév/séma mellett.
