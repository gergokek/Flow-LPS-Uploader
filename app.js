import { PublicClientApplication, BrowserCacheLocation } from '@azure/msal-browser';
const clientId='3a2cf53d-07a7-4e48-bb90-023d7e293e7a';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const redirectUri=new URL('./redirect.html',window.location.href).href;
const button=document.querySelector('#login');
const status=document.querySelector('#authResult');
const msal=new PublicClientApplication({
 auth:{clientId,authority:'https://login.microsoftonline.com/'+tenantId,redirectUri,navigateToLoginRequestUrl:false},
 cache:{cacheLocation:BrowserCacheLocation.SessionStorage,storeAuthStateInCookie:false}
});
function showAccount(account){
 if(!account){status.textContent='Nincs aktív Microsoft-bejelentkezés. A próba nem kér SharePoint-jogosultságot.';return;}
 status.textContent='Sikeres Microsoft-bejelentkezés.\nNév: '+(account.name||'—')+'\nFiók: '+(account.username||'—')+'\nSharePoint-hozzáférés: még nincs engedélyezve.';
}
msal.initialize().then(()=>{
 const account=msal.getAllAccounts()[0]||null;
 showAccount(account);
 button.disabled=false;
}).catch(()=>{status.textContent='A Microsoft bejelentkezési modul nem inicializálható.';});
let loginPending=false;
let retryPendingInteraction=false;
button.addEventListener('click',async()=>{
 if(loginPending)return;
 loginPending=true;
 button.disabled=true;
 status.textContent='Microsoft-bejelentkezési ablak megnyitása...';
 try{
  const response=await msal.loginPopup({scopes:['openid','profile'],redirectUri,prompt:'select_account',overrideInteractionInProgress:retryPendingInteraction});
  retryPendingInteraction=false;
  button.textContent='Bejelentkezés Microsoft-fiókkal';
  showAccount(response.account);
 }catch(err){
  const code=typeof err?.errorCode==='string'?err.errorCode:'auth_error';
  if(code==='interaction_in_progress'||code==='timed_out'){
   retryPendingInteraction=true;
   button.textContent='Bejelentkezés újrapróbálása';
   status.textContent='Korábbi vagy megszakadt bejelentkezés maradt folyamatban ('+code+'). Zárd be a korábbi Microsoft-ablakot, majd kattints az újrapróbálásra. Csak ekkor töröljük a függőben maradt popup-folyamatot.';
  }else{
   retryPendingInteraction=false;
   button.textContent='Bejelentkezés Microsoft-fiókkal';
   status.textContent='Sikertelen vagy megszakított bejelentkezés. Hibakód: '+code+'. Ellenőrizd, hogy ez a Redirect URI SPA típussal regisztrált-e az Entra alkalmazásban: '+redirectUri;
  }
 }finally{loginPending=false;button.disabled=false;}
});
const file=document.querySelector('#file');
const result=document.querySelector('#result');
const expectedBoard='5105949528';
file.addEventListener('change',async()=>{
 result.textContent='Ellenőrzés...';
 const chosen=file.files?.[0];
 if(!chosen){result.textContent='Nincs fájl kiválasztva.';return;}
 if(chosen.size>5_000_000){result.textContent='Elutasítva: a fájl túl nagy (5 MB felett).';return;}
 try{
  const obj=JSON.parse(await chosen.text());
  const tasks=obj?.tasks;
  const ids=Array.isArray(tasks)?tasks.map(t=>t?.itemId):[];
  const validForecast=Array.isArray(tasks)&&tasks.every(t=>typeof t?.itemId==='string'&&/^\d+$/.test(t.itemId)&&(!t.forecast||(typeof t.forecast.from==='string'&&typeof t.forecast.to==='string'&&t.forecast.from<=t.forecast.to)));
  if(obj?.schemaVersion!==1||obj?.format!=='flow-lps-plan-preview'||obj?.status!=='TEST_ONLY'||obj?.isApprovedPlan!==false||obj?.boardId!==expectedBoard||!validForecast||obj.taskCount!==ids.length||new Set(ids).size!==ids.length||!Array.isArray(obj.changes)||obj.changeCount!==obj.changes.length){throw Error('Nem megfelelő Flow LPS TEST_ONLY tervelőnézet.');}
  result.textContent='Helyi ellenőrzés sikeres.\nBoard: '+obj.boardId+'\nFeladatok: '+obj.taskCount+'\nVáltozások: '+obj.changeCount+'\nStátusz: TEST_ONLY – nem jóváhagyott, nem feltöltött terv.';
 }catch(e){result.textContent='A fájl nem használható: '+(e instanceof SyntaxError?'érvénytelen JSON.':e.message);}
});
