# Flow LPS – SharePoint szinkron-előkészítő checkpoint (TEST)

## Cél

A jóváhagyott terv megváltoztathatatlan, felülírásmentes szinkronindítási kiindulópontjának létrehozása a SharePointon. **Ez a fejlesztés nem módosít Monday-adatot és nem engedélyez semmilyen szinkronírást.**

## Folyamat

1. A felhasználó a Monday TEST-ben jóváhagy egy DRAFT-ot, az Uploader SharePointra menti az Approved Plan JSON-t, majd Graph SHA-256/eTag visszaellenőrzést végez.
2. Az Uploaderben a `Monday-szinkron szárazpróba (NINCS ÍRÁS)` gomb átadja a tervet a korábban megnyitott, eredet és nonce alapján azonosított Monday-ablaknak.
3. A Monday újra lekérdezi az aktuális boardot, ellenőrzi a forrás-fingerprintet, feladatokat, mezőtípusokat, kiszámolja a módosítandó feladatok/mezők számát, és **0 mutation** után `BOARD_PRECHECK_ONLY` jelentést küld vissza az Uploadernek.
4. A jelentés egyezik az Approved Plan boardazonosítójával, forrás DRAFT-verziójával és SHA-256-ával. A böngészős jelentés **nem szerveroldali írási engedély**.
5. Az Uploader ekkor aktiválja a `Szinkron előkészítő checkpoint mentése (0 írás)` gombot. Külön felhasználói megerősítés után frissen beolvassa a SharePoint Approved Plan teljes tartalmát és eTag-jét, és hitelesíti az Entra-felhasználót (`/me`).
6. A SharePoint `Projects/{BoardID}/Sync-Status/sync-prepared-v{version}-{ApprovedSHA24}.json` mappába új fájl kerül, Graph `conflictBehavior=fail` móddal. A teljes checkpoint-fájlt a létrehozás után SHA-256-tal és eTag-gel újraellenőrzi.

## Checkpoint-séma

- `format: flow-lps-sync-checkpoint`
- `status: PREPARED_NO_WRITES`
- `approvedPlan`: az újra ellenőrzött SharePoint Approved Plan azonosítója, eTag, SHA-256, forrás DRAFT SHA-256, verzió és drive ID.
- `mondaySourceFingerprint`: a jóváhagyott terv eredeti board-fingerprintje.
- `mondayPreflight`: a feladat- és meződarabszám, ellenőrzési időpont, böngészős szerkesztői azonosító és a jelentés korlátjának egyértelmű megjelölése.
- `progress: {cursor:0, verifiedTaskIds:[], inFlight:null, mondayWrites:0}`
- `mondaySyncAllowed: false`, `mondayWritten: false`, `writeAuthorization: NOT_GRANTED`

## Hiba- és ismétlésvédelem

- Ha a DRAFT vagy a Microsoft-fiók az ellenőrzés közben megváltozik, az előkészítés meghiúsul.
- Hibás SHA-256/eTag, megváltozott Approved Plan, elavult Monday-jelentés, hibás feladatdarabszám vagy más Entra-felhasználó esetén nincs checkpoint-írás.
- Ha ugyanahhoz az Approved Planhez már létrejött checkpoint, a folyamat nem írja felül.
- Hálózati bizonytalanság után nincs automatikus újrapróbálás. Először ellenőrizni kell a Sync-Status mappát.
- A checkpoint SHA-256/eTag sikeressége nem jelenti a Monday vagy az Approved Plan új jóváhagyását.

## Következő fejlesztés

A tényleges Monday-mutation előtt külön, friss, hitelesített jogosultsági és boardütközés-ellenőrzés; explicit felhasználói szinkronindítás; legfeljebb egy in-flight feladat; tartós előzetes és utólagos checkpoint; feladatonkénti read-before-write/read-after-write; bizonytalan állapotnál automatikus újraírás nélkül leállás; időközi eltérések kezelése. Az első írási útvonal ezektől függetlenül **még nincs bekötve**.
