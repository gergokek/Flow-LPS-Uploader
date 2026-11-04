# Egyfeladatos Monday-szinkron: tartós SharePoint-napló

## Helye a Flow LPS fejlesztésében

Az Uploader már teljes SHA-256/eTag ellenőrzéssel menti az Approved Plan fájlt, majd a `PREPARED_NO_WRITES` checkpointot. A sikeres checkpoint után annak tartalmát kizárólag **írásmentes pilot-előnézetre** továbbítja a Monday TEST alkalmazásnak.

Az új `sync-single-task-journal.js` modul egy még **nem UI-hoz kötött** Graph-adapter két, felülírásmentes naplózásához: a Monday-írás előtti `WRITE_AHEAD` és a Monday-írás utáni `ITEM_READBACK_VERIFIED`/`ITEM_UNCERTAIN` bejegyzéshez. A modul nem tartalmaz Monday API-hívást.

## Egyetlen pilot tranzakciója

1. Kötelező az Approved Planből származó hitelesített, 0-írásos Sync-Status checkpoint.
2. A journal-mentő minden írás előtt közvetlen Graph-kéréssel újraolvassa a checkpoint-fájlt; ellenőrzi a fájlazonosítót, eTag-et, bytehosszt és teljes SHA-256-ot.
3. Ellenőrzi a kiválasztott egyetlen TEST-feladatot, az Approved Plan SHA-256-át és a checkpoint SHA-256-át.
4. Létrehozza `sync-one-{ApprovedSHA24}-task-{itemId}-ahead.json` fájlt, Graph `conflictBehavior=fail` szabállyal; teljes Graph visszaolvasást végez.
5. A Monday pilot csak egy **megerősített, sikeres előnaplózás** után, közvetlen újraellenőrzéssel kísérelhet meg egyetlen GraphQL-változtatást. A tényleges alkalmazásban ez még le van tiltva.
6. A kísérlet eredményét a `sync-one-{ApprovedSHA24}-task-{itemId}-result.json` fájlban rögzíti. A Result mentése előtt ismét közvetlenül visszaolvassa és ellenőrzi az előnaplófájlt.

## Tiltások és helyreállítás

- A Graph-fájlok immutable-ok: nincs felülírás, és bizonytalan eredményre nincs automatikus újraküldés.
- Bármely beazonosítatlan, már létező vagy más SharePoint-fiókból megnyitott napló esetén a szinkron csak kézi egyeztetéssel folytatható.
- A dokumentált pilot szimulációban legfeljebb **1 mutation**, amelynek előfeltétele a tartós előnaplózás. A 193 feladatos teljes szinkron továbbra sincs bekötve.
- A visszaigazolás utáni journal-hiba nem jogosítja fel a rendszert újabb Monday-írásra. A tényleges read-back eredményt és a SharePoint-fájlállományt egyeztetni kell.

## Következő szakasz

A kétirányú per-mutation journal POST/ACK protokoll, kézi célfeladat-kijelölés, külön szinkronmegerősítés és az egyetlen TEST-mutationra korlátozott Monday adapter befejezése. Ezután készülhet az ügyfélnek a **részletes, checkboxos manuális teszt**; addig nincs szükség kézi próbára.
