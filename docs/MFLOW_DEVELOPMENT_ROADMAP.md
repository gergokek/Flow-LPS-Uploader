# M-Flow — fejlesztési irány, életciklus és TEST-átadás

Állapotfelvétel: 2026-11-26. Ez a dokumentum mindkét TEST fejlesztői ág közös irányadó munkadokumentuma. Az előzményeket a `docs/PATCH_BATCH_BOOKMARK.md` őrzi; az ottani régebbi állapotjelölések nem írják felül ezt az aktuális összefoglalót. A ténylegesen igazolt működés, a szintetikus teszt és a tervezett képesség külön kategória.

## 1. Honnan indultunk, hová tartunk?

A kezdeti Flow LPS újraírás a Monday teljes projektpillanatképére építette a determinisztikus ütemezést, FS/FF függőségeket, Forecast/Actual, heti vállalás, Make Ready/readiness, akadálykezelés és PPC logikát. A számítás, a jóváhagyott változások és az írás utáni teljes ellenőrzés elkülönült. A korábbi közvetlen board-mentést a tervezési munkameneteknél fokozatosan felváltotta az immutábilis SharePoint DRAFT/Approved tárolás. A Monday továbbra is a ténylegesen publikált projektállapot, a DRAFT az aktív tervezési adatforrás, a SharePoint a változtathatatlan verzió- és bizonyítéktár; a UI nem tartós igazságforrás.

**Cél:** egy projekt = egy aktuális tervezési ciklus; V0 jóváhagyott kiindulás → V1.0 / V1.X → Approved V1 → naplózott, ellenőrzött Monday-szinkron → V2.0 → ... → Vn.0. Minden elfogadott felhasználói művelet és annak teljes számítási hatása egy új, teljes, immutábilis DRAFT-revíziót eredményez. Az alkalmazás újranyitáskor a hitelesített aktuális ciklust ismeri fel. Nem kell V1-es vagy verzióspecifikus tesztgombokon áthaladni. Az új üzleti modulok bővítése csak a megbízható életciklus után következik; meglévő számítási szabályokat nem dobunk ki.

## 2. Komponensek és mai bizonyítottság

| Réteg | Aktuális kód / állapot | Elfogadás |
| --- | --- | --- |
| Tervezés | Flow-LPS `src/main.js`, engine, reader/writer, meglévő heti/Forecast/Actual UI | Meglévő motor; a DRAFT útvonalnak azonos logikát kell használnia |
| V1–V2 örökölt ciklus | V1/V2 session-, approval-, sync-modulok, örökölt fájlutak | Felhasználói képernyő szerint V2 teljes szinkron, 0 hátralévő; minden új indításnál friss ellenőrzés szükséges |
| Verziózott tároló | `version-workspace-layout.js`, `project-version-folder-catalog.js` | Paraméterezett V1–V9999 név/útvonal, legacy TEST V1/V2 kivétellel; ez NEM teljes Vx motor |
| V3 kezdés és revízió | `version-successor-contract.js`, `versioned-draft-storage.js`, `project-planning-action-gate.js`, `planning-start-flow.js`, Monday/Uploader bridge | Kód és szintetikus tesztek; valós V3.0 indítás még nem elfogadott |
| V3 Approved | `versioned-approval-source.js`, `versioned-approval-sync-contract.js`, `versioned-approval-storage.js` | Beépített kettős megerősítés, freeze/Approved/receipt; valós V3 elfogadás hátra |
| V3 Sync | `versioned-sync-contract.js`, `versioned-sync-storage.js`, Monday `src/adapter/versioned-full-sync.js` | Kereszt-repo szintetikus végrehajtás sikeres; valós TEST board-visszaírás hátra |
| V4 | `versioned-next-cycle-proof.js` | V3 teljes zárónyugta + board alapján csak olvasási indíthatóság, `startEnabled:false`; V4 tényleges indítás és Vx teljes életciklus nincs kész |
| UI/kapcsolat | `src/ui/view.js`, `src/main.js`, `src/adapter/draft-session-link.js`, Uploader `app.js`, `single-draft-session-bridge.js` | A projekt-felismerés még a legacy Approved V1 átadásra épül; a jelenlegi teszt UI túl sok korábbi gombot mutat |

Utolsó ellenőrzött TEST kiadások: Monday [45853647280](https://github.com/gergokek/Flow-LPS/actions/runs/45853647280), Uploader [45853657126](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45853657126), mindkettő SUCCESS. A V3 integráció szintetikus CI: [45843032713](https://github.com/gergokek/Flow-LPS/actions/runs/45843032713), 2. kísérlet SUCCESS. Ez nem bizonyít valós böngészős Graph/MSAL és kétablakos folyamatot.

## 3. Egy életciklus, egy releváns trigger

A projekt azonosítása a Monday board kontextusából történjen; a Uploader Microsoft-hitelesítését és az origin/nonce/board/session/identity ellenőrzéseket megtartjuk. A felhasználói belépési pont **Projekt megnyitása / aktuális terv felismerése**, nem Approved V1 pilot. A régi formátumok ellenőrzése belső kompatibilitási adapter feladata. Új, független projekt-kapcsolati protokoll a Vx általánosítás része; a jelenlegi TEST-ben átmenetileg a bevált V1 proof handoff használható belső bootstrapként, de ez nem jelent V1 újraindítást.

| Hitelesített állapot | Egyetlen releváns fő művelet | Mentés/írás | Amit nem kínálunk fel |
| --- | --- | --- | --- |
| Nincs kapcsolat | Projekt megnyitása, Microsoft bejelentkezés, kapcsolat igazolása | Nincs projektírás | Verzióindítás, régi szinkron |
| Kapcsolódva, állapot ismeretlen | Aktuális projekt ellenőrzése | Csak olvasás | Új DRAFT, jóváhagyás, sync |
| START_NEXT, támogatott n, teljes előd- és board proof | Vn.0 indítása két külön megerősítéssel | Csak SharePoint manifest/claim/baseline | Korábbi Vn-1 újraírás, újabb párhuzamos session |
| RESUME_DRAFT | Meglévő, ellenőrzött Vn.X megnyitása | Megnyitáskor csak olvasás | Új session, régi verzió választása |
| ACTIVE/SAVED Vn.X | Tervezés, DRAFT mentés, tervellenőrzés, majd Approved jóváhagyás az aktuális revízióra | DRAFT/Approved SharePoint; 0 Monday | Legacy pilot, korábbi sync, következő ciklus |
| Jóváhagyott terv | Szinkronelőnézet, majd a jóváhagyott terv naplózott visszaírása | Csak explicit kettős sync-jóváhagyás után Monday | DRAFT szerkesztés, új ciklus |
| Igazolt részleges sync prefix | Folytatás a következő igazoltan még nem írt feladattal | Új kifejezett engedély; naplózott egyetlen kísérlet/feladat | Már igazolt feladat újraírása |
| Bizonytalan/hiányos/sérült | Csak olvasási ellenőrzés és kézi egyeztetés | Nincs automatikus írás | Új session, vak retry, lezárás |
| SYNC_COMPLETED | Ellenőrzött következő ciklus felismerése | Csak olvasás, amíg nincs új jóváhagyás | Régi sync ismétlése |
| Nem támogatott verzió | Kifejezett blokkolt állapot | Nincs írás | Látszólag működő Vx gomb |

A gombok megjelenítését az igazolt állapot vezérelje; nem puszta fájlnév, lokális flag vagy önálló inventory. Pending művelet alatt csak releváns folyamatjelzés és biztonságos megszakítás, hiba után explicit következő olvasási művelet. A fejlesztői diagnosztika külön mód, nem az aktuális elfogadási teszt fő folyamata. A vizuális elrejtés nem jogosultsági védelem: a backend/bridge őrök továbbra is kötelezőek. A CI-ben a legacy tesztek maradnak, a kézi UI-ban nem kell az összes régi tesztet újrajátszani. Először a jelenlegi V3 acceptance állapotot állítjuk helyre; ne kapcsoljunk be V4+ funkciót csak a névszabály miatt.

## 4. Mostani elakadás és konkrét kódaudit

Felhasználói bizonyíték: V2 lezárt, V3 START_NEXT korábban megjelent, két megerősítés után nem jelent meg ACTIVE V3.0; később az olvasó ellenőrzés Failed to fetch hibát adott. A legutóbbi Uploader V3 inventory Session/Drafts/Approved/Sync = 0; ez csak fájllista, nem független teljes láncigazolás. A legutóbbi Monday-képen a projekt-felismerési panel hiányzik, mert a V3 inventory nem küld Approved V1 handoff-ot. A valódi V3 session állapotát friss teljes olvasással kell megerősíteni.

Forráskódból igazolt problémák:
- `renderPlanningDiscovery` csak `approvedV1Selected` után renderel; `inspectCurrentPlanning` selectedApprovedV1-et igényel. Uploader `inspectApprovedV1ForSync` küldi az `approvedForSync` handoff-ot; az önálló V3 inventory nem. A régi V1/V2 mutációs gombok így szükségtelenül jelennek meg.
- `startNextPlanningDraft` ismételt teljes board- és projektolvasást végez. Az Uploader planning-begin újra inspectel; a planning gate még kétszer snapshotot készít; a V3 store a V2 proofot újraolvassa és többször ellenőrzi. Eközben a 120 másodperces board proof lejárhat. Ez konkrét szerkezeti kockázat, nem bizonyított magyarázat az adott felhasználói Failed to fetch hibára.
- `versioned-draft-storage` nem vizsgálhat Approved/Sync fájlokat. `project-live-state-adapter` ma csak V3 ACTIVE vagy bizonyos hiányos állapotokat képez le, nem fedi a teljes Approved/Sync életciklust; külön Approved reopen út létezik. A generikus resolver önmagában nem elég.
- A korábbi hibadiagnosztika a Monday és Uploader olvasási szakaszokat elkülöníti, de a tényleges böngészős hálózati hibát még nem igazoltuk. A szintetikus CI nem helyettesíti a böngészős elfogadást.

### Biztonsági korlátok

Csak TEST board 5107075373 és elkülönített Uploader /test/; production nem változik. V1/V2 nyugtákat nem migrálunk vagy írunk felül. SharePoint create-only/conflict-fail, SHA/eTag visszaolvasás; bizonytalan írás után nincs automatikus retry. Új sessionhez teljes előd proof és friss board-egyezés; részleges sessionnél ugyanazon azonosító kézi egyeztetése, nem új V3. A Monday-szinkron előnapló → egy írási kísérlet → item + board readback → eredmény → teljes zárónyugta. Sem kódreview, CI, sem deploy nem hozhat létre valódi felhasználói tervet vagy írhat Monday feladatot.

## 5. Következő munkacsomagok (sorrend és kilépési feltételek)

**A — Aktuális V3 hiba és UI fókusz (most).** A tényleges projekt-bootstrappot felhasználói szinten átnevezni/elkülöníteni, a már lezárt V1/V2 pilot- és szinkronvezérlőket eltávolítani a V3 elfogadási nézetből. A V3 inventory csak diagnosztika, nem session-aktiválás. Az indítás hosszú, ismétlődő proof-olvasásának auditja és biztonságos rövidítése vagy frissebb, konkrét művelethez kötött board proof. Hiba pontos szakasz, nulla automatikus írás, részleges V3 blokkolás. Regresszió a tényleges trigger/böngészőüzenet sorrendjére, ne csak szövegmintára. Kilépés: ugyanaz a V3 session igazolt ACTIVE vagy ellenőrzött, egyértelműen blokkolt állapot; nincs korábbi tesztgomb-kerülőút.

**B — V3 teljes elfogadási teszt.** Friss projektkapcsolat/olvasás → aktuális ciklus felismerése → indítás vagy meglévő megnyitása → egy ismert TEST feladat DRAFT-revíziója → Approved → szinkronelőnézet → explicit jóváhagyott TEST írás → zárónyugta → V4 readiness → újranyitás, ismételt írás nélkül. Ne kérjük a V1/V2 korábbi írásos tesztjeinek megismétlését. Csak hibánál megállás. Valódi Graph/Monday teszt külön felhasználói engedéllyel, sikeres CI után.

**C — Teljes Vx motor.** Általános verzió-felismerés (V0/legacy olvasók + Vn tárolóadapter); Approved/Sync/closed state egységes leképezése; Vn elődlánc ellenőrzése, nem fix V2 proof; név, manifest, RPC, UI, jogosultság és zárónyugta dinamikus verziókötése; V4 és V5 szintetikus többszörös ciklus, drift/partial/restart/duplikált session, majd valós TEST elfogadás. Csak ezután állítható, hogy Vx működik. Nem egyszerűen a version===3 ellenőrzések eltávolítása.

**D — Végleges felület és kiadási kapu.** Közös állapotmodell, egy projektbelépési pont, csak aktuális műveletet mutató UI, régi diagnosztikai funkciók elkülönítése, teljes böngészős mock kétablakos teszt, majd kontrollált TEST környezetben end-to-end ellenőrzés. Meglévő üzleti logika regressziója. Production migráció csak külön döntéssel.

Minden munkacsomaghoz dokumentált commit, automatizált teszt, kiadási státusz (külön: code/CI/deploy/user acceptance) és pontos következő emberi teendő szükséges. Nem kérünk egymást követő kézi teszteket pusztán diagnosztikai feliratok változtatásáért. A jelenlegi A csomag elakadásának feloldásáig a V3 írásos teszt szünetel.

## 6. Források és további olvasás

- Flow-LPS: `docs/DRAFT_WORKSESSION_ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROJECT_START_SCOPE.md`, `docs/PATCH_BATCH_BOOKMARK.md`; `src/main.js`, `src/ui/view.js`, `src/adapter/draft-session-link.js`, `src/adapter/versioned-full-sync.js`.
- Flow-LPS-Uploader: `docs/GENERIC_VERSION_STORAGE.md`, `docs/PATCH_BATCH_BOOKMARK.md`; `app.js`, `single-draft-session-storage.js`, `single-draft-session-bridge.js`, `project-live-state-adapter.js`, `project-planning-action-gate.js`, `planning-start-flow.js`, `versioned-draft-storage.js`, `version-workspace-layout.js`.
- Ez az audit a fenti releváns fájlokat és a TEST workflow-kat vizsgálta, nem a teljes kódbázis minden üzleti algoritmusának újra-auditja. Az élő böngészős/network hiba oka és a valós V3 elfogadás továbbra is nyitott.

## 2026-11-26 – Aktuális TEST belépési pont és V3-indítás javítása

- A kiadott TEST nézet fókuszált: Projekt megnyitása → az Uploaderben Projektkapcsolat ellenőrzése és átadása → automatikus, kizárólag olvasási projektfelismerés. A legacy V1/V2 igazolások belső kompatibilitási források; a korábbi teszt-, írási és indítógombok nem részei az aktuális V3 acceptance felületnek. Az Uploader V3 fájllistája csak diagnosztika, nem trigger. Az aktív V3 DRAFT előtt a tervezési műveletek nem érhetők el.
- A V3 kezdés külön `planning-consent` és `planning-begin` RPC. Két tényleges jóváhagyás után az Uploader egyszer használható, legfeljebb 120 másodpercig érvényes engedélyt ad; a Monday ezután friss teljes boardot olvas, ellenőrzi az egyezést, majd átadja az engedélyt. Megváltozott felhasználó, kapcsolat, board vagy lejárt/felhasznált engedély blokkol. A SharePoint-létrehozás a jóváhagyások előtt nem indulhat el.
- Per-store, memóriabeli, méretkorlátos igazolt JSON-cache: csak frissen egyező Graph file id, név, eTag és méret esetén használható; máskor teljes újraolvasás és hash. Nem marad tartósan eltárolt token vagy hibás/hiányzó fájleredmény. Ez csökkenti a történeti bizonyítékok ismételt letöltését, de nem bizonyítja az eredeti élő Failed to fetch hiba konkrét hálózati okát.
- A V3 Approved/sync fázis külön ellenőrzött olvasóval jelenik meg az aktuális állapotban. Hiányos vagy kétes bizonyíték nem eredményez új indítást. A tényleges Graph Sync ahead/result fájlnevek hibás regexe javítva. A leállítás gomb szinkron közben használható.
- Uploader teljes regresszió: [45857235453](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/45857235453) SUCCESS (új permit, cache, Graph journal path, lifecycle projection és integrált V3.0 tesztekkel). Monday V2 és V3 cross-repo regresszió: [45856766025](https://github.com/gergokek/Flow-LPS/actions/runs/45856766025), [45856765587](https://github.com/gergokek/Flow-LPS/actions/runs/45856765587) SUCCESS; új fókuszált UI teszt: [45857291108](https://github.com/gergokek/Flow-LPS/actions/runs/45857291108) npm test SUCCESS, a teljes workflow állapota a linken ellenőrizhető.
- Kiadás csak a két izolált TEST alkalmazásba, együtt frissítendő protokoll. Valós felhasználói Monday/SharePoint projektírás nem történt. Az aktuális javítás szintetikus tesztje nem helyettesíti a felhasználó kétablakos, élő Graph/Monday acceptance ellenőrzését. V4 indítása nem engedélyezett.

Következő acceptance: mindkét új TEST kiadás SUCCESS után frissen megnyitott projektkapcsolat. V3 állapot automatikus felismerése; START_NEXT esetén egyetlen V3.0 indítási próba két jóváhagyással, RESUME_DRAFT esetén meglévő DRAFT megnyitása, bizonytalan állapot esetén csak olvasás. V1/V2 újraírás nincs. Csak sikeres ACTIVE V3 után jöhet V3.1 szerkesztés/mentés, Approved és külön jóváhagyott TEST sync, majd V4 readiness. A valódi általános Vx motor és a teljes új, összehangolt böngészős acceptance regresszió továbbra is következő fejlesztési csomag.


## 2026-11-27 – V3 élő TEST elfogadási mérföldkő

A felhasználó kétalkalmazásos képernyőképe alapján V3.2 Approved Plan visszaellenőrizve, teljes Monday TEST szinkron visszaellenőrizve: 2 feladat igazolt, 0 hátralévő. A Monday kijelzi a V3 lezáró nyugta és a V4 kiinduló állapot igazolását; az Uploader projektkapcsolati állapota ugyanezt erősíti meg. A V3 indítása, revíziómentése, jóváhagyása és tényleges TEST-szinkronja így felhasználói teszten sikeres. A V3 DRAFT szándékosan zárolt. Ez a felhasználó által közölt UI-bizonyíték, nem a SharePoint-nyugták vagy Monday-adatok független auditja. Az Uploader alsó fájllista-panelje továbbra is a korábbi Sync: 0 állapotot mutatja; a panel nem tartalmi igazolás, frissítése és az aktuális állapot egységes megjelenítése szükséges. A friss kapcsolatból történő lezárt V3 újranyitás és a megismételt írás kizárásának élő ellenőrzése még nincs dokumentálva; csak olvasással kell ellenőrizni, nem a V3 szinkron ismétlésével. A V4 tényleges létrehozása továbbra is tiltott. Következő fejlesztés: C munkacsomag, közös Vn életciklus, dinamikus előd- és zárónyugta-ellenőrzés, V4/V5 szintetikus ciklusok, az aktuális állapothoz kötött trigger és UI. Nincs új V4-specifikus párhuzamos motor. A korábbi hálózati hiba pontos oka továbbra sem igazolt, de a javított folyamat a felhasználói teszten sikeresen végigment.

## 2026-11-27 – C munkacsomag, Vx közös motor és hitelesített projektolvasó

A felhasználó által sikeresen lezárt V3.2 TEST ciklus után a V4/V5 működést nem külön motorokkal, hanem az azonos Vn szerződések általánosításával folytattuk.

### C1 – közös motor: kész, szintetikusan igazolt
- Közös `versioned-cycle-version.js`, `versioned-draft-contract.js`, `versioned-approval-core.js`, `versioned-lineage-contract.js`, `versioned-sync-contract.js`, `versioned-next-cycle-proof.js`. A korábbi importútvonalak kompatibilitási re-exportként megmaradtak. A V3 fájlnevek, schemaVersion és V3_SYNC_COMPLETED nyugtatartalma változatlan. Az eredeti V2 inspector a történeti lánc gyökere. V3 felett minden megelőző ciklus nyers manifest/claim/DRAFT-revízió/freeze/Approved/approval/sync napló/zárónyugta alapján újraépül; hiányzó, felcserélt, ismételt, hiányosan szinkronizált vagy sérült ciklus tiltja a továbblépést. Nem fogadunk el böngészőtől kapott "verified" flaget vagy kész approval modelt előd-bizonyítékként.
- Uploader DRAFT, approval source, approval storage, sync storage és Graph adapter explicit verzióparaméterrel működik (V3 alapértelmezés a jelenleg telepített kliens kompatibilitásához). Az útvonalak és dokumentumtípusok a példányhoz kötöttek; create-only, konfliktus esetén tiltás, SHA/eTag visszaellenőrzés. A lezáró státusz verziófüggő, a következő verzió readiness csak olvasás, startEnabled:false.
- Monday `versioned-full-sync.js` egyetlen verzióparaméteres végrehajtó. A kiválasztott verzió az összes RPC-ben kötött; az előnézet és az írási engedély más verzióhoz nem használható. Feladatonként egyszeri kísérlet, előnapló és item/full-board readback, bizonytalan eredmény esetén stop. A board proof időbélyege a tényleges snapshot olvasásához kötött. A V3 legacy v4-ready RPC megmaradt; V4+ számára next-ready.
- Az első böngészős regresszió körkörös ESM betöltési hibát talált. A tiszta artifact/approval mag és a lineage modul szétválasztásával megszűnt; a böngészős és buildregresszió ezután SUCCESS.

### C2 – közös csak olvasó forrás és projektállapot: kész, szintetikusan igazolt
- Uploader `versioned-evidence-reader.js` olvassa a teljes verziómappát: kötött név/útvonal, tartalmi SHA, eTag, azonosító, egyedi fájlok, folyamatos DRAFT-revíziók és teljes listázás előtte/utána. Az approval source ezt használja. A finalization olvasó a sync naplókat is betölti; a lifecycle validátorok külön igazolják azok jelentését.
- `versioned-project-reader.js` a V2 gyökértől az összes későbbi, folytonos, lezárt ciklust igazolja és aktuális board fingerprint alapján választ: START_NEXT, RESUME_DRAFT, CONTINUE_FINALIZATION, MANUAL_REVIEW. Előkészített üres mappa nem aktív session; részleges manifest/claim, hiányos jóváhagyás, bizonytalan írás vagy board drift nem indíthat új tervet. A reader nem tartalmaz create/append/Monday writer hívást. `completedPredecessor` a valódi fájlolvasásból szolgáltat nyers előd-bizonyítékot a Vn tárolók számára.
- Kereszt-repo integráció `scripts/vx-lifecycle-integration.mjs`: valódi szintetikus V1/V2 előzmény, majd azonos DRAFT szerkesztő, tároló, approval, journal és Monday executor V3, V4, V5 teljes ciklusban. A nyers SharePoint-fájltár alapú projektolvasó mindhárom életciklus állapotát és a következő verziót felismeri. Lezárt újranyitásnál nincs további írás; minden történeti fájl bájtra változatlan. Tesztek elutasítják a hiányos/cserélt/sérült elődláncot, board driftet és részleges V6 manifestet. V4/V5 Graph adapter confinement tesztek is sikeresek.

### Ellenőrzött commitok és CI
- Uploader kód: `1cdab8e0428873d5bf40ab867b881eb287fa76d0`, `fec2d8edb2515a080537c910a9273c2a03a2628b`, `37f4702ef986edf8c5313362f333f5b203c06326`, `5a5e628b5e3206e4ed61ba50e18c89f14e53f2ff`.
- Monday kód: `5c60ea7f7d6c2324acb8bda4e1f01ede7f998153`, `40f248874223f031560e412eb13a9fe88cabe750`, `e425473e657a7c555ad47b977f8c9c6cdf888bb8`, `3f448452153c5ca6bb7e166183b7f20426760b93`, `bb623e2456678397d389ddd42edf1adbe8543281`.
- [Vx cross-repo CI 46012021652](https://github.com/gergokek/Flow-LPS/actions/runs/46012021652): SUCCESS, 39/39 teszt, 0 hiba, megosztott szerződések bájtszinten azonosak. A workflow az Uploader pontos `5a5e628b5e3206e4ed61ba50e18c89f14e53f2ff` commitjára pinelt; a következő közös csomagnál ezt frissíteni kell.
- [Uploader regresszió 46011938194](https://github.com/gergokek/Flow-LPS-Uploader/actions/runs/46011938194): SUCCESS. [Monday browser/build 46011628191](https://github.com/gergokek/Flow-LPS/actions/runs/46011628191): SUCCESS, deploy skipped. [V3 kompatibilitási cross-repo 46011495605](https://github.com/gergokek/Flow-LPS/actions/runs/46011495605): SUCCESS.

### Még nem aktív, következő C3/D csomag
A jelenlegi telepített UI és browser bridge továbbra is V3-hoz kötött. Nem adtunk ki új V4 indítógombot, nem módosítottunk release markert; a C1/C2 kód a TEST ágakon van, nem új élő TEST release. Az általános projektolvasót a valós Uploader-kapcsolathoz és verzióhoz kötött store factoryhoz kell kapcsolni. A planning-consent/begin, DRAFT handoff/append, Approved/sync, next-ready RPC-k minden szakaszán a szerveroldali (Uploader) aktuális verzió és session ellenőrzése; régi V1 bootstrap belső kompatibilitás vagy önálló projektkapcsolat. A Monday current-project state, consent panelek, editor és végleges UI dinamikus címkézése; lezárt ciklusban kizárólag következő terv indításának lehetősége, aktív DRAFT-nál szerkesztés/jóváhagyás, Approved-nál sync, bizonytalannál csak olvasás. Az Uploader elavult inventory/DRAFT szövegeinek automatikus frissítése. Kétablakos mock böngészős regresszió a V4/V5 teljes útvonalra, majd együtt kiadott TEST release és egyetlen összevont felhasználói teszt. Nem szükséges a felhasználónak a már lezárt V3 szinkront megismételnie. Valós Monday- vagy SharePoint-projektadatot nem írtunk; a Vx böngészős élő elfogadás még hátravan.
