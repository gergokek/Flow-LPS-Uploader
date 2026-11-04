# Approved Plan létrehozása – Flow LPS, 2026-11-04

## Egyetlen szerkesztő/véglegesítő
A Flow LPS-ben nincs külön jóváhagyói szerepkör: a Monday-ben szerkesztési joggal rendelkező felhasználó külön megerősítéssel véglegesítheti a DRAFT-ot. A Monday-ben az editor allowlist böngészőoldali kapu, ezért az ebből érkező editor ID nem szerveroldali jogosultsági bizonyíték. A SharePoint tényleges írását a Microsoft Graph delegált tokenje és a Microsoft/SharePoint hozzáférési szabályok korlátozzák.

## Normál folyamat
1. A Monday TEST-ben szerkesztett DRAFT aktuális változatát az Uploader teljes SHA-256/eTag ellenőrzéssel menti.
2. A Monday újraellenőrzi a board alapállapotát és a szerkesztő azonosítóját.
3. A szerkesztő külön megerősíti a véglegesítési szándékot, amely csak erre a DRAFT-verzióra, boardra, bájtméretre és SHA-256-ra érvényes.
4. Az Uploaderben az „Approved Plan létrehozása SharePointon” gomb kizárólag a beérkezett, aktuális mentéshez tartozó kérelem esetén aktív.
5. A gomb újabb külön megerősítést kér, majd közvetlen Graph DRAFT tartalmi visszaolvasást és Entra /me ellenőrzést futtat.
6. A rendszer új fájlt hoz létre a Projects/{BoardID}/Approved-Plans mappában. A név approved-v{version}-{sourceSHA256prefix}.json, ezért az azonos DRAFT ismételt véglegesítése ütközik.
7. A feltöltés Microsoft Graph createUploadSession kérésben conflictBehavior=fail szabállyal történik, felülírás nélkül. A feltöltés után a teljes új fájlt visszaolvassuk, egyeztetjük a SHA-256-ot, eTag-et, méretet, drive ID-t és fájlazonosítót.
8. Siker esetén a fájl státusza APPROVED, a Monday-szinkron állapota NOT_STARTED. A Monday-board változatlan.

## Approved Plan adatmodell
- schemaVersion=1; format=flow-lps-approved-plan; status=APPROVED; isApprovedPlan=true.
- mondaySyncAllowed=false; syncStatus=NOT_STARTED – maga a SharePoint-fájl nem indíthat Monday-módosítást.
- sourceDraft: eredeti SharePoint-fájlnév, fájlazonosító, eTag, SHA-256, bájtméret, drive ID.
- finalization: Monday-szerkesztő böngészős azonosítója, Microsoft Entra /me objektumazonosítója, tenant, megerősítés ideje, jóváhagyott állapot létrehozásának ideje.
- plan: a DRAFT eredeti alap-snapshotja, szerkesztett working feladatai és verzióelőzménye.

## Hibakezelés
- Elavult vagy eltérő DRAFT, más Microsoft-fiók/tenant, hiányzó Graph DRAFT-visszaigazolás, lejárt megerősítés és már létező fájlnév esetén nincs feltöltés.
- Hálózati hibánál a feltöltés megtörténhetett, ezért az alkalmazás nem próbálkozik automatikusan újra.
- Sikertelen utólagos SHA-256/eTag ellenőrzés esetén nincs sikeres állapot. Az Approved-Plans mappában kézzel ellenőrizni kell az esetleg létrejött fájlt.
- A DRAFT fájlokat sosem írjuk felül, a Monday GraphQL mutation nem része ennek a modulnak.

## Fontos határ és további munka
A böngészős Monday editor ID és a Microsoft Entra identitás között még nincs szerveroldali azonosság-bizonyítás. Ez nem új Entra-jóváhagyói csoport szükségességét jelenti, hanem azt, hogy valóban több felhasználós/éles jogosultsági modellnél ezt a két identitást hitelesen össze kell kapcsolni, vagy a SharePoint-hozzáférési rendszert kell kifejezetten véglegesítési jogosultságként kezelni.

A tényleges Monday-visszaírást külön, explicit, ütközésellenőrzött, tartós checkpointokra épülő szinkronfejlesztés kezeli majd. Az Approved Plan önmagában nem jogosítja fel az Uploadert Monday-mutation indítására.
