import { PublicClientApplication, BrowserCacheLocation } from '@azure/msal-browser';
import { validatePlanPreview } from './plan-validator.js';
import { uploadTestPreview } from './sharepoint-upload.js';
import { verifyExistingTest } from './verify-upload.js';
import {createProjectStorage} from './project-storage.js';
import {validateDraftTransfer} from './draft-transfer-validator.js';
import {saveDraftTransfer} from './draft-save.js';
import {verifyDownloadedDraft} from './draft-content-verifier.js';
const clientId='3a2cf530-d7a7-4e48-bb90-023d7e293e7a';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const redirectUri=new URL('./redirect.html',window.location.href).href;
const button=document.querySelector('#login');
const status=document.querySelector('#authResult');
const graphButton=document.querySelector('#checkSharePoint');
const graphResult=document.querySelector('#sharePointResult');
const driveId='b!YBiCN3mDjkCA0zlGakoS1F6FNi-WzO5Ip7eBTLppUVCRBefvaJ27TYm2xryC37MY';
const projectBoard=document.querySelector('#projectBoardId');
const projectSetup=document.querySelector('#setupProject');
const projectResult=document.querySelector('#projectResult');
const uploadButton=document.querySelector('#uploadTest');
const uploadResult=document.querySelector('#uploadResult');
const verifyButton=document.querySelector('#verifyExisting');
const verifyResult=document.querySelector('#verifyResult');
const verifyFilename=document.querySelector('#verifyFilename');
let validatedPreview=null;
let draftTransferText=null;
const draftSaveButton=document.querySelector('#saveDraft');
const draftSaveResult=document.querySelector('#draftSaveResult');
const draftVerifyButton=document.querySelector('#verifyDraftContent');
const downloadedDraft=document.querySelector('#downloadedDraft');
const draftContentResult=document.querySelector('#draftContentResult');
const msal=new PublicClientApplication({
 auth:{clientId,authority:'https://login.microsoftonline.com/'+tenantId,redirectUri,navigateToLoginRequestUrl:false},
 cache:{cacheLocation:BrowserCacheLocation.SessionStorage,storeAuthStateInCookie:false}
});
function showAccount(account){
 graphButton.disabled=!account;
 projectSetup.disabled=!account;
 uploadButton.disabled=!account || !validatedPreview;
 verifyButton.disabled=!account;
 draftSaveButton.disabled=!account||!draftTransferText;
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
let projectBusy=false;
projectSetup.addEventListener('click',async()=>{
 if(projectBusy)return;
 const boardId=projectBoard.value.trim();
 if(!/^\\d{5,20}$/.test(boardId)){projectResult.textContent='Adj meg ervenyes numerikus Monday Board ID-t.';return;}
 const account=msal.getAllAccounts()[0];
 if(!account){projectResult.textContent='Elobb jelentkezz be Microsoft-fiokkal.';return;}
 if(!window.confirm('Letrehozzuk a hianyzo mappakat a Flow-LPS-Storage / Projects / '+boardId+' utvonalon? Meglevo fajlokat nem modositunk.'))return;
 projectBusy=true;projectSetup.disabled=true;projectResult.textContent='Projektmappak ellenorzese es elokeszitese...';
 try{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  let auth;
  try{auth=await msal.acquireTokenSilent(request);}
  catch(err){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(err?.errorCode))throw err;auth=await msal.acquireTokenPopup(request);}
  const store=createProjectStorage({driveId,getAccessToken:async()=>auth.accessToken});
  const result=await store.ensure(boardId);
  projectResult.textContent='Projekt tarhely ellenorizve: '+result.path+'\\nAlmappak: '+result.folders.join(', ')+'\\nIgazolas: mappa-metaadatok. Monday adatok valtozatlanok.';
 }catch(err){projectResult.textContent='A projekt tarhely elokeszitese sikertelen: '+(err?.message||'ismeretlen hiba');}
 finally{projectBusy=false;projectSetup.disabled=!msal.getAllAccounts().length;}
});
document.querySelector('#draftTransferFile').addEventListener('change',async event=>{
 draftTransferText=null;draftSaveButton.disabled=true;draftSaveResult.textContent='Nincs DRAFT feltoltes inditva.';
 const output=document.querySelector('#draftTransferResult');
 const selected=event.target.files?.[0];
 if(!selected){output.textContent='Nincs fajl kivalasztva.';return;}
 try{
  if(selected.size>5_000_000)throw new Error('Tul nagy fajl.');
  const boardId=document.querySelector('#projectBoardId').value.trim();
  const content=await selected.text();
  const draft=await validateDraftTransfer(content,{expectedBoardId:boardId});
  draftTransferText=content;draftSaveButton.disabled=!msal.getAllAccounts().length;draftVerifyButton.disabled=!downloadedDraft.files?.length;
  output.textContent='DRAFT ellenorzes sikeres. Board: '+draft.boardId+'; feladatok: '+draft.taskCount+'; SHA-256: '+draft.sha256+'. Nem kerult SharePointra es nincs jovahagyva.';
 }catch(err){output.textContent='DRAFT ellenorzes sikertelen: '+(err?.message||'ismeretlen hiba');}
});
downloadedDraft.addEventListener('change',()=>{draftVerifyButton.disabled=!draftTransferText||!downloadedDraft.files?.length;draftContentResult.textContent='Nincs ellenorzes.';});
draftVerifyButton.addEventListener('click',async()=>{
 draftVerifyButton.disabled=true;
 try{
  if(!draftTransferText)throw new Error('Valaszd ki az eredeti DRAFT atadasi fajlt.');
  const file=downloadedDraft.files?.[0];
  if(!file||!/^draft-[A-Za-z0-9_-]{8,100}\\.json$/.test(file.name))throw new Error('Valaszd ki a SharePointbol letoltott draft-*.json fajlt.');
  if(file.size>5_000_000)throw new Error('A DRAFT fajl tul nagy.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const result=await verifyDownloadedDraft({transferText:draftTransferText,downloadedBytes:bytes,boardId:projectBoard.value.trim()});
  draftContentResult.textContent='TELJES DRAFT TARTALMI EGYEZES. Board: '+result.boardId+'; feladatok: '+result.taskCount+'; meret: '+result.bytes+' byte; SHA-256: '+result.sha256+'.';
 }catch(err){draftContentResult.textContent='DRAFT tartalmi ellenorzes sikertelen: '+(err?.message||'ismeretlen hiba');}
 finally{draftVerifyButton.disabled=!draftTransferText||!downloadedDraft.files?.length;}
});
let draftSaveBusy=false;
draftSaveButton.addEventListener('click',async()=>{
 if(draftSaveBusy||!draftTransferText)return;
 const boardId=projectBoard.value.trim(),account=msal.getAllAccounts()[0];
 if(!account){draftSaveResult.textContent='Microsoft bejelentkezes szukseges.';return;}
 const transfer=draftTransferText;
 try{await validateDraftTransfer(transfer,{expectedBoardId:boardId});}
 catch(e){draftTransferText=null;draftSaveButton.disabled=true;draftSaveResult.textContent='Ujra kell ellenorizni a DRAFT fajlt: '+e.message;return;}
 if(!window.confirm('Uj, nem jovahagyott DRAFT verziot hozunk letre: Projects/'+boardId+'/Draft-Plans. A muvelet nem ir a Monday-ra. Folytatod?'))return;
 draftSaveBusy=true;draftSaveButton.disabled=true;draftSaveResult.textContent='DRAFT feltoltes es metaadat ellenorzes...';
 try{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  const getAccessToken=async()=>{
   try{return (await msal.acquireTokenSilent(request)).accessToken;}
   catch(e){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;return (await msal.acquireTokenPopup(request)).accessToken;}
  };
  const versionId='v'+Date.now().toString(36)+'-'+crypto.randomUUID().slice(0,12);
  const result=await saveDraftTransfer({transferText:transfer,boardId,driveId,getAccessToken,versionId});
  draftSaveResult.textContent='DRAFT mentve: '+result.path+'\\nMeret: '+result.bytes+' byte; SHA-256: '+result.sha256+'\\nIgazolas: csak metaadat. A teljes SharePoint-tartalom visszaolvasasa meg nem igazolt. Nem jovahagyott es nem Monday-szinkronizalt.';
 }catch(e){draftSaveResult.textContent='DRAFT mentes vagy ellenorzes hibas: '+(e?.message||'ismeretlen')+'. A fajl esetleg mar letrejott; ujraprobalas elott ellenorizd a mappat.';}
 finally{draftSaveBusy=false;draftSaveButton.disabled=!draftTransferText||!msal.getAllAccounts().length;}
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

verifyButton.addEventListener('click',async()=>{
 const account=msal.getAllAccounts()[0];
 if(!account){verifyResult.textContent='Előbb jelentkezz be.';return;}
 verifyButton.disabled=true;
 verifyResult.textContent='Meglévő tesztfájl ellenőrzése a Graph API-n keresztül...';
 try{
  const auth={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  let token;
  try{token=await msal.acquireTokenSilent(auth);}
  catch(e){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;token=await msal.acquireTokenPopup(auth);}
  const checked=await verifyExistingTest({driveId,boardId:expectedBoard,filename:verifyFilename.value.trim(),token:token.accessToken});
  verifyResult.textContent='SharePoint fájl igazolva.\\nFájlnév: '+checked.filename+'\\nMéret: '+checked.size+' bájt\\nFájlazonosító: '+checked.id+'\\nTeljes tartalmi egyezés: még nem igazolt (a böngészős letöltést CORS blokkolhatja).';
 }catch(e){verifyResult.textContent='Ellenőrzés sikertelen: '+(e?.message||e?.errorCode||'ismeretlen hiba');}
 finally{verifyButton.disabled=!msal.getAllAccounts().length;}
});

const downloadedFile=document.querySelector('#downloadedFile');
const compareButton=document.querySelector('#compareFiles');
const compareResult=document.querySelector('#compareResult');
async function hexSha256(bytes){
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
compareButton.addEventListener('click',async()=>{
 compareResult.textContent='Bájtok és SHA-256 ellenőrzése...';
 try{
  if(!validatedPreview)throw new Error('Előbb válaszd ki az eredeti TEST_ONLY tervelőnézetet.');
  const chosen=downloadedFile.files?.[0];
  if(!chosen)throw new Error('Válaszd ki a SharePointból letöltött JSON-fájlt.');
  if(chosen.size>5_000_000)throw new Error('A fájl túl nagy.');
  const filename=verifyFilename.value.trim();
  if(chosen.name!==filename)throw new Error('A letöltött fájl neve nem egyezik a megadott SharePoint-fájlnévvel.');
  const expected=new TextEncoder().encode(JSON.stringify(validatedPreview,null,2)+'\n');
  const actual=new Uint8Array(await chosen.arrayBuffer());
  const expectedHash=await hexSha256(expected);
  const actualHash=await hexSha256(actual);
  if(expectedHash!==actualHash || expected.length!==actual.length)throw new Error('A két fájl SHA-256 ellenőrzőösszege eltér. Eredeti méret: '+expected.length+', letöltött méret: '+actual.length+'.');
  compareResult.textContent='TELJES TARTALMI EGYEZÉS IGAZOLVA.\nFájlnév: '+filename+'\nMéret: '+actual.length+' bájt\nSHA-256: '+actualHash+'\nA letöltött fájl és az eredeti terv byte-pontosan egyezik. Monday-board: változatlan.';
 }catch(e){compareResult.textContent='Az ellenőrzés nem sikerült: '+(e?.message||'ismeretlen hiba');}
});
