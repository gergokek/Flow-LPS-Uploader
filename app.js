import {requestV2FlowConsent} from './v2-approval-sync-consent.js';
import {inspectV2Cycle} from './v2-approval-sync-contract.js';
import {requestV2SessionConsent} from './v2-session-consent-ui.js';
import {beginV1FullSyncWithConsent} from './full-sync-consent-ui.js';
import {createSessionDraftAutosave} from './draft-session-autosave.js';
import {createSingleDraftSessionStore} from './single-draft-session-storage.js';
import {verifiedVersionedSelection} from './versioned-session-selection.js';
import {requestPlanningStartConsent} from './planning-start-consent.js';
import {createImmutableDraftQueue} from './single-draft-write-queue.js';
import {attachSingleDraftSessionBridge} from './single-draft-session-bridge.js';
import {attachDraftHandoff} from './draft-handoff-receiver.js';
import {listStoredDraftVersions,loadStoredDraftVersion} from './sharepoint-version-picker.js';
import {verifyGraphDraftContent} from './graph-draft-content-verifier.js';
import {prepareSharePointReviewEvidence} from './sharepoint-review-evidence.js';
import {verifyEditedDraftDownload} from './edited-draft-verifier.js';
import {validateEditedDraft} from './edited-draft-validator.js';
import {mountSavedDraftReview} from './review-preflight-ui.js';
import {mountApprovedPlanAction} from './approved-plan-ui.js';
import {mountSyncCheckpointAction} from './sync-checkpoint-ui.js';
import {mountSyncRecoveryAction} from './sync-recovery-ui.js';
import {mountStoredSyncRecovery} from './sync-recovery-history-ui.js';
import {mountTestBatchSession} from './sync-batch-session-ui.js';
import {mountFinalSyncReceiptAction} from './sync-final-receipt-ui.js';
import {mountSingleTaskJournalControl} from './pilot-journal-ui.js';
import { PublicClientApplication, BrowserCacheLocation } from '@azure/msal-browser';
import {createProjectStorage} from './project-storage.js';
import {versionLayout} from './version-workspace-layout.js';
import {createVersionedGraphFiles} from './versioned-graph-files.js';
import {summarizeVersionedApprovalInventory,versionedApprovalInventoryMessage} from './versioned-approval-status-ui.js';
import {validateDraftTransfer} from './draft-transfer-validator.js';
import {saveDraftTransfer} from './draft-save.js';
import {verifyDownloadedDraft} from './draft-content-verifier.js';
import {inspectStoredDraft} from './draft-workspace.js';
const clientId='3a2cf530-d7a7-4e48-bb90-023d7e293e7a';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
// The separate /test/ preview uses the existing registered SPA callback.
// The registered production callback is unchanged, while app assets remain isolated.
const testUi=import.meta.env.VITE_MFLOW_TEST_PREVIEW==='1';
const redirectUri=new URL(testUi?'../redirect.html':'./redirect.html',window.location.href).href;
const button=document.querySelector('#login');
const status=document.querySelector('#authResult');
const graphButton=document.querySelector('#checkSharePoint');
const graphResult=document.querySelector('#sharePointResult');
const driveId='b!YBiCN3mDjkCA0zlGakoS1F6FNi-WzO5Ip7eBTLppUVCRBefvaJ27TYm2xryC37MY';
const projectBoard=document.querySelector('#projectBoardId');
const projectSetup=document.querySelector('#setupProject');
const projectResult=document.querySelector('#projectResult');
const versionFoldersButton=document.querySelector('#setupVersionFolders');
const versionFoldersResult=document.querySelector('#versionFoldersResult');
const v3InventoryButton=document.querySelector('#inspectV3ApprovalInventory');
const v3InventoryOutput=document.querySelector('#v3ApprovalInventoryResult');
const createSingleDraft=document.querySelector('#startSingleDraft');
const resumeSingleDraft=document.querySelector('#resumeSingleDraft');
const singleDraftOutput=document.querySelector('#singleDraftResult');
const inspectApprovedV1Button=document.querySelector('#inspectApprovedV1');
const approvedV1SyncOutput=document.querySelector('#approvedV1SyncResult');
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
 document.querySelector('#listStoredSyncCheckpoints').disabled=!account||projectBoard.value.trim()!=='5107075373';
 projectSetup.disabled=!account;
 versionFoldersButton.disabled=!account||projectBoard.value.trim()!=='5107075373';
 v3InventoryButton.disabled=!account||projectBoard.value.trim()!=='5107075373'||!testUi;
 // The TEST session may only be started from the authenticated Monday opener.
 const connected=!!singleBridge?.active&&singleBridge.ready();
 createSingleDraft.disabled=!account||!connected||!!singleSession||projectBoard.value.trim()!=='5107075373';
 resumeSingleDraft.disabled=!account||!connected||!!singleSession||projectBoard.value.trim()!=='5107075373';
 inspectApprovedV1Button.disabled=!account||!connected||!!singleSession||!!singleSyncSelected||syncInspectBusy||projectBoard.value.trim()!=='5107075373';
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
  const response=await msal.loginPopup({scopes:testUi?['openid','profile','User.Read']:['openid','profile'],redirectUri,prompt:'select_account',overrideInteractionInProgress:retryPendingInteraction});
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
// This intentionally does not start V3 or write a manifest: folders only.
versionFoldersButton.addEventListener('click',async()=>{
 if(projectBusy)return;
 const boardId=projectBoard.value.trim();
 if(boardId!=='5107075373')throw Error('Version folder provisioning is TEST-only.');
 const account=msal.getAllAccounts()[0];
 if(!account){versionFoldersResult.textContent='Microsoft-bejelentkezes szukseges.';return;}
 const layout=versionLayout(boardId,3);
 if(!window.confirm('Csak az ures '+layout.versionRoot+' es 4 almappaja jon letre. A V1/V2 fajlokat nem mozgatjuk, V3 munkamenetet nem inditunk. Folytatod?'))return;
 projectBusy=true;versionFoldersButton.disabled=true;projectSetup.disabled=true;
 versionFoldersResult.textContent='V3 SharePoint mappak ellenorzese...';
 try{
  const request={scopes:['https://graph.microsoft.com/Sites.Selected'],account,redirectUri};
  let auth;try{auth=await msal.acquireTokenSilent(request);}
  catch(err){if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(err?.errorCode))throw err;
   auth=await msal.acquireTokenPopup(request);}
  if(msal.getAllAccounts()[0]?.homeAccountId!==account.homeAccountId)
   throw Error('Microsoft-fiok megvaltozott.');
  const store=createProjectStorage({driveId,getAccessToken:async()=>auth.accessToken});
  const proof=await store.ensureVersion(boardId,3);
  versionFoldersResult.textContent='V3 mappak elokeszitve: '+proof.path+'\\nAlmappak: '+proof.folders.join(', ')+
   '\\nV1/V2 fajlok erintetlenek; V3 DRAFT nincs elinditva; Monday-iras: 0.';
 }catch(error){versionFoldersResult.textContent='V3 mappaellenorzes sikertelen: '+String(error?.message||error);}
 finally{projectBusy=false;versionFoldersButton.disabled=!msal.getAllAccounts().length;
  projectSetup.disabled=!msal.getAllAccounts().length;}
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
// Read-only Entra /me proof requires the standard delegated User.Read scope.
// TEST MSAL login requests it on a direct user click, before any approval.
const pickerMeToken=async()=>{
 const account=msal.getAllAccounts()[0];
 if(!account)throw Error('Microsoft bejelentkezes szukseges.');
 const request={scopes:['User.Read'],account,redirectUri};
 try{return (await msal.acquireTokenSilent(request)).accessToken;}
 catch(e){
  if(!['interaction_required','consent_required','login_required','invalid_grant'].includes(e?.errorCode))
   throw e;
  return (await msal.acquireTokenPopup(request)).accessToken;
 }
};
// V3 version inventory – read-only, not an approval or sync authorization.
let v3InventoryBusy=false;
v3InventoryButton.addEventListener('click',async()=>{
 if(v3InventoryBusy||!testUi)return;
 const current=msal.getAllAccounts()[0],boardId=projectBoard.value.trim();
 if(boardId!=='5107075373'||!current){
  v3InventoryOutput.textContent='Microsoft-fiok es TEST board szukseges.';return;
 }
 const accountId=current.homeAccountId,tenant=current.tenantId;
 const assertCurrent=()=>projectBoard.value.trim()===boardId&&
  msal.getAllAccounts()[0]?.homeAccountId===accountId&&
  msal.getAllAccounts()[0]?.tenantId===tenant;
 v3InventoryBusy=true;v3InventoryButton.disabled=true;
 v3InventoryOutput.textContent='V3 SharePoint fajllistak ujraolvasasa (csak olvasas)...';
 try{
  const graph=createVersionedGraphFiles({boardId,version:3,driveId,
   getAccessToken:pickerToken,assertCurrent});
  const layout=versionLayout(boardId,3);
  const [sessionFiles,draftFiles,approvedFiles,syncFiles]=await Promise.all([
   graph.list(layout.session),graph.list(layout.drafts),
   graph.list(layout.approved),graph.list(layout.sync)]);
  if(!assertCurrent())throw Error('Microsoft-fiok megvaltozott.');
  const result=summarizeVersionedApprovalInventory({boardId,planVersion:3,
   sessionFiles,draftFiles,approvedFiles,syncFiles});
  v3InventoryOutput.textContent=versionedApprovalInventoryMessage(result);
 }catch(error){
  v3InventoryOutput.textContent='V3 ellenorzes nem teljes: '+String(error?.message||error)+
   '\nNincs igazolt jovahagyas vagy szinkron; nincs ujraprobalasbol eredő iras.';
 }finally{
  v3InventoryBusy=false;showAccount(msal.getAllAccounts()[0]||null);
 }
});
// New, isolated one-session workflow. No legacy autosave coalescing and no
// direct Monday writes. Existing legacy tests remain available separately.
let singleSession=null,singleSessionQueue=null,singleStore=null,singleBusy=false;
let singleSyncStore=null,singleSyncSelected=null,syncInspectBusy=false,syncPrepareBlocked=false;
const singleBridge=attachSingleDraftSessionBridge({onSaveRevision:async({draft,sessionId})=>{
 if(!singleSession||!singleSessionQueue||singleSession.sessionId!==sessionId||
    singleSessionQueue.state().blocked||
    draft.version!==singleSessionQueue.state().nextRevision+1)
  throw Error('A DRAFT-munkamenet módosítási sora nem érvényes.');
 if(!singleSessionQueue.enqueue(draft))
  throw Error('A DRAFT-módosítás nem került a mentési sorba.');
 await singleSessionQueue.idle(); // Verified Graph content/eTag, not an ACK alone.
 if(singleSession?.revision!==draft.version)
  throw Error('A SharePoint-mentés verziója eltér.');
 return singleSession;
},onApprovePlan:async request=>{
 const account=msal.getAllAccounts()[0];
 if(!singleStore||!singleSession||singleSession.planVersion!==1||!singleSessionQueue||
    !account||!singleSessionQueue.state().canApprove||
    singleSession.status!=='SAVED'&&singleSession.status!=='ACTIVE'||
    singleSession.sessionId!==request.expectedSessionId||
    singleSession.revision!==request.expectedRevision||
    singleSession.receipt?.sha256!==request.expectedSha256)
  throw Error('A DRAFT jóváhagyása nem indítható; előbb ellenőrizd a mentett verziót.');
 // Store independently re-reads all Graph files and verifies /me.
 const result=await singleStore.approve({...request,
  createdBy:account.homeAccountId});
 singleSessionQueue.stop();
 singleSession={...singleSession,status:'APPROVED_V1'};
 singleDraftOutput.textContent=
  'Approved Plan V1 mentve és visszaellenőrizve.\n'+
  'Forrás: V1.'+result.revision+' / '+result.finalDraftSha256+'\n'+
  'SharePoint: '+result.approvedPlan.path+'\n'+
  'Approved SHA-256: '+result.approvedPlan.sha256+'\n'+
  'Monday-board módosítás: 0.\n'+
  'Szinkronizáció külön későbbi művelet.';
 return result;
},onPrepareSync:async request=>{
 const account=msal.getAllAccounts()[0];
 if(!account||!singleSyncStore||!singleSyncSelected||syncPrepareBlocked||
    request.expectedApprovedSha256!==singleSyncSelected.receipt.sha256||
    request.expectedSessionId!==singleSyncSelected.sessionId||
    request.expectedRevision!==singleSyncSelected.revision)
  throw Error('A jóváhagyott V1 szinkron előkészítése nem hitelesíthető.');
 // Once a SharePoint create is attempted, an uncertain outcome is terminal.
 syncPrepareBlocked=true;
 const result=await singleSyncStore.prepareApprovedSync({
  expectedApprovedSha256:request.expectedApprovedSha256,
  createdBy:account.homeAccountId,editorId:request.editorId,
  boardVerifiedAt:request.boardVerifiedAt,
  boardFingerprintSha256:request.boardFingerprintSha256});
 approvedV1SyncOutput.textContent='V1 szinkron 0-írásos checkpoint visszaellenőrizve.\n'+
  'Fájl: '+result.checkpoint.path+'\n'+
  'SHA-256: '+result.checkpoint.sha256+'\n'+
  'Monday-board módosítás: 0. A következő írás külön megerősítést igényel.';
 return result;
},onPilotRequest:async request=>{
 const account=msal.getAllAccounts()[0];
 if(!account||!singleSyncStore||!singleSyncSelected||
    request.expectedApprovedSha256!==singleSyncSelected.receipt.sha256||
    request.expectedSessionId!==singleSyncSelected.sessionId||
    request.expectedRevision!==singleSyncSelected.revision)
  throw Error('V1 pilot: nincs ellenorzott Approved V1 kapcsolat.');
 const payload=request.payload||{},createdBy=account.homeAccountId;
 if(request.action==='planning-inspect'){
  const selected=singleSyncSelected,store=singleSyncStore;
  if(projectBoard.value.trim()!=='5107075373'||!singleBridge.active||
     !singleBridge.ready()||singleSyncSelected!==selected)
   throw Error('A tervallapot ellenorzes kapcsolata megszakadt.');
  approvedV1SyncOutput.textContent='Projektverziok es teljes SharePoint-bizonyitekok ellenorzese. Csak olvasas.';
  const state=await store.inspectPlanningState({createdBy,
   editorId:payload.editorId,boardFingerprint:payload.boardFingerprint});
  if(singleSyncSelected!==selected||singleSyncStore!==store||
     msal.getAllAccounts()[0]?.homeAccountId!==createdBy)
   throw Error('A Microsoft-fiok vagy SharePoint kapcsolat megvaltozott.');
  approvedV1SyncOutput.textContent='Projektallapot: '+state.status+
   '; kovetkezo muvelet: '+state.action+'; verzio: '+(state.planVersion??'-')+
   '; letezo verzio: '+state.verifiedVersionCount+'; Monday iras: 0.';
  return state;
 }
 if(request.action==='planning-begin'){
  const store=singleSyncStore,linked=singleSyncSelected,opener=window.opener;
  const current=()=>store===singleSyncStore&&linked===singleSyncSelected&&
   !singleSession&&!singleSessionQueue&&
   projectBoard.value.trim()==='5107075373'&&singleBridge.active&&
   singleBridge.ready()&&msal.getAllAccounts()[0]?.homeAccountId===createdBy&&
   msal.getAllAccounts()[0]?.tenantId===account.tenantId&&
   opener&&opener===window.opener&&!opener.closed;
  if(!current()||payload.mondayConfirmed!==true)
   throw Error('A Monday tervinditasi jovahagyasa vagy kapcsolata hianyzik.');
  const args={...payload,createdBy,editorId:payload.editorId};
  const state=await store.planningActions.inspect(args);
  if(!current()||state.action!=='START_NEXT'||state.boardMatches!==true||
    state.planVersion!==3||
    state.predecessorCompletionSha256!==payload.expectedPredecessorSha256||
    state.verifiedVersionCount!==state.planVersion-1)
   throw Error('Nem teljes vagy megvaltozott a V2 utani projektallapot.');
  approvedV1SyncOutput.textContent='Uj terv inditasa kulon Uploader-jovahagyasra var. Monday-iras: 0.';
  const accepted=await requestPlanningStartConsent({
   host:approvedV1SyncOutput.parentElement,state,isCurrent:current});
  if(!accepted||!current())throw Error('Az Uploader tervinditast megszakitottak.');
  const run=await store.planningActions.execute({...args,
   mondayConfirmed:true,uploaderConfirmed:true});
  if(!current()||run.action!=='START_NEXT'||run.planVersion!==state.planVersion)
   throw Error('A tervinditas eredmenye nem egyezik az ellenorzott verzioval.');
  const selected=await verifiedVersionedSelection(run.report);
  if(!current()||selected.planVersion!==state.planVersion)
   throw Error('A friss DRAFT-atadas kapcsolat megvaltozott.');
  installV2EditorQueue({append:work=>store.nextVersion.append({...work,
   createdBy,editorId:payload.editorId})},selected);
  approvedV1SyncOutput.textContent='Aktiv '+selected.versionLabel+
   ' DRAFT letrehozva, ellenorizve, a Monday szerkesztonek atadhato. Monday-iras: 0.';
  return selected;
 }
 if(request.action==='planning-open'){
  const store=singleSyncStore,linked=singleSyncSelected,opener=window.opener,
   args={createdBy,editorId:payload.editorId,boardFingerprint:payload.boardFingerprint};
  const current=()=>store===singleSyncStore&&linked===singleSyncSelected&&
   projectBoard.value.trim()==='5107075373'&&singleBridge.active&&singleBridge.ready()&&
   msal.getAllAccounts()[0]?.homeAccountId===createdBy&&
   msal.getAllAccounts()[0]?.tenantId===account.tenantId&&
   opener&&opener===window.opener&&!opener.closed;
  if(!current()||singleSession||singleSessionQueue)
   throw Error('Mar van kivalasztott DRAFT vagy elavult a kapcsolat.');
  const state=await store.planningActions.inspect(args);
  if(!current()||state.action!=='RESUME_DRAFT'||state.planVersion!==3)
   throw Error('Nincs igazolt, folytathato V3 DRAFT.');
  const report=await store.nextVersion.inspect(args);
  if(!current())throw Error('A SharePoint kapcsolat megvaltozott.');
  const selected=await verifiedVersionedSelection(report);
  if(selected.planVersion!==state.planVersion||selected.revision!==state.revision)
   throw Error('A V3 allapot megvaltozott a kivalasztas kozben.');
  const checked=await store.planningActions.inspect(args);
  if(!current()||checked.action!==state.action||checked.planVersion!==state.planVersion||
     checked.revision!==state.revision)
   throw Error('A V3 munkamenet a megnyitas kozben megvaltozott.');
  const bound={append:work=>store.nextVersion.append({...work,createdBy,
   editorId:payload.editorId})};
  installV2EditorQueue(bound,selected);
  approvedV1SyncOutput.textContent='Igazolt '+selected.versionLabel+
   ' DRAFT ujranyitva: '+selected.receipt.name+'. Monday-iras: 0.';
  return selected;
 }
 if(request.action.startsWith('v2-flow-')){
  const flow=singleSyncStore.v2Flow,action=request.action.slice(8),args={...payload,createdBy,requestId:request.requestId};
  const selected=singleSyncSelected,store=singleSyncStore,opener=window.opener;
  const isCurrent=()=>singleSyncSelected===selected&&singleSyncStore===store&&
   projectBoard.value.trim()==='5107075373'&&msal.getAllAccounts()[0]?.homeAccountId===createdBy&&
   msal.getAllAccounts()[0]?.tenantId===account.tenantId&&singleBridge.active&&singleBridge.ready()&&
   singleBridge.syncSession()?.sha256===request.expectedApprovedSha256&&
   singleBridge.syncSession()?.sessionId===request.expectedSessionId&&
   singleBridge.syncSession()?.revision===request.expectedRevision&&!!opener&&window.opener===opener&&!opener.closed;
  if(!isCurrent())throw Error('A V2 kapcsolat megvaltozott.');
  if(action==='inspect'){
   approvedV1SyncOutput.textContent='V2 DRAFT, jovahagyas es naplok visszaellenorzese. Csak olvasas.';
   const report=await flow.inspect(args),state=await inspectV2Cycle(report,args.editorId,createdBy);
   approvedV1SyncOutput.textContent='V2 ellenorzes: '+state.status+'. Modosult: '+state.model.changedTaskCount+
    ', igazolt: '+state.verifiedTaskCount+', hatralevo: '+state.remainingTaskCount+'.';return report;
  }
  if(action==='begin'){
   const report=await flow.inspect(args),state=await inspectV2Cycle(report,args.editorId,createdBy);
   if(state.generationSha256!==args.generationSha256||!isCurrent())throw Error('A V2 elonezet megvaltozott.');
   approvedV1SyncOutput.textContent='V2 jovahagyas es teljes visszairas a lenti gombra var. Meg nem indult uj iras.';
   if(!await requestV2FlowConsent({host:approvedV1SyncOutput.parentElement,state,isCurrent})||!isCurrent())
    throw Error('A V2 jovahagyas megszakitva. Ebben a futasban nem indult iras.');
   return flow.begin({...args,userConfirmed:true});
  }
  if(!['approve','ahead','result','finish'].includes(action))throw Error('Ismeretlen V2 szinkronmuvelet.');
  const result=await flow[action](args);
  approvedV1SyncOutput.textContent=action==='finish'?'TELJES V2 SZINKRON LEZARVA. '+
   result.document.verifiedTaskCount+' modosult feladat igazolva. Zaronyugta: '+result.receipt.name+'. V3 nem indult.':
   action==='approve'?'Approved V2 mentve es visszaellenorizve. A V2 DRAFT zarolt; a teljes szinkron folytatodik.':
   action==='ahead'?'V2 elonaplo igazolva. Feladat: '+result.document.taskId:
   'V2 eredmenynaplo igazolva: '+result.document.status;
  return result;
 }
 if(request.action.startsWith('v2-')){
  const next=singleSyncStore.nextSession,action=request.action.slice(3);
  const args={...payload,createdBy,requestId:request.requestId};
  if(action==='inspect'){
   approvedV1SyncOutput.textContent='V1 lezaro nyugta es teljes naplolanc, majd V2 munkamenet ellenorzese. Csak olvasas.';
   return next.inspect(args);
  }
  if(action==='begin'){
   const selected=singleSyncSelected,store=singleSyncStore,opener=window.opener;
   const isCurrent=()=>singleSyncSelected===selected&&singleSyncStore===store&&
    projectBoard.value.trim()==='5107075373'&&msal.getAllAccounts()[0]?.homeAccountId===createdBy&&
    msal.getAllAccounts()[0]?.tenantId===account.tenantId&&singleBridge.active&&singleBridge.ready()&&
    singleBridge.syncSession()?.sha256===request.expectedApprovedSha256&&
    !!opener&&window.opener===opener&&!opener.closed;
   const report=await next.inspect(args);
   if(report.generationSha256!==args.generationSha256||!isCurrent())throw Error('A V2 forras megvaltozott.');
   approvedV1SyncOutput.textContent='V2 inditas a lenti kifejezett jovahagyasra var. Meg nem tortent iras.';
   const accepted=await requestV2SessionConsent({host:approvedV1SyncOutput.parentElement,report,isCurrent});
   if(!accepted||!isCurrent())throw Error('A V2 inditasa megszakitva. Nem tortent iras.');
   return next.begin({...args,userConfirmed:true});
  }
  if(action==='open'){
   const report=await next.open(args),last=report.revisions.at(-1)||report.baseline;
   const selected={status:'ACTIVE',boardId:'5107075373',planVersion:2,
    sessionId:report.claim.document.sessionId,revision:last.document.version,
    versionLabel:'V2'+(last.document.version?'.'+last.document.version:''),draft:last.document,receipt:last.receipt};
   installV2EditorQueue(next,selected);
   approvedV1SyncOutput.textContent='V1 tervezesi munkamenet lezart. Aktiv '+selected.versionLabel+
    ' DRAFT, '+report.taskCount+' feladat. Monday-iras: 0. Regi fajlokat nem toroltunk.';
   showAccount(account);return report;
  }
  throw Error('Ismeretlen V2 muvelet.');
 }
 if(request.action.startsWith('full-')){
  const full=singleSyncStore.fullSync,action=request.action.slice(5);
  const args={...payload,createdBy,requestId:request.requestId};
  if(action==='inspect'){
   approvedV1SyncOutput.textContent='Teljes V1 naplolanc ellenorzese. Ez meg csak olvasas.';
   return full.inspect(args);
  }
  if(action==='begin'){
   const selected=singleSyncSelected,store=singleSyncStore,opener=window.opener;
   const isCurrent=()=>singleSyncSelected===selected&&singleSyncStore===store&&
    projectBoard.value.trim()==='5107075373'&&
    msal.getAllAccounts()[0]?.homeAccountId===createdBy&&
    msal.getAllAccounts()[0]?.tenantId===account.tenantId&&
    singleBridge.active&&singleBridge.ready()&&
    singleBridge.syncSession()?.sha256===request.expectedApprovedSha256&&
    singleBridge.syncSession()?.sessionId===request.expectedSessionId&&
    singleBridge.syncSession()?.revision===request.expectedRevision&&
    !!opener&&window.opener===opener&&!opener.closed;
   return beginV1FullSyncWithConsent({full,args,
    host:approvedV1SyncOutput.parentElement,output:approvedV1SyncOutput,isCurrent});
  }
  if(action==='reconcile'){
   approvedV1SyncOutput.textContent='Elfogadott megjegyzes-elteres egyeztetesi nyugtaja. A feladatot nem irjuk ujra.';
   return full.reconcile(args);
  }
  if(action==='ahead'){
   approvedV1SyncOutput.textContent='V1 szinkron: '+payload.step+'. feladat elonaploja es ellenorzese...';
   return full.ahead(args);
  }
  if(action==='result'){
   const result=await full.result(args);
   approvedV1SyncOutput.textContent='V1 szinkron: '+result.document.step+'. feladat: '+result.document.status+
    '. Eredmenynaplo visszaellenorizve.';return result;
  }
  if(action==='finish'){
   const result=await full.finish(args);
   approvedV1SyncOutput.textContent='TELJES V1 SZINKRON LEZARVA. '+result.document.verifiedTaskCount+
    ' modosult feladat igazolva. Zaronyugta: '+result.receipt.name+'. V2 meg nem indult.';return result;
  }
  throw Error('Ismeretlen teljes V1 szinkronmuvelet.');
 }

 if(request.action==='inspect'){
  approvedV1SyncOutput.textContent='V1 pilot: a mar letezo checkpoint es naplok teljes visszaolvasasa. Nincs iras.';
  const report=await singleSyncStore.inspectV1Pilot({createdBy,editorId:payload.editorId});
  approvedV1SyncOutput.textContent='V1 pilot ellenorzes: '+report.status+'\nFeladat: '+report.taskName+
   '\nCheckpoint: sync-v1-prepared.json\nEz az ellenorzes nem ir a Monday-boardra.';
  return report;
 }
 if(request.action==='ahead'){
  // Show the independently read target, never an untrusted supplied task name.
  const report=await singleSyncStore.inspectV1Pilot({createdBy,editorId:payload.editorId});
  if(report.status!=='READY_FOR_PILOT'||report.taskId!==payload.taskId)
   throw Error('V1 pilot: mar van naplo vagy eltero a celfeladat; iras tiltva.');
  if(!window.confirm('VALODI MONDAY TEST-IRAS - pontosan egy feladat.\n'+
   report.taskName+' (#'+report.taskId+')\n'+
   'Eloszor tartos SharePoint elonaplo keszul. Ezutan a Monday egyszer megkiserli a feladat frissiteset.\n'+
   'A tobbi feladat nem irhato. Bizonytalan eredmenynel nincs ujraprobalas.\nFolytatod?'))
   throw Error('V1 pilot: a felhasznalo megszakitotta; nincs elonaplo vagy Monday-iras.');
  approvedV1SyncOutput.textContent='V1 pilot: WRITE_AHEAD mentese es visszaellenorzese...';
  const proof=await singleSyncStore.writeV1PilotAhead({...payload,createdBy,userConfirmed:true,
   requestId:request.requestId,expectedApprovedSha256:request.expectedApprovedSha256,
   expectedSessionId:request.expectedSessionId,expectedRevision:request.expectedRevision});
  approvedV1SyncOutput.textContent='V1 pilot elonaplo igazolva: '+proof.receipt.name+
   '\nA Monday az egyfeladatos iras eredmenyet kulon ellenorzi. Ne zard be ezt az ablakot.';
  return proof;
 }
 if(request.action==='result'){
  approvedV1SyncOutput.textContent='V1 pilot: a Monday visszaellenorzesi eredmenyenek tartos mentese...';
  const proof=await singleSyncStore.saveV1PilotResult({createdBy,result:payload.result});
  approvedV1SyncOutput.textContent='V1 pilot eredmenynaplo mentve es visszaellenorizve: '+proof.receipt.name+
   '\nAllapot: '+proof.document.status+'\nIrasi kiserlet: '+proof.document.mutationAttempts+
   '\nEz nem a teljes V1 terv szinkronja. Nincs automatikus kovetkezo feladat.';
  return proof;
 }
 throw Error('Ismeretlen V1 pilot muvelet.');
},onStatus:state=>{
 if(state==='ready'){
  showAccount(msal.getAllAccounts()[0]||null);
  singleDraftOutput.textContent='Kapcsolat létrejött a Monday TEST-alkalmazással. Jelentkezz be, majd hozd létre vagy folytasd a DRAFT-ot.';
 }
 if(state==='blocked')singleDraftOutput.textContent=
  'A DRAFT-mentés bizonytalan. A munkamenet csak független SharePoint-ellenőrzés után folytatható.';
}});
function singleStoreFor(account,boardId){
 const originalId=account.homeAccountId,tenant=account.tenantId;
 return createSingleDraftSessionStore({boardId,driveId,
  getAccessToken:pickerToken,getMeAccessToken:pickerMeToken,
  assertCurrent:()=>projectBoard.value.trim()===boardId&&
   msal.getAllAccounts()[0]?.homeAccountId===originalId&&
   msal.getAllAccounts()[0]?.tenantId===tenant});
}
function installV2EditorQueue(store,selected){
 const version=selected.planVersion;
 const queue=createImmutableDraftQueue({persist:async work=>{
  const proof=await store.append(work);singleSession=proof;return proof;
 },onState:state=>{
  singleDraftOutput.textContent=state.blocked?'V'+version+' DRAFT mentes leallitva: '+state.blocked:
   state.active?'V'+version+'.'+(state.verifiedRevision+1)+' feltoltes es visszaellenorzes...':
   'V'+version+(state.verifiedRevision?'.'+state.verifiedRevision:'')+
   ' DRAFT visszaellenorizve. Monday-iras: 0.';
 }});
 queue.open({sessionId:selected.sessionId,revision:selected.revision,sha256:selected.receipt.sha256});
 singleStore=store;singleSession=selected;singleSessionQueue=queue;
 singleDraftOutput.textContent='Aktiv '+selected.versionLabel+' DRAFT atadva a Monday szerkesztonek.';
}
async function openSingleSession(kind){
 if(singleBusy||singleSession)return;
 const boardId=projectBoard.value.trim(),account=msal.getAllAccounts()[0];
 if(boardId!=='5107075373'||!account||!singleBridge.active||!singleBridge.ready()){
  singleDraftOutput.textContent='A TEST projekt, Microsoft-bejelentkezés és a Monday TEST-ből indított kapcsolódás szükséges.';
  return;
 }
 if(kind==='start'&&!window.confirm('A SharePoint Approved Plan V0-ból új, '+
   'egyedüli aktív V1 munkamenetet hozunk létre. A Monday-board változatlan. Folytatod?'))return;
 singleBusy=true;createSingleDraft.disabled=true;resumeSingleDraft.disabled=true;
 singleDraftOutput.textContent=kind==='start'?
  'V0 teljes SharePoint-ellenőrzése és egyetlen V1 munkamenet lefoglalása...':
  'SharePoint V0, munkamenet-foglalás és minden DRAFT-revízió visszaellenőrzése...';
 try{
  const store=singleStoreFor(account,boardId);
  const selected=kind==='start'?await store.start({createdBy:account.homeAccountId}):
   await store.resume();
  const queue=createImmutableDraftQueue({
   persist:async work=>{
    const proof=await store.append(work);
    singleSession=proof;
    return proof;
   },
   onState:state=>{
    if(state.blocked)singleDraftOutput.textContent=
     'SharePoint DRAFT mentés LEÁLLÍTVA: '+state.blocked;
    else if(state.active)singleDraftOutput.textContent=
     'DRAFT V1.'+(state.verifiedRevision+1)+' feltöltés és visszaellenőrzés...';
    else if(state.verifiedRevision>0&&singleSession)
     singleDraftOutput.textContent='DRAFT V1.'+state.verifiedRevision+
      ' SharePointra mentve és SHA-256/eTag szerint visszaellenőrizve.';
   }
  });
  queue.open({sessionId:selected.sessionId,revision:selected.revision,
   sha256:selected.receipt.sha256});
  singleStore=store;singleSession=selected;singleSessionQueue=queue;
  const handed=singleBridge.active&&singleBridge.selected(selected);
  singleDraftOutput.textContent='Aktív munkamenet: '+selected.versionLabel+
   '\nProjekt: '+boardId+'\nSharePoint verzió: '+selected.receipt.name+
   '\nSHA-256: '+selected.receipt.sha256+
   '\nMonday-board módosítás: 0'+
   (handed?'\nEllenőrzött DRAFT átadva a Monday TEST szerkesztőnek.':
    '\nA kiválasztott munkamenet ellenőrzött. A Monday TEST-ből megnyitott '+
    'Uploader-ablakban a DRAFT automatikusan átadható.');
 }catch(error){
  singleDraftOutput.textContent='A DRAFT-munkamenet nem indítható/folytatható: '+
   (error?.message||error)+
   '\nBizonytalan SharePoint írás esetén nincs automatikus újrapróbálás.';
 }finally{
  singleBusy=false;
  const enabled=!!msal.getAllAccounts()[0]&&
   projectBoard.value.trim()==='5107075373'&&!singleSession&&
   singleBridge.active&&singleBridge.ready();
  createSingleDraft.disabled=!enabled;resumeSingleDraft.disabled=!enabled;
 }
}
async function inspectApprovedV1ForSync(){
 if(syncInspectBusy||singleSession||singleSyncSelected||syncPrepareBlocked)return;
 const boardId=projectBoard.value.trim(),account=msal.getAllAccounts()[0];
 if(boardId!=='5107075373'||!account||!singleBridge.active||
    !singleBridge.ready()){
  approvedV1SyncOutput.textContent='Az Approved Plan V1 csak a kapcsolt Monday TEST-ből, bejelentkezett Microsoft-fiókkal vizsgálható.';
  return;
 }
 syncInspectBusy=true;inspectApprovedV1Button.disabled=true;
 approvedV1SyncOutput.textContent='Approved Plan V1, V0, teljes DRAFT-lánc, freeze és jóváhagyási nyugta független SharePoint-visszaellenőrzése...';
 try{
  const store=singleStoreFor(account,boardId);
  const selected=await store.inspectApprovedSync({createdBy:account.homeAccountId});
  if(!singleBridge.approvedForSync(selected))
   throw Error('A Monday TEST nem fogadta el az Approved V1 szinkronellenőrzési átadást.');
  singleSyncStore=store;singleSyncSelected=selected;
  approvedV1SyncOutput.textContent='Approved Plan V1 SharePoint-verifikáció sikeres.\n'+
   'Fájl: '+selected.receipt.name+'\nSHA-256: '+selected.receipt.sha256+
   '\nFeladatok: '+selected.approvedPlan.plan.working.length+
   '\nMódosítás a Monday-boardon: 0.\n'+
   'A részletes szinkronelőnézetet a Monday TEST legalján nyisd meg.';
 }catch(error){
  approvedV1SyncOutput.textContent='Approved V1 szinkronellenőrzés sikertelen: '+
   (error?.message||error)+
   '\nNem történt Monday-írás. Ha valamelyik SharePoint-fájl sérült, ne folytasd.';
 }finally{
  syncInspectBusy=false;showAccount(msal.getAllAccounts()[0]||null);
 }
}
inspectApprovedV1Button.addEventListener('click',()=>void inspectApprovedV1ForSync());
createSingleDraft.addEventListener('click',()=>void openSingleSession('start'));
resumeSingleDraft.addEventListener('click',()=>void openSingleSession('resume'));
projectBoard.addEventListener('change',()=>{
 if(singleSession&&projectBoard.value.trim()!==singleSession.boardId){
  singleSessionQueue?.stop();
  singleBridge.close();
  singleDraftOutput.textContent='Projektváltás miatt a DRAFT-munkamenet lezárult az ablakban. Újratöltés és ellenőrzés szükséges.';
 }
 showAccount(msal.getAllAccounts()[0]||null);
});
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
let approvedSyncCandidate=null,pilotCheckpointCandidate=null,
 batchRecoveryCandidate=null,batchLedgerCandidate=null;
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
   document.querySelector('#finalizationIntentResult').textContent=
    'Approved Plan v'+result.version+' sikeresen létrehozva a SharePointon. '+
    'A Monday TEST változatlan; a szinkron külön szárazpróbával folytatható.';
   syncDryRunButton.disabled=false;
   syncDryRunOutput.textContent='Approved Plan ellenőrizve: '+result.name+
    '. A Monday szárazpróba külön gombbal indítható, írás nélkül.';
  }
 }
});

const syncCheckpointAction=mountSyncCheckpointAction({
 button:document.querySelector('#createSyncCheckpoint'),
 output:document.querySelector('#syncCheckpointResult'),
 driveId,tenantId,
 getCurrent:()=>({
  boardId:projectBoard.value.trim(),
  content:editedDraftText,validated:editedDraftChecked,
  saved:savedReview.currentProof(),approved:approvedSyncCandidate,
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
 confirm:message=>window.confirm(message),
 onStored:result=>{
  // This is an informational, origin-bound preview only, NOT Monday authorization.
  if(result?.status==='CHECKPOINT_PREPARED'&&result.checkpoint&&
     approvedSyncCandidate&&draftHandoff.publishVerifiedCheckpoint(result,approvedSyncCandidate)){
   pilotCheckpointCandidate=result;
   syncRecoveryAction.enable();
   document.querySelector('#syncCheckpointResult').textContent=
    'Checkpoint mentve és visszaellenőrizve: '+result.name+
    '\nA Monday TEST megkapta az egyfeladatos pilot-előnézetet.'+
    '\nTényleges Monday-írás: 0.';
  }
 }
});

const pilotJournalControl=mountSingleTaskJournalControl({
 button:document.querySelector('#confirmPilotWriteAhead'),
 output:document.querySelector('#pilotJournalResult'),
 driveId,
 getCurrent:()=>({
  boardId:projectBoard.value.trim(),
  approved:approvedSyncCandidate,checkpoint:pilotCheckpointCandidate,
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
 confirm:message=>window.confirm(message),
 onAheadVerified:(receipt,id)=>draftHandoff.publishPilotAhead(receipt,id),
 onResultVerified:(receipt,id)=>draftHandoff.publishPilotResult(receipt,id)
});

const syncRecoveryAction=mountSyncRecoveryAction({
 button:document.querySelector('#inspectSyncRecovery'),
 output:document.querySelector('#syncRecoveryResult'),driveId,
 getCurrent:()=>({
  boardId:projectBoard.value.trim(),
  approved:approvedSyncCandidate,checkpoint:pilotCheckpointCandidate,
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
 onInspected:(report,batchReport)=>{
  const sent=draftHandoff.publishSyncRecovery(report);
  const linked=sent&&batchReport?draftHandoff.publishBatchRecovery(batchReport):false;
  batchRecoveryCandidate=sent&&report.status==='RESULT_VERIFIED'?report:null;
  batchLedgerCandidate=linked?batchReport:null;
  return sent&&(!batchReport||linked);
 }
});

const storedSyncRecovery=mountStoredSyncRecovery({
 listButton:document.querySelector('#listStoredSyncCheckpoints'),
 select:document.querySelector('#storedSyncCheckpoint'),
 inspectButton:document.querySelector('#inspectStoredSyncCheckpoint'),
 output:document.querySelector('#storedSyncRecoveryResult'),
 driveId,
 getCurrent:()=>({
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
 },
 onInspected:entry=>draftHandoff.publishSyncRecovery?.(entry.report)===true
});
projectBoard.addEventListener('change',()=>storedSyncRecovery.clear());

const testBatchSession=mountTestBatchSession({
 button:document.querySelector('#confirmTestBatch'),
 output:document.querySelector('#testBatchResult'),
 driveId,
 getCurrent:()=>({
  boardId:projectBoard.value.trim(),approved:approvedSyncCandidate,
  checkpoint:pilotCheckpointCandidate,recovery:batchRecoveryCandidate,
  batchLedger:batchLedgerCandidate,validated:editedDraftChecked,saved:savedReview.currentProof(),
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
 confirm:message=>window.confirm(message),
 publishStart:id=>draftHandoff.publishBatchStart(id),
 publishJournal:(phase,proof,requestId,sessionId)=>
  draftHandoff.publishBatchJournal(phase,proof,requestId,sessionId)
});

const finalReceiptAction=mountFinalSyncReceiptAction({
 button:document.querySelector('#confirmFinalSyncReceipt'),
 output:document.querySelector('#finalSyncReceiptResult'),
 driveId,tenantId,
 getCurrent:()=>({
  boardId:projectBoard.value.trim(),approved:approvedSyncCandidate,
  checkpoint:pilotCheckpointCandidate,recovery:batchRecoveryCandidate,
  batchLedger:batchLedgerCandidate,account:msal.getAllAccounts()[0]||null
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
 confirm:message=>window.confirm(message),
 requestLiveClosure:(ledger,requestId)=>draftHandoff.requestFinalProof(ledger,requestId),
 onStored:(receipt,requestId)=>draftHandoff.publishFinalReceipt(receipt,requestId)
});

const editedFile=document.querySelector('#editedDraftFile');
const editedSave=document.querySelector('#saveEditedDraft');
const editedStatus=document.querySelector('#editedDraftStatus');
const editedResult=document.querySelector('#editedDraftSaveResult');
editedFile.addEventListener('change',async()=>{
 savedReview.clear();approvedPlanAction.clear();syncCheckpointAction.clear();pilotJournalControl.clear();syncRecoveryAction.clear();testBatchSession.clear();finalReceiptAction.clear();batchRecoveryCandidate=null;batchLedgerCandidate=null;pilotCheckpointCandidate=null;invalidateApprovedSyncCandidate();
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
 savedReview.clear();approvedPlanAction.clear();syncCheckpointAction.clear();pilotJournalControl.clear();syncRecoveryAction.clear();testBatchSession.clear();finalReceiptAction.clear();batchRecoveryCandidate=null;batchLedgerCandidate=null;pilotCheckpointCandidate=null;invalidateApprovedSyncCandidate();resetFinalizationIntent();
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
 savedReview.clear();approvedPlanAction.clear();syncCheckpointAction.clear();pilotJournalControl.clear();syncRecoveryAction.clear();testBatchSession.clear();finalReceiptAction.clear();batchRecoveryCandidate=null;batchLedgerCandidate=null;pilotCheckpointCandidate=null;invalidateApprovedSyncCandidate();resetFinalizationIntent();
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
},onSyncDryRunVerified:({boardId,report,approvedName,approvedSha256,approvedETag})=>{
 if(boardId!==projectBoard.value.trim()||!approvedSyncCandidate||
    approvedSyncCandidate.name!==approvedName||
    approvedSyncCandidate.sha256!==approvedSha256||
    approvedSyncCandidate.eTag!==approvedETag)return;
 if(syncCheckpointAction.receive(approvedSyncCandidate,report)){
  syncDryRunOutput.textContent='A Monday TEST sikeres szárazpróbája visszaigazolva. '+
   'Most a Sync-Status checkpoint külön gombbal elmenthető; Monday-írás továbbra sincs.';
 }
},onFinalReceiptRequested:request=>{
 if(!finalReceiptAction.receive(request)){
  document.querySelector('#finalSyncReceiptResult').textContent=
   'Zárónyugta-kérelem elutasítva: eltér a DRAFT, Approved Plan, checkpoint, '+
   'SharePoint-napló vagy a Microsoft-felhasználó.';
 }
},onBatchStartRequested:request=>{
 if(!testBatchSession.acceptStart(request)){
  document.querySelector('#testBatchResult').textContent=
   'Batch-engedélyezés elutasítva: eltér a Microsoft-fiók, Approved Plan vagy recovery.';
 }
},onBatchAheadRequested:request=>{
 void testBatchSession.acceptAhead(request);
},onBatchResultRequested:request=>{
 void testBatchSession.acceptResult(request);
},onPilotAheadRequested:request=>{
 if(!pilotJournalControl.acceptAhead(request)){
  document.querySelector('#pilotJournalResult').textContent=
   'Egyfeladatos előnaplózás elutasítva: a DRAFT/Approved Plan/checkpoint vagy a Microsoft-fiók nem egyezik.';
 }
},onPilotResultRequested:request=>{
 void pilotJournalControl.acceptResult(request);
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
