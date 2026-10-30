import { PublicClientApplication, BrowserCacheLocation } from '@azure/msal-browser';
import { validatePlanPreview } from './plan-validator.js';
import { uploadTestPreview } from './sharepoint-upload.js';
const clientId='3a2cf530-d7a7-4e48-bb90-023d7e293e7a';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const redirectUri=new URL('./redirect.html',window.location.href).href;
const button=document.querySelector('#login');
const status=document.querySelector('#authResult');
const graphButton=document.querySelector('#checkSharePoint');
const graphResult=document.querySelector('#sharePointResult');
const driveId='b!YBiCN3mDjkCA0zlGakoS1F6FNi-WzO5Ip7eBTLppUVCRBefvaJ27TYm2xryC37MY';
const uploadButton=document.querySelector('#uploadTest');
const uploadResult=document.querySelector('#uploadResult');
let validatedPreview=null;
const msal=new PublicClientApplication({
 auth:{clientId,authority:'https://login.microsoftonline.com/'+tenantId,redirectUri,navigateToLoginRequestUrl:false},
 cache:{cacheLocation:BrowserCacheLocation.SessionStorage,storeAuthStateInCookie:false}
});
function showAccount(account){
 graphButton.disabled=!account;
 uploadButton.disabled=!account || !validatedPreview;
 if(!account){status.textContent='Nincs aktív Microsoft-bejelentkezés. A próba nem kér SharePoint-jogosultságot.';return;}
 status.textContent='Sikeres Microsoft-bejelentkezés.\nNév: '+(account.name||'—')+'\nFiók: '+(account.username||'—')+'\nSharePoint-hozzáférés: a külön tesztgombbal ellenőrizhető.';
}
msal.initialize().then(()=>{
 window.__flowAuthBooted=true;
 const account=msal.getAllAccounts()[0]||null;
 showAccount(account);
 button.disabled=false;
}).catch(err=>{
 window.__flowAuthBooted=true;
 status.textContent='A Microsoft bejelentkezési modul nem inicializálható. Hibakód: '+String(err?.errorCode||err?.name||'unknown')+'.';
});
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
// Explicit delegated, read-only check. The token remains in MSAL memory/cache;
// it is never logged, displayed, stored in a file or sent to GitHub.
let graphBusy=false;
graphButton.addEventListener('click',async()=>{
 if(graphBusy)return;
 const account=msal.getAllAccounts()[0];
 if(!account){graphResult.textContent='Előbb jelentkezz be Microsoft-fiókkal.';return;}
 graphBusy=true;graphButton.disabled=true;
 graphResult.textContent='Kizárólag olvasási jogosultság és cél-dokumentumtár ellenőrzése...';
 try{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  let tokenResponse;
  try{tokenResponse=await msal.acquireTokenSilent(request);}
  catch(err){
   if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(err?.errorCode))
    throw err;
   tokenResponse=await msal.acquireTokenPopup(request);
  }
  const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
  async function read(path){
   const response=await fetch(base+path,{method:'GET',headers:{Authorization:'Bearer '+tokenResponse.accessToken,Accept:'application/json'},cache:'no-store'});
   if(!response.ok){
    const problem=await response.json().catch(()=>null);
    const code=problem?.error?.code||'unknown';
    throw new Error('Graph HTTP '+response.status+' ('+code+'). '+(response.status===403?'Ellenőrizd a Sites.Selected hozzájárulást és a Hanoflow site Read jogosultságát.':'Ellenőrizd a dokumentumtár elérését.'));
   }
   return response.json();
  }
  const drive=await read('?$select=id,name,webUrl,driveType');
  if(drive.id!==driveId)throw new Error('Nem a beállított SharePoint dokumentumtár válaszolt.');
  const projects=await read('/root:/Projects:/children?$select=id,name,folder&$top=200');
  const folders=(projects.value||[]).filter(x=>x.folder&&/^[0-9]+$/.test(x.name)).map(x=>x.name);
  graphResult.textContent='Kapcsolat sikeres (csak olvasás).\\nDokumentumtár: '+(drive.name||'Flow-LPS-Storage')+'\\nProjektek (board ID): '+(folders.join(', ')||'nincs elérhető projektmappa')+'\\nTEST_ONLY feltöltés: külön megerősítéssel indítható.';
 }catch(err){
  graphResult.textContent='A SharePoint olvasási teszt nem sikerült: '+(err?.errorCode||err?.message||'ismeretlen hiba')+'. Az alkalmazás nem módosított fájlt.';
 }finally{graphBusy=false;graphButton.disabled=!msal.getAllAccounts().length;}
});
const file=document.querySelector('#file');
const result=document.querySelector('#result');
const expectedBoard='5105949528';
file.addEventListener('change',async()=>{
 validatedPreview=null;
 uploadButton.disabled=true;
 uploadResult.textContent='Nincs feltöltés indítva.';
 result.textContent='Ellenőrzés...';
 const chosen=file.files?.[0];
 if(!chosen){result.textContent='Nincs fájl kiválasztva.';return;}
 if(chosen.size>5_000_000){result.textContent='Elutasítva: a fájl túl nagy (5 MB felett).';return;}
 try{
  const obj=JSON.parse(await chosen.text());
  validatePlanPreview(obj, expectedBoard);
  validatedPreview=obj;
  uploadButton.disabled=!msal.getAllAccounts().length;
  result.textContent='Helyi ellenőrzés sikeres.\nBoard: '+obj.boardId+'\nFeladatok: '+obj.taskCount+'\nVáltozások: '+obj.changeCount+'\nStátusz: TEST_ONLY – nem jóváhagyott, nem feltöltött terv.';
 }catch(e){result.textContent='A fájl nem használható: '+(e instanceof SyntaxError?'érvénytelen JSON.':e.message);}
});

let uploadBusy=false;
uploadButton.addEventListener('click',async()=>{
 if(uploadBusy||!validatedPreview)return;
 if(!msal.getAllAccounts().length){uploadResult.textContent='Jelentkezz be előbb.';return;}
 if(!window.confirm('Valóban feltöltöd a TEST_ONLY JSON-t a SharePoint Projects/'+expectedBoard+'/Upload-Tests mappába? A Monday-board nem változik.'))return;
 uploadBusy=true;
 uploadButton.disabled=true;
 uploadResult.textContent='TEST_ONLY JSON feltöltése és visszaellenőrzése...';
 try{
  const account=msal.getAllAccounts()[0];
  const auth={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  let token;
  try { token=await msal.acquireTokenSilent(auth); }
  catch(err){
   if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(err?.errorCode))throw err;
   token=await msal.acquireTokenPopup(auth);
  }
  const result=await uploadTestPreview({driveId,boardId:expectedBoard,data:validatedPreview,token:token.accessToken,onProgress:message=>{uploadResult.textContent=message;}});
  uploadResult.textContent='Feltöltés és visszaolvasás sikeres.\nHely: Projects/'+expectedBoard+'/Upload-Tests\nFájl: '+result.filename+'\nMéret: '+result.bytes+' bájt\nSHA-256: '+result.sha256+'\nMonday-board: változatlan.';
 }catch(err){uploadResult.textContent='A TEST_ONLY feltöltés vagy ellenőrzés sikertelen: '+(err?.message||err?.errorCode||'ismeretlen hiba')+'\nHa a feltöltés megtörtént, az Upload-Tests mappában tesztfájl maradhat.';}
 finally{uploadBusy=false;uploadButton.disabled=!validatedPreview||!msal.getAllAccounts().length;}
});
