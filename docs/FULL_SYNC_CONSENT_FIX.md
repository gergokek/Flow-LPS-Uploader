# Teljes V1 szinkron: lathato Uploader-jovahagyas

2026-11-25. Csak az izolalt Uploader TEST ag es /test/ felulet.

## Jelzett hiba
A felhasznalo kepernyojen SYNC_STOPPED_REQUIRES_REVIEW es 'A teljes szinkron inditasat megszakitottad. Nem tortent iras.' latszik, 1 igazolt es 49 hatralevo feladattal. A pontos hiba a full-begin Uploader-ag window.confirm(false) eredmenyebol szarmazik, a full.begin es az elso uj elonaplo elott. Ez nem bizonyitja, hogy a felhasznalo tenylegesen a Megse gombra kattintott: a bongeszo elnyomott nativ dialogusa is false-t adhat. A mostani javitas nem allitja a tenyleges bongeszoesemenyt igazoltnak.

## Javitas
A nativ, aszinkron confirm helyett lathato, oldalon beluli panel az Approved V1 Uploader-reszben. 'Teljes V1 visszairas jovahagyasa' es 'Megse' gomb, ellenorzott osszesito. Kezdetben semmilyen irast nem engedelyez. A cimsor kap fokuszt, nem az igen gomb. Megse, bezaras, lejart kerelem vagy fiok/kapcsolatvaltas soha nem jelent jovahagyast. A kerelem 5 perc alatt lejar; click elott is ellenorzi az idot. Csak kifejezett kattintas ad userConfirmed:true-t a valtozatlan full.begin-nek.

Megorzi a TEST board, fiok/tenant, kapcsolat, terv SHA/session/revision es naplolanc-azonossag ellenorzeset. A full.begin tovabbra is frissen visszaolvassa a tervet es naplosort a jovahagyas utan. Nincs automatikus retry, nincs pilot/checkpoint ujraletrehozas, nincs V2 vagy drafttorles. A Monday kod, SharePoint tarolo es mutation-vedelmek valtozatlanok.

## Igazolt ellenorzes es kiadas
- Implementacio: a3d1380e8f6af1b78348948e965d5c42882c7c20; modul/tesztek: 114f3764bf2a2c39b569e59dfbd0c802d71e4ed1.
- [CI 45635879046](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45635879046): completed/success, 2026-11-25 14:37:41 UTC. 186/186 Node-teszt, ebbol 18 uj consent-teszt; TEST build sikeres. A valodi app callbacket hasznalo szintetikus Chromium-proba sikeres: background request waits, no native dialog, Enter does not approve, explicit accept only, cancel writes nothing, identity change blocks. External writes: 0.
- UI screenshot es result.json visszaellenorizve a 15032543703 artifactbol. ZIP SHA-256: 6d49ce36ba936fa9c9e9b01b28e627b9265e9b95dc63bddded33c304b576d27e.
- Release marker commit: d5c07bfd68ba36d5d1262fa171ac1d3236620c57.
- [Uploader TEST Pages deployment 45636382907](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45636382907): completed/success, 2026-11-25 14:40:07 UTC. Az izolalt /test/ kiadva, a main gyoker osszeallitasanak valtozatlansaga ellenorizve. A fixhez nem kellett Monday-telepites.
- [Release regresszio 45636383008](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45636383008): completed/success.

A helyi Chromium localhost-probat a futtato kornyezet ERR_BLOCKED_BY_ADMINISTRATOR hibaval blokkolta; a sikeres bongeszos bizonyitek a GitHub CI-bol szarmazik. A fejlesztes es kiadas nem hivott valos Monday vagy SharePoint adatirast. Sikeres build vagy UI-proba nem bizonyitja a valos 49 feladatos szinkront; annak ismetelt bejelentkezett futasa meg nincs visszaigazolva.

## Hasznalat kiadas utan
A megallt Uploader-ablakot zard be, Monday TEST frissites utan nyisd ujra az Uploader TEST-et a meglevo Approved V1 kapcsolaton keresztul, jelentkezz be es ellenorizd a meglevo tervet. Monday 5. teljes szinkron inditas es annak megerositese utan valts az Uploaderre. A 4. resz alatt megjeleno panelen kattints a 'Teljes V1 visszairas jovahagyasa' gombra. Ez a korabbi masodik popup helyett van, nem ujabb tizesenkenti teszt. Mindket ablak maradjon nyitva.

Ne hozz letre uj DRAFT sessiont, checkpointot vagy pilotot. Meglevo naplokat tilos torolni vagy felulirni. A megismert allapot 1 igazolt pilot / 49 hatralevo; a program ezt friss naplo- es boardellenorzessel hitelesiti. A teljes futas vegso celja 50 igazolt / 0 hatralevo es sync-v1-completed.json, nem V2 inditas. Hiba eseten nincs vak ujrainditas.
