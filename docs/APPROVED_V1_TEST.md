# TEST V1.X → Approved Plan V1 – felülírásmentes jóváhagyás

2026-11-25. Csak `feat/test-single-draft-session`, külön `/Flow-LPS-Uploader/test/` webes előnézet, TEST board `5107075373`. A `main` és a jelenlegi gyökérweboldal nem módosul.

## Felhasználói folyamat

1. Microsoft-bejelentkezés `openid`, `profile`, `User.Read` és az íráshoz továbbra is a `Sites.Selected` engedéllyel. Aktív DRAFT folytatása; a Monday TEST V1.X verziót kap.
2. Monday legalja: **1. Tervellenőrzés (csak olvasás)**. Az összes módosult feladat és mező előtte/utána listája, forrás SHA-256, friss teljes board-readback.
3. **2. V1.X jóváhagyása → Approved Plan V1** – külön Monday megerősítés. Uploader postMessage origin/nonce, session, verzió, legutolsó DRAFT SHA-256 és friss board ellenőrzőösszeg kötés.
4. Uploader `store.approve()` újraolvassa a SharePoint V0-t, az aktív session claim-et és az egész V1.X verzióláncot; megerősíti, hogy a Microsoft bejelentkezett `homeAccountId` megegyezik a session létrehozójával. A külön `User.Read` tokennel Graph `/me` visszaellenőrzi az Entra object ID-t.
5. `Draft-Plans/session-v1-freeze.json` létrehozása `conflictBehavior=fail` mellett; újabb teljes V1.X visszaolvasás és SHA-256 egyezés.
6. `Approved-Plans/approved-v1.json` változtathatatlan tervmásolat létrehozása, teljes SHA-256/eTag readback. Nem `approved-v4.json`: az Approved Plan üzleti verziója **V1**, a `draftVersion` mező őrzi az utolsó részverziót (például 4).
7. `Draft-Plans/session-v1-approved.json` utólagos nyugta, újabb állapotellenőrzéssel. Az Uploader `APPROVED_PLAN_V1_STORED` nyugtát küld vissza a Mondaynek; nulla Monday-írás.

## Hiba és helyreállítás

- A `session-v1-freeze.json` megléte blokkolja az új DRAFT-mentést és a normál session resume műveletet.
- Ha az Approved Plan létrehozása bizonytalan, **nem** indul újra a mentés, és a SharePoint aktuális állapotát kézzel kell egyeztetni. A browser bridge ugyanezen kapcsolatból nem fogad el ismételt jóváhagyást.
- Meglévő `approved-v1.json` soha nem írható felül. Az Approved Plan V1 mentése nem indít Monday syncet.
- A V1.1–V1.X−1 fájlok törlését és a V2 session-claim felszabadítását még **nem** valósítottuk meg. Ezeket csak teljes, biztonságosan szinkronizált terv utáni külön fejlesztésben kezeljük.
- Browser postMessage és SHA-256 check nem állít elő szerveroldali hitelesítést; a Microsoft Graph és a Monday jogosultsági rétegek külön érvényesek. Monday és SharePoint között nincs elosztott lock, ezért a külső versenyhelyzet kockázata nem szűnik meg teljesen.

## Fájlok és teszt

`single-draft-approval-core.js`, `single-draft-session-storage.js`, `single-draft-session-bridge.js`, `app.js`, `index.html`. Tesztek: `single-draft-session-storage.test.js`, `single-draft-session-bridge.test.js`. Monday kód és regresszió: `docs/APPROVED_V1_WORKFLOW.md`.

Nem végzett automatikus éles board-módosítást. A valós bejelentkezett V1.X jóváhagyási műveletet a közös TEST telepítés után egyetlen, felhasználó által megerősített próba fogja igazolni.
