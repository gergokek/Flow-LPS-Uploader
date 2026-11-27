# Teljes Approved V1 szinkron es board-visszairas

2026-11-25. Kizarolag TEST board 5107075373, view 60155394, app 12560827, draft 19537785, feature 127885536 es Uploader /test/.

## Kiindulopont es felhasznaloi elvaras
A valos pilot sikeres: Tulajdoni lap 3324627731, 1 mutation, igazolt item/full-board readback, tartos ahead/result. A 193 feladatos Approved V1-ben 50 modosulo feladatbol 49 maradt. A checkpointot es pilotot nem kell ujra letrehozni. A felhasznalo nem ker kulon tizesenkenti kezi teszteket.

## Egyetlen teljes inditas
Az Approved V1 kapcsolat megnyitasa es az Uploaderben a terv ellenorzese utan az **5. Teljes V1 szinkron es board-visszairas** gomb inditja a folyamatot. Egy Monday-megerosites es egy Uploader-megerosites kell a TELJES hatralevo tervre. Nincs kulon feladatonkenti vagy tizesenkenti kattintas.

Automatikus lepesek: teljes Approved/checkpoint/pilot/naplolanc readback; friss teljes Monday-board egyezes; az igazolt feladatok kihagyasa; soros, egyszeri feladatiras; elonaplo, item es teljes board readback, eredmenynaplo minden lepeshez. Tiz uj feladatonkent a teljes SharePoint-naplolanc ujraellenorzese. Vegul teljes naplolanc es celboard egyeztetes, lezaro nyugta.

A megjelenitett folyamatjelzo igazolt feladatokat szamol, nem pusztan elkuldott kereseket. A **Leallitas az aktualis feladat utan** az aktualis lepes visszaellenorzeset es naplozasat befejezi, majd nem kezd uj feladatot.

## Tartossag es visszaallitas
A regi 3 Sync-Status fajl valtozatlan. Uj fajlok:
- sync-v1-step-000002-ahead.json / sync-v1-step-000002-result.json, majd sorrendben tovabb (az 1. feladat a pilot).
- sync-v1-completed.json: V1_SYNC_COMPLETED, teljes naplolanc-hash, celboard-hash, modosulo feladatszam es 0 hatralevo.

Minden eredmeny az elonaplo SHA-256-ahoz, minden kovetkezo elonaplo az elozo igazolt eredmenyhez kotodik. A mar mukodo create-only SHA/eTag-ellenorzott Graph utvonalat hasznalja; meglevo fajlt nem ir felul. A lista teljesen lapozott, parhuzamos tartalmi visszaolvasas maximum 4 fajl, a lista ujraellenorzott. 403/500 nem hianyzo fajl.

Timeout, hianyos naplo, eltero azonossag, ismeretlen sorszam vagy board-drift: STOP. Nincs automatikus ujrairas vagy rollback. Uj kapcsolat es uj explicit inditas csak teljesen igazolt, osszefuggo prefixbol folytathat. A mar igazolt feladatokat es egy kesz V1-et nem ir ujra. Zaronyugta-hiba utan csak a lezaro muvelet marad, nem az osszes mutation.

## Automatizalt ellenorzes
A meglatt regressziok: Monday 284/284, Uploader 168/168. Uj ket-repos szintetikus integracios csomag: 13 eset, beleertve mind a 49 visszairast, szabalyos Stop/folytatast, elveszett mutation/upload valaszt, driftet, hianyos es hamis naplot, final receipt hibat, rossz szemelyt es parhuzamos inditast. Helyben sikeres.

A Chromium-proba a valodi ketiranyu origin/nonce-bound bridge-et es UI-t hasznalja, szintetikus SDK-val es memoriabeli taroloval. 12 hatralevo feladat, ket kezdeti megerosites, closure es ujranyitas sikeres. A about:blank teszt-only SHA-256 helyettesito Python hashlib tesztvektorokkal ellenorzott; az alkalmazasban WebCrypto marad.

A remote CI/deployment bizonyiteka kulon kiadasi checkpoint. Automatizalt teszt vagy telepites NEM valos 49 feladatos szinkronbizonyitek. A valos futas a felhasznalo bejelentkezett Monday/Uploader ablakaiban indul.

## Hatarok
Nincs globalis Monday/SharePoint tranzakcio vagy boardlock: kulso szerkesztes versenyhelyzetet okozhat a read es write kozott. A teljes readback ellenoriz, nem zarol. A szinkron alatt ne legyen parhuzamos board-szerkesztes. Bongeszobezaras utan nincs hatterben tovabbfutas.

Nem indit V2-t, nem oldja fel az active-session foglalast, nem torol draftot, nem ir PPC-boardot. Production main/app es az Uploader main gyoker valtozatlan. A regi Halado batch-gombok nem reszei az uj V1-folyamatnak.
