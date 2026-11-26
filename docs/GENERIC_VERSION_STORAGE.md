# M-Flow – általános tervverziók és SharePoint-mappák

2026-11-26 · fejlesztési lépcső 1 · csak az izolált TEST környezet.

## Cél

A tervezési ciklusok (V1, V2, V3...) és a cikluson belüli DRAFT-revíziók
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
fájlstruktúrát használja majd. A régi V1/V2-t a verziókatalógus
virtuális, csak olvasható örökölt helyekként kezeli.

## Új tervverziók (V3-tól)

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
