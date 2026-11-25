# Approved V1 - egyszeri, naplozott TEST pilot

Datum: 2026-11-25. Kizarolag TEST board `5107075373`, Monday view `60155394`, Uploader `/test/`.

## Bizonyitott kiindulopont
A felhasznalo igazolta az Approved V1 szinkronelonezetet (193 feladat, 50 modosulo feladat, 106 mezovaltozas), majd a `Sync-Status/sync-v1-prepared.json` letrehozasat es teljes SHA-256/eTag visszaellenorzeset. A checkpoint nem irt Monday-adatot. Ezeket nem kell ujra letrehozni.

## Most implementalt
- Monday: `3. V1 pilot ellenorzese es elonezete (0 iras)`; ez a MEGLEVO checkpointot, Approved V1-et es esetleges pilot-naplokat frissen olvassa vissza. Az osszes Monday-feladat friss allapotat ellenorzi. Nem hoz letre uj sessiont, checkpointot vagy feladatmodositast.
- Az elso modosulo feladatot az Approved V1 munkasorrendje hatarozza meg, nem felhasznaloi szoveg vagy kezi task ID. A mezoket a meglevo `makePlan` oszlopkodolo allitja elo. Minden nem szerkesztheto mezo megvaltoztatasa blokkol.
- Monday: `4. Egyetlen TEST-feladat szinkronizalasa`. Valodi TEST-irasrol szolo megerosites; utana az Uploader ugyanarra, fuggetlenul ellenorzott feladatra MASODIK megerositest ker. Enelkul nincs elonaplo vagy mutation.
- A meglatt `sync-v1-prepared.json` megorzesre kerul. A pilot uj fajljai a `Projects/5107075373/Sync-Status/` alatt:
  - `sync-v1-pilot-ahead.json`: egyszeri WRITE_AHEAD, Approved/checkpoint/session/task/editor/mezok hash-kotessel.
  - `sync-v1-pilot-result.json`: visszaolvasott eredmeny, mutation kiserletek, cel-feladat es TELJES board allapot hash, az elonaplo pontos hash-evel.
- A Graph-letrehozas a meglevo `createFile` utvonalat hasznalja: `@microsoft.graph.conflictBehavior=fail`, csak HTTP 201 fogadhato el, teljes tartalmi SHA-256/eTag ellenorzes; nincs overwrite/retry. A GET 403/500 nem tekintheto hianyzo fajlnak.
- Az elonaplo igazolasa utan friss szerkesztoi azonossag, teljes board es cel-feladat read-before-write. Az izolalt `createTestOneItemApi` pontosan egy mutation kiserletet enged; a kepesseg a kuldes elott elhasznalodik.
- Siker ES hiba utan friss cel-feladat es TELJES board readback. Sikerhez az egyetlen feladatnak a celallapotban, az osszes tobbi feladatnak az eredeti allapotban kell lennie. Csak visszaellenorzott SharePoint-eredmenynaplo utan `ONE_TASK_VERIFIED`.
- Timeout/ellentmondas/nincs eredmenynaplo => STOP, nincs automatikus ujrairas. Meglevo elonaplo eredmeny nelkul nem jogosult folytatasra. Kivalasztas/ujranyitas utan csak olvasasi recovery, nem uj mutation.
- A megmarado feladatok szama dinamikus (a jelen terv sikeres pilotja utan varhatoan 49). Nincs automatikus kovetkezo feladat, uj batch, draft-torles, session-release, V2 vagy PPC-iras.

## Elso felhasznaloi proba
1. A tesztkiadas igazolt telepitese utan friss Monday TEST nezet; az 1. Approved V1 gombbal uj Uploader TEST ablak nyitasa, Microsoft-bejelentkezes, Uploader 4. resz ellenorzese.
2. A checkpointot NE hozd letre ujra. Mondayben a 3. gombot hasznald; ellenorizd a feladatot es minden elotte/utana mezot. Ebben a fazisban tovabbra is 0 Monday-iras.
3. Csak az elonezet elfogadasa utan kovetkezhet a 4. gomb es a ket megerosites. Mindket ablak maradjon nyitva.
4. `ONE_TASK_VERIFIED`, teljes board-egyezes, ket tartos naplo; semmi tovabbi feladat ne irjon. Hiba eseten teljes uzenet, naplok megtartasa; tilos kezzel torolni vagy ujrairni.

## Ellenorzes es nyitott hatar
A Node-regressziok es szintetikus bongeszoproba helyben sikeresek (Monday 284, Uploader 168 teszt). A bongeszoproba mock SDK-val vizsgalja az uj gombokat, az egyfeladatos irast, readbacket es ujranyitast; az Uploader megerositesi kapuja kulon protokoll/tarolo tesztelt. A about:blank tesztkornyezetben a WebCrypto SHA-256 valodi Python SHA-256 teszthidon fut. A production kod valodi WebCrypto-t hasznal.

A tesztek NEM vegrehajtott, valos Monday/SharePoint pilot bizonyitekai. A tenyleges TEST telepites CI-futasait a kiadas utan kulon kell rogziteni. Production app/main nincs erintve.

A ket szolgaltatas kozott nincs globalis tranzakcio vagy tartos boardlock. Kulso szerkesztok a read-before-write es a mutation kozott tovabbra is versenyezhetnek. A teljes readback es a megallasi szabalyok ezt kezelik; a teszt idejen ne szerkesztesz parhuzamosan a boardon. A bongeszos ellenorzo osszeg nem szerveroldali alairas vagy azonossag-bizonyitek.

A `v1-pilot-contract.js` (Monday) es `single-v1-pilot-contract.js` (Uploader) byte-azonos szerzodes. Valtoztatasnal mindket peldanyt es a hozza tartozo teszteket frissiteni kell.
