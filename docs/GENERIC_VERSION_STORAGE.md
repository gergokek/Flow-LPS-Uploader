# M-Flow – általános tervverziók és SharePoint-mappák

2026-11-26 · fejlesztési lépcső 1 · csak az izolált TEST környezet.

## Cél

Az új projektekben már a V1 is Versions/V0001-be kerül. A tervezési ciklusok (V1, V2, V3...) és a cikluson belüli DRAFT-revíziók
(V3.1, V3.2...) külön fogalmak. A legfeljebb hatjegyű DRAFT-revízió
*ugyanahhoz a tervezési ciklushoz* tartozik. A számozás általános,
nem szükséges minden V4/V5/V6 ciklushoz új fájlnév- vagy mappalogika.

## Megőrzött történeti állapot

```text
Projects/5107075373/
  Draft-Plans/           # V1 és V2 régi, változatlan nyugtái/revíziói
  Approved-Plans/        # approved-v0, approved-v1, approved-v2
  Sync-Status/           # V1 és V2 eredeti szinkronbizonyítékai
  Backups/
  Logs/
```

Ezeknek a helye és a bájttartalma **nem módosul**. A korábbi
SHA-256/eTag és fájlútvonal-ellenőrzések, jóváhagyási láncok
változatlanok. A régi fájlok átmásolását, átnevezését vagy törlését
ez a fejlesztés **nem** végzi el; először minden új V3+ írás az új
fájlstruktúrát használja majd. Kizárólag a 5107075373 TEST board V1/V2 ciklusai számítanak örököltnek. Új boardoknál a V1/V2 is V0001/V0002 struktúrába kerül. A régi V1/V2-t a verziókatalógus
virtuális, csak olvasható örökölt helyekként kezeli.

## Verziómappák: új projekteknél V1-től, a meglévő TEST boardnál V3-tól

```text
Projects/5107075373/
  Versions/
    V0003/
      Session/
        version-info.json             # csak V3 induláskor, igazolt V2-forrásból
        active-session-v3.json
        session-v3-freeze.json
        session-v3-approved.json
        session-v3-closed.json
      Drafts/
        draft-v3.json                  # V3.0 alapállapot
        draft-v3-r000001.json          # V3.1
        draft-v3-r000002.json          # V3.2
      Approved/
        approved-v3.json
      Sync/
        sync-v3-step-000001-ahead.json
        sync-v3-step-000001-result.json
        sync-v3-completed.json
    V0004/
      Session/
      Drafts/
      Approved/
      Sync/
```

A mappanevek és fájlnevek azonos, verzióparaméteres szerződésből
jönnek: `version-workspace-layout.js`, mely a Monday TEST-ben a
`src/adapter/version-workspace-layout.js` megfelelőjével azonos.
A `versionLayout`, `versionFilePath`, `draftFileName`,
`lifecycleFileName`, `versionIndex` függvények bármely
V3..V9999 verzióra működnek.

A jövőbeli `version-info.json` csak akkor menthető, ha a
megelőző Approved+Sync lezáró nyugta teljesen igazolt, és
új, egyedi session ID jött létre. A mappa előkészítése
önmagában nem hoz létre DRAFT-ot, nem ad jóváhagyást
és nem jogosít Monday-írásra.

## Megvalósított és még hátralévő rész

**Most kész:** egységes útvonal- és fájlnév-szerződés;
V1/V2 örökölt címzés; V3+ verziómappák idempotens,
csak-mappa Graph-előkészítése (a meglévő fájlokhoz
nem nyúl); az Uploader TEST-ben elkülönített, kifejezetten
jóváhagyandó „V3 mappastruktúra előkészítése” kezelőszerv;
automatikus ellenőrző tesztek.

**Következő fejlesztés:** a jelenlegi fix V2-session-,
approval- és sync-szolgáltatások lecserélése generikus
`planVersion` paraméterű tárolóra, és a V2 lezárása →
V3.0 létrehozása / V3.X mentése / Approved V3 / szinkron
kötése az új útvonalakhoz. Ekkor a mappák előkészítése
automatikusan része lesz az új munkamenet létrehozásának.
A V3-at a mostani kiadás **nem indítja**, az élő V2-t
nem módosítja.

## Biztonsági invariánsok

1. Csak a rögzített Monday TEST board `5107075373` használható.
2. Fájl létrehozása kizárólag `conflictBehavior=fail`, meglévő
   állomány felülírása vagy automatikus újraküldése nélkül.
3. A mappa előkészítése nem ír sem DRAFT-ot, sem Approved
   Plant, sem szinkronnaplót, és nem ír a Monday-boardra.
4. A tervverzió és a fájlnév/útvonal karakterei szigorúan
   validáltak; nincsenek szabad felhasználói útvonalak.
5. Nem migráljuk csendben a V1/V2 bizonyítékait: a
   történeti útvonalak továbbra is az eredeti helyekre mutatnak.
6. Csak a valóban ellenőrzött előzményből hozható létre
   új `version-info.json` — ezt a következő ciklus
   teljes implementációjánál kell kikényszeríteni.

## 2026-11-26: utódverzió és V3 DRAFT motor (fejlesztői ág)

- `version-workspace-layout.js` most a `5107075373` TEST boardon kívül már **V0001** mappát választ az első ciklushoz. Az új V1 manifest csak az `approved-v0` ellenőrzött SHA-256 ujjlenyomatát hivatkozhatja; a következő verzióké a lezárt előző ciklus zárónyugtája.
- `version-successor-contract.js`: csak valóban `V2_SYNC_COMPLETED` bizonyítékláncból számol V3 alapállapotot. Nem kezeli automatikusan V4-nek egy V3 mappa meglétét. Létrehozza és visszaellenőrzi a külön manifest/claim/baseline dokumentumok tartalmát, a szülő SHA-256 alapján kötött DRAFT-revíziókat.
- `versioned-draft-storage.js`: új, felülírásvédett V3 mentési motor `inspect / begin / append` műveletekkel. Megszakított manifest- és claim-létrehozás után a régi, ellenőrzött session ID-t folytatja, nem generál másodikat. A V3 indításához felhasználói megerősítés, friss teljes Monday-board-egyezés és igazolt V2 zárónyugta kell. A `readBoard` és a Graph-műveletek injektált függőségek, nincs közvetlen hálózati vagy Monday-írás.
- Szintetikus regressziós tesztek: sérült nyugták, árva DRAFT-ok, megszakított SharePoint-mentés, parent-SHA ütközés, védett mező módosítása, eltérő Monday-board és hiányzó jóváhagyás.
- Az új V3 motor **még nincs bekötve a Monday–Uploader böngészőkapcsolatba**, ezért nem indít felhasználói V3 DRAFT-ot és nem módosít projektadatot. Az általánosított V3 Approved/szinkron további feladat.

## 2026-11-26: dinamikus projektállapot és következő tervezési ciklus

**Nem V2 → V3 hardcoded átmenettel tesztelünk és nem verziószámra épül a döntés.**

A `project-version-discovery.js` a projekt teljes SharePoint-verziókatalógusát olvassa, a `project-version-resolver.js` pedig a tényleges, igazolt állapotból választ műveletet. A `project-version-coordinator.js` az ellenőrzött verzióhoz kapcsolódó munkamenetmotort hívja, előtte újra ellenőrzi a katalógust. A döntési tesztek V0 → V1, V1 → V2, V2 → V3, V3 → V4 és V4 → V5 eseteket fednek le, és külön az aktív V1/V2/V3 folytatását is.

| Ellenőrzött aktuális állapot | Döntés |
|---|---|
| Csak teljesen igazolt V0 | Új V1 indítható jóváhagyással |
| Aktív Vn DRAFT | Ugyanaz a Vn/revízió folytatódik |
| Megszakadt Vn munkamenet | Ugyanazt a Vn sessiont kell visszaellenőrizni és folytatni, soha nem új allokációval |
| Jóváhagyás alatt vagy szinkron folyamatban | Vn véglegesítése/ellenőrzése, nem Vn+1 |
| Teljesen igazolt Vn szinkron és egyező teljes board | V(n+1) indítható külön hozzájárulással |
| Bizonytalan, hiányzó vagy ellentmondó nyugta | Tiltás és kézi ellenőrzés |
| Ismeretlen verzió vagy nem teljes mappalista | Tiltás, nem verzióugrás |

A meglévő V1/V2 adatstruktúrák használhatók az aktívállapot-ellenőrzésnél, de a régi fájlokat nem migráljuk. A V3 motor és az új általános állapotfelderítő bekötése a felhasználói Monday–Uploader kapcsolatra további integrációs feladat. A dinamikus döntési motor önmagában nem engedélyezi a V4+ írását addig, amíg a megfelelő forrás-, jóváhagyás- és szinkronbizonyíték-ellenőrző nem készült el.

A tesztek szintetikus munkameneteket használnak, nem írnak a valódi TEST boardra vagy SharePoint-projektfájlokba.
