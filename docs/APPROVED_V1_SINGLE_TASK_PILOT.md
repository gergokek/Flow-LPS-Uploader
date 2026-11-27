# Approved V1 – egyszeri, naplózott TEST pilot

Állapot: 2026-11-25. Implementálva, automatikusan ellenőrizve és a két TEST-felületre telepítve. A valódi, bejelentkezett egyfeladatos írás felhasználói próbája MÉG NEM történt meg.

Környezet: TEST board `5107075373`, Monday view `60155394`, Uploader `/test/`. Production app/main változatlan. A részletes Monday-folyamat és kiadási bizonyíték: [Flow-LPS pilotdokumentáció](https://github.com/gergokek/Flow-LPS/blob/02db6f679b101e79e9e37bb3d6e95688599c6900/docs/APPROVED_V1_SINGLE_TASK_PILOT.md).

## Igazolt kiindulás
A felhasználó igazolta az Approved V1 szinkronelőnézetet (193 feladat, 50 módosuló feladat, 106 mezőváltozás) és a `Sync-Status/sync-v1-prepared.json` létrehozását/visszaellenőrzését. Ezeket nem kell újra létrehozni. A fejlesztés és telepítés nem módosított valódi Monday-feladatot vagy SharePoint-munkamenetfájlt.

## Új működés
A Monday **3. V1 pilot ellenőrzése és előnézete (0 írás)** gombja újraolvassa az Approved V1-et, a meglévő checkpointot és az esetleges pilotnaplókat; friss teljes Monday-boarddal veti össze. Nem hoz létre új sessiont vagy checkpointot. Az első módosuló feladatot a jóváhagyott terv sorrendje határozza meg; a meglévő `makePlan` kódolja az oszlopértékeket.

A **4. Egyetlen TEST-feladat szinkronizálása** külön Monday-megerősítést kér. Ezután az Uploader ugyanarra a függetlenül ellenőrzött feladatra második megerősítést kér. Enélkül nincs előnapló vagy Monday-írás.

A `Projects/5107075373/Sync-Status/` új fájljai:
- `sync-v1-pilot-ahead.json`: változtathatatlan WRITE_AHEAD, Approved/checkpoint/session/feladat/szerkesztő/mezők hash-kötéssel.
- `sync-v1-pilot-result.json`: eredmény és kísérletszám, célfeladat- és teljesboard-hash, az előnapló pontos hash-ével.

Mindkét fájl a meglévő `createFile` útvonalon készül: `@microsoft.graph.conflictBehavior=fail`, csak HTTP 201, teljes SHA-256/eTag visszaolvasás. Nincs felülírás vagy automatikus újrapróbálás. A GET 403/500 nem hiányzó fájl. Az Uploader nem tartalmaz Monday-írót.

Az igazolt előnapló után a Monday ismét ellenőrzi a szerkesztőt, teljes boardot és célfeladatot. Az egyszer használható TEST-adapter egyetlen írási kísérletet enged. Siker és hiba után is célfeladat- és teljesboard-visszaolvasás történik. `ONE_TASK_VERIFIED` csak az egy feladat célállapota, a többi feladat változatlansága és az igazolt SharePoint-eredménynapló után jelenhet meg.

Timeout, eltérés vagy hiányos napló esetén STOP. Meglévő előnapló eredmény nélkül nem enged új írást. Újranyitás csak olvasási állapotellenőrzést enged, nem automatikus újraírást. Nincs következő feladat, új batch, drafttörlés, V2 vagy PPC-írás. A jelen terv sikeres pilotja után várhatóan 49 módosuló feladat marad.

## Kiadási bizonyíték
- Uploader implementáció: `7cffe1a40ed40101cc155c99d6e891727f03c991`.
- Uploader telepített kiadás: `ef9759a1254a756053a1fa07c32fd1de24fb01e0`, `feat/test-single-draft-session`.
- [Uploader TEST telepítés 45600776475](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45600776475): completed/success. A main gyökér változatlan tartalmú újraépítése és az izolált `/test/` sikeresen települt.
- Monday implementáció: `6ed58346c31c2b41f969d6c207b062fda987d7ce`; telepített kiadás `5b4b7a59fd7806fee6ae988aa32653a5cea75a14`, `feat/msal-browser-integration`.
- [Monday TEST telepítés 45600962828](https://github.com/gergokek/Flow-LPS/actions/runs/45600962828): completed/success.
- [Monday teljes regresszió 45600971717](https://github.com/gergokek/Flow-LPS/actions/runs/45600971717): verify success, production deploy skipped.
- [Új szintetikus böngészőteszt 45600963070](https://github.com/gergokek/Flow-LPS/actions/runs/45600963070): success.
- Helyi Node: Monday 284/284, Uploader 168/168; a remote kiadási tesztek és build is sikeresek.

A szintetikus böngészőteszt az előnézetet, egy mock SDK-írást, teljes visszaolvasást és újranyitást ellenőriz. Az Uploader megerősítése külön protokoll-/tárolótesztelt. Az about:blank környezetben a SHA-256 Python-teszthídon fut; az alkalmazáskód WebCrypto-t használ. Ezek nem valódi Microsoft/Monday bejelentkezéses pilotbizonyítékok.

A dokumentációs commit nem új alkalmazáskiadás: a fenti commitok azonosítják a telepített kódot.

## Következő felhasználói próba
Korábbi Uploader bezárása, Monday TEST frissítése. Az 1. Approved V1 gomb nyisson új Uploader TEST ablakot; bejelentkezés után az Uploader 4. részében Approved V1 ellenőrzés. A checkpointot NE hozd létre újra. Mondayben csak az új 3. gombot próbáljuk: feladat, előtte/utána mezők, nulla írás. A 4. gomb csak az előnézet elfogadása után következik.

A későbbi íráspróbánál mindkét ablak maradjon nyitva; ne szerkessz párhuzamosan a boardon. Hiba esetén naplók megőrzése és teljes hibaüzenet szükséges, nem kézi törlés vagy újraírás.

Nincs globális tranzakció vagy tartós boardlock; a read-before-write és mutation közötti külső módosítás elvi versenyhelyzet marad. A böngészős hash nem szerveroldali aláírás. A `single-v1-pilot-contract.js` és Monday `src/adapter/v1-pilot-contract.js` byte-azonos szerződés, együtt frissítendő a tesztekkel.
