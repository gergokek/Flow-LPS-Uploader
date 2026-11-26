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
