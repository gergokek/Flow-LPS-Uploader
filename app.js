import {createSessionDraftAutosave} from './draft-session-autosave.js';
import {attachDraftHandoff} from './draft-handoff-receiver.js';
import {listStoredDraftVersions,loadStoredDraftVersion} from './sharepoint-version-picker.js';
import {verifyGraphDraftContent} from './graph-draft-content-verifier.js';
import {prepareSharePointReviewEvidence} from './sharepoint-review-evidence.js';
import {verifyEditedDraftDownload} from './edited-draft-verifier.js';
import {validateEditedDraft} from './edited-draft-validator.js';
import {mountSavedDraftReview} from './review-preflight-ui.js';
import {mountApprovedPlanAction} from './approved-plan-ui.js';
import { PublicClientApplication, BrowserCacheLocation } from '@azure/msal-browser';
import {createProjectStorage} from './project-storage.js';
import {validateDraftTransfer} from './draft-transfer-validator.js';
import {saveDraftTransfer} from './draft-save.js';
import {verifyDownloadedDraft} from './draft-content-verifier.js';
import {inspectStoredDraft} from './draft-workspace.js';
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
 draftSaveButton.disabled=!account||!draftTransferText;
 editedSave.disabled=!account||!editedDraftText;
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
  if(!file||!/^draft-[A-Za-z0-9_-]{8,100}\.json$/.test(file.name))throw new Error('Valaszd ki a SharePointbol letoltott draft-*.json fajlt.');
  if(file.size>5_000_000)throw new Error('A DRAFT fajl tul nagy.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const result=await verifyDownloadedDraft({transferText:draftTransferText,downloadedBytes:bytes,boardId:projectBoard.value.trim()});
  draftContentResult.textContent='TELJES DRAFT TARTALMI EGYEZES. Board: '+result.boardId+'; feladatok: '+result.taskCount+'; meret: '+result.bytes+' byte; SHA-256: '+result.sha256+'.';
 }catch(err){draftContentResult.textContent='DRAFT tartalmi ellenorzes sikertelen: '+(err?.message||'ismeretlen hiba');}
 finally{draftVerifyButton.disabled=!draftTransferText||!downloadedDraft.files?.length;}
});
document.querySelector('#restoreDraftFile').addEventListener('change',async event=>{
 const output=document.querySelector('#restoreDraftResult');
 const preview=document.querySelector('#restoreDraftPreview');
 preview.replaceChildren();
 const file=event.target.files?.[0];
 if(!file){output.textContent='Nincs fajl kivalasztva.';return;}
 try{
  if(!/^draft-[A-Za-z0-9_-]{8,100}\.json$/.test(file.name)||file.size>5_000_000)throw new Error('Nem megfelelo mentett DRAFT fajl.');
  const draft=inspectStoredDraft(await file.text(),projectBoard.value.trim());
  output.textContent='DRAFT helyben visszatoltve: '+draft.boardId+', verzio: '+draft.version+', feladatok: '+draft.taskCount+'. Csak olvasas.';
  const list=document.createElement('ul');
  for(const task of draft.tasks.slice(0,20)){
   const item=document.createElement('li');
   item.textContent=task.name+' ('+task.id+') – Forecast: '+(task.forecast?task.forecast.from+' – '+task.forecast.to:'nincs');
   list.append(item);
  }
  preview.append(list);
  if(draft.taskCount>20)preview.append(document.createTextNode('Az elonezet az elso 20 feladatot mutatja.'));
 }catch(err){output.textContent='DRAFT visszatoltes sikertelen: '+(err?.message||'ismeretlen');}
});
// A Microsoft user identity is independently read from /me, not inferred
// from editable user names or an exported evidence JSON.
const pickerList=document.querySelector('#listGraphDraftVersions');
const pickerSelect=document.querySelector('#graphDraftVersionSelect');
const pickerVerify=document.querySelector('#loadGraphDraftVersion');
const pickerDownload=document.querySelector('#downloadGraphDraftVersion');
const pickerResult=document.querySelector('#graphDraftVersionResult');
let pickerEntries=[],pickerVerified=null;
const pickerToken=async()=>{
 const account=msal.getAllAccounts()[0];
 if(!account)throw Error('Microsoft bejelentkezes szukseges.');
 const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
 try{return (await msal.acquireTokenSilent(request)).accessToken;}
 catch(e){
  if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;
  return (await msal.acquireTokenPopup(request)).accessToken;
 }
};
pickerList.addEventListener('click',async()=>{
 pickerList.disabled=true;pickerEntries=[];pickerVerified=null;
 pickerVerify.disabled=true;pickerDownload.disabled=true;pickerSelect.disabled=true;
 pickerSelect.replaceChildren(new Option('Nincs verzio',''));
 pickerResult.textContent='SharePoint verzio lista betoltese...';
 try{
  const boardId=projectBoard.value.trim();
  pickerEntries=await listStoredDraftVersions({boardId,driveId,getAccessToken:pickerToken});
  for(let i=0;i<pickerEntries.length;i++){
   const e=pickerEntries[i];
   pickerSelect.add(new Option('v'+e.version+' | '+e.name+' | '+(e.modifiedAt||'nincs datum'),String(i)));
  }
  if(pickerEntries.length){pickerSelect.remove(0);pickerSelect.disabled=false;pickerVerify.disabled=false;}
  pickerResult.textContent=pickerEntries.length+' SharePoint DRAFT-verzio elerheto. Valassz verziot az ellenorzeshez.';
 }catch(e){pickerResult.textContent='Verziolista nem erheto el: '+(e?.message||e);}
 finally{pickerList.disabled=false;}
});
pickerSelect.addEventListener('change',()=>{
 pickerVerified=null;pickerDownload.disabled=true;pickerVerify.disabled=!pickerSelect.value;
 pickerResult.textContent='A kivalasztott verziot ellenorizni kell a letoltes elott.';
});
pickerVerify.addEventListener('click',async()=>{
 pickerVerified=null;pickerDownload.disabled=true;pickerVerify.disabled=true;
 pickerResult.textContent='SHA-256 es SharePoint eTag ellenorzese...';
 try{
  const selected=pickerEntries[Number(pickerSelect.value)];
  if(!selected)throw Error('Valassz egy DRAFT verziot.');
  pickerVerified=await loadStoredDraftVersion({boardId:projectBoard.value.trim(),
   driveId,selected,getAccessToken:pickerToken});
  pickerResult.textContent='Ellenorzott DRAFT v'+pickerVerified.version+'; '+pickerVerified.taskCount+
   ' feladat; SHA-256 '+pickerVerified.sha256+'. Monday es SharePoint valtozatlan.';
  pickerDownload.disabled=false;
 }catch(e){pickerResult.textContent='DRAFT ellenorzes sikertelen: '+(e?.message||e);}
 finally{pickerVerify.disabled=!pickerSelect.value;}
});
pickerDownload.addEventListener('click',()=>{
 if(!pickerVerified)return;
 const url=URL.createObjectURL(new Blob([pickerVerified.content],{type:'application/json;charset=utf-8'}));
 try{const a=document.createElement('a');a.href=url;a.download=pickerVerified.name;
  document.body.append(a);a.click();a.remove();}
 finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
});
let directGraphEvidence=null;
let verifiedGraphDraftText=null;
const graphDraftExport=document.querySelector('#exportVerifiedGraphDraft');
const graphResultOutput=document.querySelector('#graphDraftContentResult');
const graphEvidenceExport=document.querySelector('#exportGraphDraftEvidence');
document.querySelector('#verifyGraphDraftContent').addEventListener('click',async()=>{
 directGraphEvidence=null;verifiedGraphDraftText=null;graphEvidenceExport.disabled=true;graphDraftExport.disabled=true;graphResultOutput.textContent='Graph tartalom ellenorzese folyamatban...';
 try{
  const account=msal.getAllAccounts()[0];
  if(!account)throw new Error('Microsoft bejelentkezes szukseges.');
  const file=document.querySelector('#graphReviewRequest').files?.[0];
  if(!file||file.size>1_000_000)throw new Error('Valassz REVIEW REQUEST JSON fajlt.');
  const fileName=document.querySelector('#graphDraftFilename').value.trim();
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  const getAccessToken=async()=>{try{return (await msal.acquireTokenSilent(request)).accessToken;}
   catch(e){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;return (await msal.acquireTokenPopup(request)).accessToken;}};
  directGraphEvidence=await verifyGraphDraftContent({requestText:await file.text(),boardId:projectBoard.value.trim(),driveId,fileName,getAccessToken,onVerifiedDraft:text=>{verifiedGraphDraftText=text;}});
  graphResultOutput.textContent='KOZVETLEN GRAPH SHA-256 EGYEZES: v'+directGraphEvidence.version+
   '; '+directGraphEvidence.bytes+' byte; SHA-256: '+directGraphEvidence.sha256+
   '. A SharePoint eTag ujraellenorizve. Jovahagyas es Monday-szinkron tiltva.';
  graphEvidenceExport.disabled=false;graphDraftExport.disabled=false;
 }catch(e){graphResultOutput.textContent='Kozvetlen Graph-ellenorzes sikertelen: '+(e?.message||e)+'. Nem keletkezett hitelesitett tartalmi bizonyitek.';}
});
graphDraftExport.addEventListener('click',()=>{
 if(!directGraphEvidence||!verifiedGraphDraftText)return;
 // This export is the exact content retrieved from SharePoint, with unchanged UTF-8 text.
 const url=URL.createObjectURL(new Blob([verifiedGraphDraftText],{type:'application/json;charset=utf-8'}));
 try{const a=document.createElement('a');a.href=url;
  a.download=directGraphEvidence.sharePoint.name;
  document.body.append(a);a.click();a.remove();}
 finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
});
graphEvidenceExport.addEventListener('click',()=>{
 if(!directGraphEvidence)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(directGraphEvidence,null,2)],{type:'application/json'}));
 try{const a=document.createElement('a');a.href=url;
  a.download='draft-review-evidence-graph-'+directGraphEvidence.boardId+'-v'+directGraphEvidence.version+'.json';
  document.body.append(a);a.click();a.remove();}
 finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
});
let reviewEvidence=null;
const reviewEvidenceResult=document.querySelector('#sharePointReviewEvidenceResult');
const exportEvidence=document.querySelector('#exportSharePointReviewEvidence');
document.querySelector('#checkSharePointReviewEvidence').addEventListener('click',async()=>{
 reviewEvidence=null;exportEvidence.disabled=true;reviewEvidenceResult.textContent='SharePoint bizonyitek ellenorzese...';
 try{
  const account=msal.getAllAccounts()[0];
  if(!account)throw new Error('Microsoft-bejelentkezes szukseges.');
  const requestFile=document.querySelector('#evidenceReviewFile').files?.[0];
  const draftFile=document.querySelector('#evidenceDraftFile').files?.[0];
  if(!requestFile||!draftFile||requestFile.size>1_000_000||draftFile.size>5_000_000)throw new Error('Valassz REVIEW REQUEST es DRAFT JSON fajlokat.');
  const boardId=projectBoard.value.trim();
  const fileName=document.querySelector('#evidenceSharePointName').value.trim();
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  const getAccessToken=async()=>{try{return (await msal.acquireTokenSilent(request)).accessToken;}
   catch(e){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;return (await msal.acquireTokenPopup(request)).accessToken;}};
  reviewEvidence=await prepareSharePointReviewEvidence({requestText:await requestFile.text(),
   draftBytes:new Uint8Array(await draftFile.arrayBuffer()),boardId,driveId,fileName,getAccessToken});
  reviewEvidenceResult.textContent='Ellenorzes kesz: v'+reviewEvidence.version+'; '+reviewEvidence.taskCount+
   ' feladat; SHA-256: '+reviewEvidence.sha256+'; SharePoint item: '+reviewEvidence.sharePoint.itemId+
   '. A letoltes eredete nem tanusitott; jovahagyas tovabbra is tiltva.';
  exportEvidence.disabled=false;
 }catch(e){reviewEvidenceResult.textContent='Ellenorzes sikertelen: '+(e?.message||e);}
});
exportEvidence.addEventListener('click',()=>{
 if(!reviewEvidence)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(reviewEvidence,null,2)],{type:'application/json'}));
 try{const a=document.createElement('a');a.href=url;
  a.download='draft-review-evidence-'+reviewEvidence.boardId+'-v'+reviewEvidence.version+'.json';
  document.body.append(a);a.click();a.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
});
let editedDraftText=null,editedDraftChecked=null,editedBusy=false;
const savedReview=mountSavedDraftReview({
 button:document.querySelector('#preflightSavedDraft'),
 output:document.querySelector('#preflightSavedDraftResult'),
 tenantId,driveId,
 getCurrent:()=>({
  content:editedDraftText,validated:editedDraftChecked,
  boardId:projectBoard.value.trim(),account:msal.getAllAccounts()[0]||null
 }),
 getAccessToken:async account=>{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected',
   'https://graph.microsoft.com/User.Read'],account,redirectUri};
  try{return (await msal.acquireTokenSilent(request)).accessToken;}
  catch(e){
   if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;
   return (await msal.acquireTokenPopup(request)).accessToken;
  }
 }
});
const editedDownloaded=document.querySelector('#editedDownloadedFile');
const editedVerifyButton=document.querySelector('#verifyEditedDraft');
const editedVerifyResult=document.querySelector('#editedVerifyResult');
editedDownloaded.addEventListener('change',()=>{
 editedVerifyResult.textContent='Nincs ellenorzes.';
 editedVerifyButton.disabled=!editedDraftText||!editedDownloaded.files?.length;
});
editedVerifyButton.addEventListener('click',async()=>{
 editedVerifyButton.disabled=true;
 try{
  if(!editedDraftText)throw new Error('Eredeti szerkesztett DRAFT szukseges.');
  const file=editedDownloaded.files?.[0];
  if(!file||file.size>5_000_000)throw new Error('Valassz egy letoltott DRAFT fajlt.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const result=await verifyEditedDraftDownload({originalText:editedDraftText,downloadedBytes:bytes,boardId:projectBoard.value.trim()});
  editedVerifyResult.textContent='TELJES DRAFT v'+result.version+' SHA-256 EGYEZES. Board: '+result.boardId+'; feladatok: '+result.taskCount+'; meret: '+result.bytes+' byte; SHA-256: '+result.sha256+'.';
 }catch(e){editedVerifyResult.textContent='DRAFT v1+ tartalmi ellenorzes sikertelen: '+(e.message||e);}
 finally{editedVerifyButton.disabled=!editedDraftText||!editedDownloaded.files?.length;}
});

const syncDryRunButton=document.querySelector('#runApprovedSyncDryRun');
const syncDryRunOutput=document.querySelector('#approvedSyncDryRunResult');
let approvedSyncCandidate=null;
function invalidateApprovedSyncCandidate(){
 approvedSyncCandidate=null;syncDryRunButton.disabled=true;
 syncDryRunOutput.textContent='Nincs aktuális, visszaellenőrzött Approved Plan a szárazpróbához.';
}
syncDryRunButton.addEventListener('click',()=>{
 if(!approvedSyncCandidate||!draftHandoff.active)return;
 const current=savedReview.currentProof(),result=approvedSyncCandidate;
 if(!current||current.version!==result.version||
    current.sha256!==result.sourceDraftSha256||
    editedDraftChecked?.version!==result.version||
    editedDraftChecked?.sha256!==result.sourceDraftSha256){
  invalidateApprovedSyncCandidate();return;
 }
 if(draftHandoff.publishApprovedSyncPreview(result)){
  syncDryRunOutput.textContent='Az Approved Plan v'+result.version+
   ' átadva a Monday TEST felületnek szárazpróbára. Ott jelennek meg a mezőeltérések.'+
   '\nA Monday-board változatlan; nem történt visszaírás.';
  syncDryRunButton.disabled=true;
 }else{
  syncDryRunOutput.textContent='A szárazpróba átadása nem sikerült. Ellenőrizd, hogy a Monday TEST és az Uploader eredeti kapcsolata még nyitva van.';
 }
});

const approvedPlanAction=mountApprovedPlanAction({
 button:document.querySelector('#createApprovedPlan'),
 output:document.querySelector('#approvedPlanSaveResult'),
 driveId,tenantId,
 getCurrent:()=>({
  boardId:projectBoard.value.trim(),content:editedDraftText,
  validated:editedDraftChecked,saved:savedReview.currentProof(),
  account:msal.getAllAccounts()[0]||null
 }),
 getAccessToken:async account=>{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected',
   'https://graph.microsoft.com/User.Read'],account,redirectUri};
  try{return (await msal.acquireTokenSilent(request)).accessToken;}
  catch(e){
   if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;
   return (await msal.acquireTokenPopup(request)).accessToken;
  }
 },
 confirm:text=>window.confirm(text),
 onStored:result=>{
  if(result?.approvedPlan&&result.status==='APPROVED_PLAN_STORED'&&
     result.mondaySyncAllowed===false){
   approvedSyncCandidate=result;
   syncDryRunButton.disabled=false;
   syncDryRunOutput.textContent='Approved Plan ellenőrizve: '+result.name+
    '. A Monday szárazpróba külön gombbal indítható, írás nélkül.';
  }
 }
});

const editedFile=document.querySelector('#editedDraftFile');
const editedSave=document.querySelector('#saveEditedDraft');
const editedStatus=document.querySelector('#editedDraftStatus');
const editedResult=document.querySelector('#editedDraftSaveResult');
editedFile.addEventListener('change',async()=>{
 savedReview.clear();approvedPlanAction.clear();invalidateApprovedSyncCandidate();
 document.querySelector('#finalizationIntentResult').textContent='Nincs aktuális véglegesítési kérelem.';
 editedDraftText=null;editedDraftChecked=null;editedSave.disabled=true;editedVerifyButton.disabled=true;
 editedResult.textContent='Nincs feltoltes.';
 try{
  const file=editedFile.files?.[0];
  if(!file||file.size>5_000_000)throw new Error('Valassz 5 MB alatti DRAFT JSON fajlt.');
  const text=await file.text();
  const valid=await validateEditedDraft(text,projectBoard.value.trim());
  editedDraftText=text;editedDraftChecked=valid;editedVerifyButton.disabled=!editedDownloaded.files?.length;
  editedStatus.textContent='Szerkesztett DRAFT ellenorizve: '+valid.boardId+', verzio '+valid.version+', '+valid.taskCount+' feladat, SHA-256 '+valid.sha256;
  editedSave.disabled=!msal.getAllAccounts().length;
 }catch(e){editedStatus.textContent='Ellenorzes sikertelen: '+e.message;}
});
// One-time browser handoff from Monday. The received JSON is untrusted input:
 // validate it locally and require a separate Microsoft-authenticated save click.
const finalizationIntentOutput=document.querySelector('#finalizationIntentResult');
const resetFinalizationIntent=()=>{
 finalizationIntentOutput.textContent='Nincs aktuális véglegesítési kérelem.';
};
const autoCheckbox=document.querySelector('#enableSessionAutosave');
const autoOutput=document.querySelector('#sessionAutosaveResult');
let manualSaveVerified=false;
const sessionAutosave=createSessionDraftAutosave({
 save:async work=>{
  if(editedBusy)throw Error('A korabbi DRAFT mentes meg folyamatban van.');
  const account=msal.getAllAccounts()[0];
  if(!account)throw Error('Microsoft bejelentkezes szukseges.');
  const boardId=projectBoard.value.trim();
  const validated=await validateEditedDraft(work.content,boardId);
  if(validated.version!==work.version||validated.sha256!==work.sha256)
   throw Error('A munkaterv megvaltozott.');
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  const getAccessToken=async()=> (await msal.acquireTokenSilent(request)).accessToken;
  const versionId='v'+work.version+'-'+Date.now().toString(36)+'-'+crypto.randomUUID().slice(0,12);
  const saved=await saveDraftTransfer({editedDraftText:work.content,boardId,driveId,getAccessToken,versionId});
  const received=draftHandoff.publishVerifiedReceipt({boardId,version:work.version,
   sha256:saved.sha256,bytes:saved.bytes,name:saved.name,itemId:saved.id,eTag:saved.eTag,
   verification:saved.verification});
  savedReview.record({...saved,boardId},work.version,work.sha256,work.content);
  const superseded=editedDraftChecked?.version>work.version;
  if(!received&&!superseded)throw Error('A SharePoint mentes igazolt, de a Monday visszajelzese nem lehetett osszeegyeztetni az aktualis DRAFT-tal.');
  editedResult.textContent='DRAFT v'+work.version+' automatikusan mentve es Graph SHA-256 / eTag visszaellenorizve.\nFajl: '+saved.path+'\nSHA-256: '+saved.sha256+(superseded?'\nAz elavult Monday visszajelzest kihagytuk; ujabb DRAFT verzio var mentessel.':'');
  return {...saved,version:work.version};
 },
 onState:state=>{
  autoCheckbox.checked=state.enabled;
  autoOutput.textContent=state.error?'Automatikus mentes LEALLITVA: '+state.error+
   '. Ellenorizd a SharePoint fajllistat. Nem tortenik automatikus ujraprobalas.':
   !state.enabled?'Automatikus mentés kikapcsolva.':
   state.busy?'SharePoint-mentes es tartalmi ellenorzes folyamatban...':
   state.pendingRevision?'DRAFT v'+state.pendingRevision+' automatikus mentese elokeszitve.':
   'Automatikus mentés bekapcsolva erre az ablakra. A következő módosításokat figyeli.';
 }
});
autoCheckbox.addEventListener('change',()=>{
 if(autoCheckbox.checked){
  if(!manualSaveVerified||!msal.getAllAccounts()[0]){autoCheckbox.checked=false;return;}
  sessionAutosave.enable();
 }else sessionAutosave.disable();
});
const draftHandoff=attachDraftHandoff({onDraft:async({content,boardId})=>{
 savedReview.clear();approvedPlanAction.clear();invalidateApprovedSyncCandidate();resetFinalizationIntent();
 editedDraftText=null;editedDraftChecked=null;editedSave.disabled=true;editedVerifyButton.disabled=true;
 editedResult.textContent='Nincs SharePoint-mentes. Felhasznaloi megerosites szukseges.';
 try{
  if(boardId!==projectBoard.value.trim())throw Error('A Monday es az Uploader board-azonositoja elter.');
  const valid=await validateEditedDraft(content,boardId);
  editedDraftText=content;editedDraftChecked=valid;
  editedSave.disabled=!msal.getAllAccounts().length;
  editedStatus.textContent='DRAFT v'+valid.version+' atveve a Monday TEST-bol: '+valid.taskCount+
   ' feladat; SHA-256: '+valid.sha256+'. SharePoint-mentes MEG NEM tortent. Bejelentkezes es kulon mentes szukseges.';
  document.querySelector('#editedDraftFile')?.closest('section')?.scrollIntoView({block:'start'});
  return {boardId:valid.boardId,version:valid.version,sha256:valid.sha256,bytes:valid.bytes};
 }catch(e){editedStatus.textContent='Monday DRAFT-atadas elutasitva: '+(e?.message||e);throw e;}
},onRevision:async({content,boardId})=>{
 savedReview.clear();approvedPlanAction.clear();invalidateApprovedSyncCandidate();resetFinalizationIntent();
 if(boardId!==projectBoard.value.trim())throw Error('Eltero Monday-board.');
 const valid=await validateEditedDraft(content,boardId);
 if(editedDraftChecked&&valid.version<=editedDraftChecked.version)
  throw Error('Nem ujabb DRAFT verzio.');
 editedDraftText=content;editedDraftChecked=valid;editedSave.disabled=!msal.getAllAccounts().length;
 editedStatus.textContent='DRAFT v'+valid.version+' atveve a Monday-bol: '+valid.taskCount+
  ' feladat. SharePoint visszaigazolas meg nincs.';
 return {boardId,version:valid.version,sha256:valid.sha256,bytes:valid.bytes};
},onFinalizationIntent:async({boardId,intent})=>{
 const saved=savedReview.currentProof();
 if(!saved||boardId!==projectBoard.value.trim()||
    saved.boardId!==boardId||saved.version!==intent.version||
    saved.sha256!==intent.sha256||saved.bytes!==intent.bytes||
    editedDraftChecked?.version!==intent.version||
    editedDraftChecked?.sha256!==intent.sha256||
    !msal.getAllAccounts()[0])return false;
 if(!approvedPlanAction.receive(intent))return false;
 finalizationIntentOutput.textContent='A Monday TEST-ben megerősített DRAFT v'+
  intent.version+' véglegesítési szándéka megérkezett.'+
  '\nMonday szerkesztőazonosító (böngészős adat): '+intent.editorId+
  '\nSHA-256: '+intent.sha256+
  '\nKövetkező lépés: külön megerősítéssel Approved Plan mentése, új Graph-ellenőrzéssel.'+
  '\nNEM jóváhagyott terv; Approved-Plans és Monday változatlan.';
 return true;
},onAcceptedRevision:work=>{
 if(sessionAutosave.state().enabled)sessionAutosave.enqueue(work);
 else autoOutput.textContent='Uj DRAFT v'+work.version+' erkezett. Automatikus mentes nincs engedelyezve; kezi mentes szukseges.';
}});
editedSave.addEventListener('click',async()=>{
 if(editedBusy||!editedDraftText||!editedDraftChecked)return;
 const boardId=projectBoard.value.trim(),account=msal.getAllAccounts()[0];
 if(!account){editedResult.textContent='Microsoft bejelentkezes szukseges.';return;}
 const saveContent=editedDraftText;
 const valid=await validateEditedDraft(saveContent,boardId);
 if(valid.sha256!==editedDraftChecked.sha256)throw new Error('DRAFT megvaltozott.');
 if(!window.confirm('DRAFT v'+valid.version+' uj, nem jovahagyott SharePoint fajlkent mentve. Nincs Monday-szinkron. Folytatod?'))return;
 if(sessionAutosave.state().enabled){sessionAutosave.disable();autoOutput.textContent='Automatikus mentes leallitva a manualis mentes miatt.';}
 editedBusy=true;editedSave.disabled=true;editedResult.textContent='DRAFT v'+valid.version+' feltoltese...';
 try{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  const getAccessToken=async()=>{
   try{return (await msal.acquireTokenSilent(request)).accessToken;}
   catch(e){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))throw e;return (await msal.acquireTokenPopup(request)).accessToken;}
  };
  const versionId='v'+valid.version+'-'+Date.now().toString(36)+'-'+crypto.randomUUID().slice(0,12);
  const saved=await saveDraftTransfer({editedDraftText:saveContent,boardId,driveId,getAccessToken,versionId});
  savedReview.record({...saved,boardId},valid.version,valid.sha256,saveContent);
  manualSaveVerified=true;autoCheckbox.disabled=false;
  draftHandoff.publishVerifiedReceipt({boardId,version:valid.version,sha256:saved.sha256,
   bytes:saved.bytes,name:saved.name,itemId:saved.id,eTag:saved.eTag,
   verification:saved.verification});
  editedResult.textContent='DRAFT v'+valid.version+' SharePointra mentve es TELJES TARTALMI EGYEZES IGAZOLVA.\nFajl: '+saved.path+'\nMeret: '+saved.bytes+' byte\nSHA-256: '+saved.sha256+'\neTag: '+saved.eTag+'\nVisszaolvasott tartalom, fajlazonosito es stabil SharePoint metadata ellenorizve. Nem jovahagyott DRAFT; Monday-board valtozatlan.';
 }catch(e){editedResult.textContent=e.uploaded?'DRAFT FELTOLTVE, DE NEM IGAZOLT!\nFajl: '+e.uploaded.path+'\nSHA-256 (eredeti): '+e.uploaded.sha256+'\n'+(e.message||e):'Mentes hibas: '+(e.message||e)+'. Ellenorizd a SharePoint mappat ujraprobalas elott.';}
 finally{editedBusy=false;editedSave.disabled=!editedDraftText||!msal.getAllAccounts().length;}
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
