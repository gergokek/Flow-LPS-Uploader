# Teljes V1 szinkron: lathato Uploader-jovahagyas

2026-11-25. Csak az izolalt Uploader TEST ag es /test/ felulet.

## Jelzett hiba
A felhasznalo kepernyojen SYNC_STOPPED_REQUIRES_REVIEW es 'A teljes szinkron inditasat megszakitottad. Nem tortent iras.' latszik, 1 igazolt es 49 hatralevo feladattal. A pontos hiba a full-begin Uploader-ag window.confirm(false) eredmenyebol szarmazik, a full.begin es az elso uj elonaplo elott. Ez nem bizonyitja, hogy a felhasznalo tenylegesen a Megse gombra kattintott: a bongeszo elnyomott nativ dialogusa is false-t adhat. A mostani javitas nem allitja a tenyleges bongeszoesemenyt igazoltnak.

## Javitas
A nativ, aszinkron confirm helyett lathato, oldalon beluli panel az Approved V1 Uploader-reszben. 'Teljes V1 visszairas jovahagyasa' es 'Megse' gomb, ellenorzott osszesito. Kezdetben semmilyen irast nem engedelyez. A cimsor kap fokuszt, nem az igen gomb. Megse, bezaras, lejart kerelem vagy fiok/kapcsolatvaltas soha nem jelent jovahagyast. A kerelem 5 perc alatt lejar; click elott is ellenorzi az idot. Csak kifejezett kattintas ad userConfirmed:true-t a valtozatlan full.begin-nek.

Megorzi a TEST board, fiok/tenant, kapcsolat, terv SHA/session/revision es naplolanc-azonossag ellenorzeset. A full.begin tovabbra is frissen visszaolvassa a tervet es naplosort a jovahagyas utan. Nincs automatikus retry, nincs pilot/checkpoint ujraletrehozas, nincs V2 vagy drafttorles. A Monday kod, SharePoint tarolo es mutation-vedelmek valtozatlanok.

## Ellenorzes es kiadas
18 celzott Node-teszt helyben sikeres. A teljes aktualis regresszio, build es a valodi app callbacket hasznalo szintetikus Chromium-proba a fix-v1-consent workflowban fut; csak minden siker utan commitolja a ket bekotesi fajlt. A TEST Pages-telepites kulon, explicit release markerrel indul. Sikeres build vagy UI-proba nem bizonyitja a valos 49 feladatos szinkront.

## Hasznalat kiadas utan
A megallt kapcsolatot zard be, Monday frissites utan nyisd ujra az Uploader TEST-et, jelentkezz be es ellenorizd a meglevo Approved V1-et. Monday 5. teljes szinkron inditas es annak megerositese utan valts az Uploaderre. A 4. resz alatt megjeleno panelen kattints a 'Teljes V1 visszairas jovahagyasa' gombra. Ez a korabbi masodik popup helyett van, nem ujabb tizesenkenti teszt. Mindket ablak maradjon nyitva. Meglevo naplokat tilos torolni vagy felulirni.
