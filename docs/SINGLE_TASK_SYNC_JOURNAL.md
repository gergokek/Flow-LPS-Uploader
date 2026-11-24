# Flow LPS Uploader – egyszeri Monday TEST pilot naplózás

## Fejlesztési állapot

Az Uploader új, külön gombbal és felhasználói megerősítéssel készíti el az írás előtti `WRITE_AHEAD` SharePoint-fájlt. Az eredeti Monday-ablak csak a teljes Graph SHA-256/eTag-visszaellenőrzés után kapja meg az egyező nyugtát. A Monday egyetlen TEST-feladatos írása után az Uploader automatikusan, egyszeri kísérlettel menti az eredménynaplót. Az Uploader nem tartalmaz Monday API-hívást és nem tud Monday-feladatot módosítani.

## Immutable fájlok, SharePoint Sync-Status

- **Előnapló:** `Projects/{BoardId}/Sync-Status/sync-one-{ApprovedSHA24}-ahead.json`.
- **Utónapló:** `Projects/{BoardId}/Sync-Status/sync-one-{ApprovedSHA24}-result.json`.
- A fájlnév **Approved Planenként egyedi, feladat-ID nélkül**. Ugyanaz az Approved Plan másik feladattal sem indíthat új pilotot, mert az előnapló ütközésvédett.
- A Graph `createUploadSession` `conflictBehavior=fail` beállítást használ; nincs felülírás.
- Minden fájl azonosítóját, eTag-jét, méretét és teljes SHA-256 tartalmát újraolvassuk a SharePointból.
- A checkpointot minden naplófájl előtt újraolvassuk; az előnaplót az utónapló mentése előtt is újraolvassuk.
- A Graph `/me` Entra-azonosságának meg kell egyeznie a `PREPARED_NO_WRITES` checkpoint készítőjével.

## Kétablakos protokoll

1. A Monday TEST kéri a `pilot-write-ahead-request` eseményt az eredeti Uploader-ablakban, munkamenet-nonce-szal és egyedi kérésszámmal.
2. Az Uploader ellenőrzi a boardot, Approved Plan SHA-256-át, checkpoint SHA-256-át, első célfeladatot, felhasználói Microsoft-fiókot és az egyező munkamenetet.
3. **Az Uploader külön gombjának megerősítéséig nem jön létre WRITE_AHEAD fájl, és nem indul Monday-írás.**
4. Az igazolt fájlt az `pilot-write-ahead-verified` eseménnyel visszajelzi.
5. A Monday a saját felhasználóját újraellenőrzi, legfeljebb egy `change_multiple_column_values` kísérletet indít, majd `pilot-result-request` eseménnyel továbbítja az ellenőrzés eredményét.
6. Az Uploader a már megszerzett Graph-tokenjével megpróbálja létrehozni az eredményfájlt, majd `pilot-result-verified` eseménnyel igazolja.

## Megszakításkezelés

Az előnapló fájl létezése **nem bizonyítja**, hogy Monday-írás történt; az utónapló hiánya **nem bizonyítja**, hogy nem történt. Hálózati bizonytalanság, tab bezárás, lejárt kérés, hibás SHA/eTag vagy eltérő Microsoft-/Monday-felhasználó esetén nincs automatikus újrapróbálkozás. Kézi SharePoint- és Monday-adategyeztetés szükséges.

## Telepítés és teszt

Az Uploader automatikusan GitHub Pagesre települ. A Monday új TEST-ágát külön kell deployolni. Jelenleg automatizált szintetikus regressziók vannak; a felhasználó kérésére **nem végzünk most kézi pilotot**. A teljes TEST-checklist külön következő körben készül.

## Recovery és történeti checkpointok (2026-11-24)

A `sync-recovery-inspect.js` minden ellenőrzéskor újraolvassa a SharePoint kiinduló checkpointját, az egyszeri pilot `ahead` és `result` fájlját, az összes tartalom SHA-256-át, eTag-jét, item ID-ját, valamint ellenőrzi a Microsoft Entra `/me` azonosságát.

A recovery négy állapotot különböztet meg: `NO_JOURNAL`, `WRITE_AHEAD_ONLY`, `RESULT_VERIFIED`, `RESULT_UNCERTAIN`. A Graph 403/500 hiba soha nem értelmezhető hiányzó fájlként. Eredménynapló nélküli vagy ellentmondó bizonyíték esetén további írás tilos.

A `sync-recovery-catalog.js` a korábban bezárt Uploader-ablak után is megkeresi az archivált checkpointokat a TEST `Projects/{BoardId}/Sync-Status` mappában. A kiválasztott checkpoint és a hozzá tartozó `Approved-Plans` JSON újbóli, teljes Graph SHA-256/eTag-visszaolvasásával állítja helyre a böngészőben korábban csak ideiglenesen tárolt bizonyítékokat. Ezután a megszakadt pilot-naplókat is újraolvassa.

A kezelőfelület két ellenőrzési módot kínál: egyetlen gomb az aktuális nyitott munkamenet ellenőrzéséhez, illetve a korábbi SharePoint-checkpointok listázása és kiválasztása böngészőbezárás után. A történeti ellenőrzés a régi Monday-ablakhoz nem csatlakozik automatikusan.

Mindkét útvonal kizárólag `GET` Graph-kéréseket használ; **nem ír SharePointra és nem indít Monday-módosítást**. A tényleges 193 feladatos visszaírás és megszakítás utáni automatikus újraindítás továbbra sem engedélyezett.

## Egyszeri TEST batch – feladatonkénti naplózás

Az új `sync-batch-journal.js` az első, legfeljebb tíz feladatos TEST batch-et naplózza, mindig sorosan és egymástól külön, nem felülírható fájlokban. A fájlnév: `sync-batch-{ApprovedSHA24}-step-{0001..0010}-ahead.json`, illetve `...-result.json`. A terv, a checkpoint, a Monday-feladat azonosítója és a sorrendi index a teljes Graph SHA-256/eTag-visszaellenőrzés része.

A `sync-batch-session-ui.js` egyetlen, explicit felhasználói megerősítés után automatikusan készíti az egyes feladatokhoz tartozó előnaplót és utónaplót. Minden következő feladat kizárólag akkor indulhat, ha az előzőnek sikeres Monday-visszaolvasása és igazolt SharePoint-eredménynaplója van. Az Uploader maga nem ír a Monday-boardra.

Megszakítás, nem visszaigazolt SHA/eTag, nem megfelelő Microsoft-fiók, hiba vagy bizonytalan Monday-írás esetén a batch leáll. Az elkészült előnapló **nem bizonyítja a Monday-írás elmaradását**, ezért nincs automatikus retry.

A soron következő, második és későbbi batch futtatása szándékosan nem engedélyezett. A történeti recovery eszközt ki kell egészíteni a `sync-batch-*` naplók teljes újraellenőrzésével, mielőtt tartós folytatási pozícióra bármilyen írási engedély épülhetne.

## Többcsoportos SharePoint recovery

A `sync-batch-ledger.js` az eredeti, véglegesített Approved Plan alapján tételesen ellenőrzi a soron következő tízfeladatos csoportok már végrehajtott feladatait. Egy feladat csak akkor minősül igazoltnak, ha **mindkét különálló, felülírásmentes elő- és utónaplója** megvan, pontosan egyezik a tervezett sorszám, feladatazonosító, mezők és SHA-256 lánc, a Monday-readback pedig sikeres.

A `sync-batch-recovery-inspect.js` közvetlenül Graph GET-tel listázza a TEST `Sync-Status` mappa összes, az Approved Planhez tartozó batch-fájlját; minden fájlt teljes tartalommal és dupla metaadat/eTag visszaellenőrzéssel olvas vissza. A 403/500 hiba, hiányos lista, ritkás sorszám, orphan eredmény vagy bizonytalan Monday-írás **blokkolja a folytatást**.

`FIRST_BATCH_READY` = nincs korábbi batch-napló; `NEXT_BATCH_READY` = az eddigi batch-ek minden eleme igazolt és 10-es határon végződik; `ALL_VERIFIED` = nincs további feladat; `MANUAL_RECONCILIATION_REQUIRED` = nem biztonságos automatikus következtetni. A jelentés írásmentes, és nem önálló végrehajtási engedély.

**Új batch indításakor az Uploader még egyszer, a felhasználói jóváhagyás pillanatában visszaolvassa a teljes korábbi SharePoint-naplóláncot.** A következő batch indulhat, de csak külön Monday- és Uploader-megerősítés után, egyező naplósor-hash és abszolút sorszám mellett. A végrehajtásban maximum tíz TEST-feladat szerepel, és minden egyes mutation után új, immutable SHA/eTag alapú utónapló keletkezik.

A történeti checkpointkeresőben böngészőbezárás után is megjelenik a korábban igazolt batch-feladatok száma. Ez csak olvasás; a régi, megszakadt munkamenet automatikus helyreállítása és újraindítása továbbra is tiltott.
