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
