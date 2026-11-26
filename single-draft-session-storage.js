import {createV2ApprovalSyncStore} from './v2-approval-sync-storage.js';
import {inspectV2Cycle} from './v2-approval-sync-contract.js';
import {inspectFullSyncEvidence} from './v1-full-sync-contract.js';
import {createVersionFolderCatalog} from './project-version-folder-catalog.js';
import {projectVerifiedCycleState} from './project-live-state-adapter.js';
import {createVersionedDraftStore} from './versioned-draft-storage.js';
import {createVersionedGraphFiles} from './versioned-graph-files.js';
import {createV2SessionStore} from './v2-session-storage.js';
import {createV1FullSyncStore} from './single-v1-full-sync-storage.js';
import {createV1PilotStore} from './single-v1-pilot-storage.js';
import {ACTIVE_NAME,BASELINE_NAME,V0_NAME,MAX_DRAFT_BYTES,
 sha256,hex,stable,inspectV0,newSessionClaim,makeBaseline,inspectRevision,
 makeNextDraft,revisionName} from './single-draft-session-core.js';
import {describeV1Approval,FREEZE_NAME,APPROVED_V1_NAME} from './single-draft-approval-core.js';
import {inspectApprovedV1,makeV1SyncCheckpoint,SYNC_CHECKPOINT_FILE,APPROVAL_RECEIPT_FILE} from './single-approved-v1-sync-core.js';

const safeDomains=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
function safeUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('Érvénytelen SharePoint feltöltési vagy letöltési URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    !safeDomains.some(s=>u.hostname.toLowerCase().endsWith(s)))
  throw Error('Tiltott SharePoint ideiglenes URL.');
 return u.href;
}
const requireValid=(c,m)=>{if(!c)throw Error(m);};
const bytes=value=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
export function createSingleDraftSessionStore({boardId,driveId,
 getAccessToken,getMeAccessToken=getAccessToken,fetcher=fetch,assertCurrent=()=>true,
 now=()=>new Date(),randomUUID=()=>crypto.randomUUID()}={}){
 requireValid(boardId==='5107075373'&&/^b![-_A-Za-z0-9]+$/.test(driveId||'')&&
  typeof getAccessToken==='function'&&typeof getMeAccessToken==='function'&&
  typeof fetcher==='function'&&
  typeof assertCurrent==='function'&&typeof now==='function'&&
  typeof randomUUID==='function',
  'Érvénytelen, nem izolált TEST SharePoint-munkamenet.');
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const folder=name=>['Projects',boardId,name];
 const urlOf=parts=>'/root:/'+parts.map(encodeURIComponent).join('/');
 const draftPath=name=>urlOf([...folder('Draft-Plans'),name]);
 const approvedPath=name=>urlOf([...folder('Approved-Plans'),name]);
 const check=()=>requireValid(assertCurrent()===true,
  'A Microsoft-felhasználó vagy az aktív projekt megváltozott.');
 const request=async(path,options={})=>{
  check();
  const token=await getAccessToken();
  requireValid(typeof token==='string'&&token.length>0,'Microsoft Graph token szükséges.');
  check();
  return fetcher(root+path,{method:'GET',cache:'no-store',redirect:'error',...options,
   headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
 };
 async function metadata(path){
  const res=await request(path+'?$select=id,name,size,file,parentReference,eTag');
  if(res.status===404)return null;
  requireValid(res.ok,'SharePoint fájlmetadata HTTP '+res.status);
  const item=await res.json();
  requireValid(!!item?.id&&!!item?.eTag&&!!item.file&&
   Number.isSafeInteger(item.size)&&item.size>0&&
   item.size<=MAX_DRAFT_BYTES&&item.parentReference?.driveId===driveId,
   'Hiányos, hibás vagy túlméretes SharePoint fájl.');
  return item;
 }
 async function readFile(path){
  const first=await metadata(path);
  if(!first)return null;
  const d=await request('/items/'+encodeURIComponent(first.id));
  requireValid(d.ok,'SharePoint fájl visszaolvasási metadata HTTP '+d.status);
  const info=await d.json();
  requireValid(info?.id===first.id&&info.name===first.name&&
   info.size===first.size&&info.eTag===first.eTag&&
   info.file&&info.parentReference?.driveId===driveId,
   'A SharePoint fájl azonosítója vagy eTag-je megváltozott.');
  const body=await fetcher(safeUrl(info['@microsoft.graph.downloadUrl']),{
   method:'GET',mode:'cors',cache:'no-store',redirect:'follow',
   credentials:'omit',referrerPolicy:'no-referrer'});
  requireValid(body.ok,'SharePoint tartalom letöltése sikertelen.');
  const data=await body.arrayBuffer();
  requireValid(data.byteLength===first.size,'SharePoint fájlméret eltér.');
  let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
  catch{throw Error('Hibás SharePoint JSON vagy UTF-8.');}
  const second=await metadata(path);
  requireValid(second?.id===first.id&&second.eTag===first.eTag&&
   second.size===first.size,'SharePoint fájl változott visszaolvasás közben.');
  check();
  return Object.freeze({value,sha256:await sha256(data),id:first.id,
   eTag:first.eTag,name:first.name,size:first.size});
 }
 async function folderMeta(name){
  const res=await request(urlOf(folder(name))+'?$select=id,name,folder,parentReference');
  requireValid(res.ok,'Hiányzik a SharePoint '+name+' mappa.');
  const item=await res.json();
  requireValid(item?.name===name&&!!item.id&&!!item.folder&&
   item.parentReference?.driveId===driveId,
   'Hibás SharePoint '+name+' mappa.');
  return item;
 }
 async function createFile(folderName,name,value){
  const data=bytes(value),hash=await sha256(data);
  requireValid(data.byteLength>0&&data.byteLength<=MAX_DRAFT_BYTES,
   'A DRAFT túllépi az 5 MB-os biztonsági korlátot.');
  const path=urlOf([...folder(folderName),name]);
  const exists=await request(path+'?$select=id,name');
  requireValid(exists.status===404,
   exists.ok?'A verzió már létezik; felülírás tiltva.':
   'A fájl létezése nem ellenőrizhető: '+exists.status);
  // Files are capped at 5 MB. The small-file Graph API supports atomic
  // create with conflictBehavior=fail, avoiding an intermediate upload session
  // while preserving the invariant that an existing claim can never be replaced.
  // 200 OK is never accepted for new files: only 201 Created is a valid proof.
  await folderMeta(folderName);
  let item;
  try{
   const response=await request(path+':/content?%40microsoft.graph.conflictBehavior=fail',{
    method:'PUT',headers:{'Content-Type':'application/octet-stream'},
    body:data
   });
   if(response.status!==201){
    let code='';
    try{
     const error=await response.json();
     if(/^[A-Za-z0-9_.:-]{1,64}$/.test(error?.error?.code||''))
      code=' / '+error.error.code;
    }catch{/* Do not leak response bodies, tokens, or temporary URLs. */}
    const hint=response.status===401||response.status===403?
     ' Ellenőrizd az Entra Sites.Selected és a SharePoint írási engedélyt.':
     response.status===409||response.status===412?
     ' A fájl már létezhet; felülírás nem engedélyezett.':'';
    throw Error('SharePoint DRAFT létrehozás HTTP '+response.status+code+'.'+hint);
   }
   item=await response.json();
  }catch(error){
   throw Error('A SharePoint-írás nem igazolt. Nincs automatikus újrapróbálás; '+
    'előbb ellenőrizd a fájlt. '+(error?.message||error));
  }
  requireValid(item?.name===name&&!!item.id&&item.size===data.byteLength&&
   !!item.file,'A SharePoint feltöltés válasza nem hitelesíthető.');
  const result=await readFile(path);
  requireValid(result?.id===item.id&&result.size===data.byteLength&&
   result.sha256===hash&&!!result.eTag,
   'A SharePoint teljes SHA-256/eTag visszaellenőrzése sikertelen.');
  check();
  return Object.freeze({...result,path:'Projects/'+boardId+'/'+folderName+'/'+name,
   verification:'content-sha256-and-etag',value:undefined});
 }
 async function readV0(){
  const file=await readFile(approvedPath(V0_NAME));
  requireValid(file!==null,'Hiányzik a manuálisan feltöltött '+V0_NAME+' Approved Plan.');
  inspectV0(file.value,boardId);
  return file;
 }
 async function claim(){
  const file=await readFile(draftPath(ACTIVE_NAME));
  if(!file)return null;
  const value=file.value;
  requireValid(value?.schemaVersion===1&&
   value.format==='mflow-single-draft-session'&&
   value.status==='ACTIVE'&&value.boardId===boardId&&
   value.planVersion===1&&value.baselineFile===BASELINE_NAME&&
   hex(value.approvedV0Sha256)&&
   typeof value.sessionId==='string',
   'Sérült aktív SharePoint munkamenet-azonosító.');
  return Object.freeze({value,sha256:file.sha256,id:file.id,eTag:file.eTag});
 }
 async function listRevisions(){
  const parent=await folderMeta('Draft-Plans');
  const result=new Map(),seenUrls=new Set(),seenIds=new Set();
  let next=root+'/items/'+encodeURIComponent(parent.id)+
   '/children?$select=id,name,file,size,eTag&$top=200';
  for(let page=0;next&&page<50;page++){
   requireValid(next.startsWith(root+'/')&&!seenUrls.has(next),
    'Nem biztonságos vagy ismétlődő SharePoint lapozás.');
   seenUrls.add(next);
   const response=await request(next.slice(root.length));
   requireValid(response.ok,'SharePoint DRAFT lista HTTP '+response.status);
   const data=await response.json();
   requireValid(Array.isArray(data?.value),'Hibás SharePoint verziólista.');
   for(const item of data.value){
    const match=/^draft-v1-r(\d{6})\.json$/.exec(item?.name||'');
    if(!match)continue;
    const rev=Number(match[1]);
    requireValid(rev>0&&rev<=999999&&item.file&&item.id&&item.eTag&&
     item.size>0&&item.size<=MAX_DRAFT_BYTES&&
     !result.has(rev)&&!seenIds.has(item.id),
     'Ütköző, hibás vagy duplikált DRAFT-revízió.');
    result.set(rev,item.name);seenIds.add(item.id);
   }
   next=data['@odata.nextLink']||null;
   requireValid(!next||next.startsWith(root+'/'),
    'Eltérő SharePoint lapozási host.');
  }
  requireValid(!next,'A SharePoint DRAFT lista lapozása nem teljes.');
  const sorted=[...result].sort((a,b)=>a[0]-b[0]);
  sorted.forEach(([rev],index)=>requireValid(rev===index+1,
   'Hiányzó DRAFT-verzió; nem folytatható a munkamenet.'));
  return sorted;
 }
 async function start({createdBy}={}){
  check();
  const v0=await readV0();
  const current=await claim();
  requireValid(!current,'A projekthez már tartozik aktív munkamenet; folytasd azt.');
  requireValid(await readFile(draftPath(BASELINE_NAME))===null,
   'A V1 kiinduló DRAFT létezik, de nincs érvényes foglalás; kézi ellenőrzés szükséges.');
  const claimValue=newSessionClaim({boardId,
   sessionId:randomUUID(),approvedV0Sha256:v0.sha256,
   createdBy,createdAt:now().toISOString()});
  // This immutable file is the atomic project-wide session claim.
  // If the baseline save fails, recovery must reconcile the claim first.
  const savedClaim=await createFile('Draft-Plans',ACTIVE_NAME,claimValue);
  const baseline=makeBaseline({v0:v0.value,claim:claimValue});
  inspectRevision(baseline,claimValue,0,null);
  const saved=await createFile('Draft-Plans',BASELINE_NAME,baseline);
  return Object.freeze({status:'ACTIVE',boardId,
   sessionId:claimValue.sessionId,planVersion:1,revision:0,
   versionLabel:'V1',sourceApprovedSha256:v0.sha256,
   claimReceipt:savedClaim,receipt:saved,draft:baseline});
 }
 async function resume({allowFrozen=false}={}){
  check();
  const current=await claim();
  const freeze=await readFile(draftPath(FREEZE_NAME));
  if(freeze&&!allowFrozen)
   throw Error('A V1 munkamenet jóváhagyásra zárolva; további szerkesztés és automatikus folytatás TILTVA.');
  requireValid(!!current,'Nincs aktív DRAFT-munkamenet.');
  const v0=await readV0();
  requireValid(current.value.approvedV0Sha256===v0.sha256,
   'A V0 Approved Plan eltér az aktív munkamenet kiindulásától.');
  const versions=await listRevisions();
  let file=await readFile(draftPath(BASELINE_NAME));
  requireValid(!!file,'Az aktív munkamenet V1 kiinduló fájlja hiányzik.');
  const original=makeBaseline({v0:v0.value,claim:current.value});
  requireValid(file.value.source===original.source&&
   stable(file.value.working)===stable(original.working),
   'A V1 kiinduló DRAFT eltér az eredeti V0-tól.');
  inspectRevision(file.value,current.value,0,null);
  let last=file,lastRevision=0;
  for(const [rev,name] of versions){
   const next=await readFile(draftPath(name));
   requireValid(!!next,'A DRAFT-listában szereplő revízió eltűnt.');
   inspectRevision(next.value,current.value,rev,last.sha256);
   requireValid(next.value.source===original.source&&
    stable(next.value.base)===stable(original.base),
    'A DRAFT módosította a V0 kiinduló adatokat.');
   last=next;lastRevision=rev;
  }
  if(freeze){
   requireValid(freeze.value?.schemaVersion===1&&
    freeze.value.format==='mflow-single-draft-freeze'&&
    freeze.value.status==='APPROVAL_FROZEN'&&
    freeze.value.sessionId===current.value.sessionId&&
    freeze.value.boardId===boardId&&
    freeze.value.revision===lastRevision&&
    freeze.value.finalDraftSha256===last.sha256,
    'A zárolt V1 munkamenet és a SharePoint DRAFT-verzió eltér.');
  }
  check();
  return Object.freeze({status:'ACTIVE',boardId,
   sessionId:current.value.sessionId,planVersion:1,
   revision:lastRevision,versionLabel:'V1'+(lastRevision?'.'+lastRevision:''),
   sourceApprovedSha256:v0.sha256,claimReceipt:current,
   receipt:{name:last.name,id:last.id,eTag:last.eTag,
    sha256:last.sha256,verification:'content-sha256-and-etag'},
   draft:last.value});
 }
 async function append({updatedDraft,expectedSessionId,expectedParentSha256}={}){
  check();
  const verified=await resume();
  requireValid(verified.sessionId===expectedSessionId&&
   verified.receipt.sha256===expectedParentSha256,
   'Időközben másik módosítás történt; friss DRAFT-ellenőrzés szükséges.');
  const draft=makeNextDraft({previous:verified.draft,
   claim:(await claim()).value,
   previousSha256:expectedParentSha256,updated:updatedDraft});
  requireValid(await readFile(draftPath(FREEZE_NAME))===null,
   'A V1 már véglegesítés alatt áll; DRAFT-módosítás tiltva.');
  const saved=await createFile('Draft-Plans',revisionName(draft.version),draft);
  check();
  return Object.freeze({status:'SAVED',boardId,
   sessionId:verified.sessionId,planVersion:1,revision:draft.version,
   versionLabel:'V1.'+draft.version,receipt:saved,draft});
 }
 async function reviewApproval({expectedSessionId,expectedRevision,
  expectedSha256,createdBy,editorId}={}){
  check();
  const verified=await resume();
  requireValid(verified.sessionId===expectedSessionId&&
   verified.revision===expectedRevision&&verified.receipt.sha256===expectedSha256,
   'A Monday ellenőrzött DRAFT-verziója és a SharePoint legfrissebb verziója eltér.');
  const v0=await readV0();
  const planned=describeV1Approval({verified,v0:v0.value,createdBy,editorId,
   at:now().toISOString()});
  return Object.freeze({...planned.review,readOnly:true,
   latestDraftVerified:true});
 }
 async function approve({expectedSessionId,expectedRevision,expectedSha256,
  createdBy,editorId,boardVerifiedAt,boardFingerprintSha256}={}){
  check();
  const readTime=Date.parse(boardVerifiedAt),currentTime=now().getTime();
  requireValid(hex(expectedSha256)&&hex(boardFingerprintSha256)&&
   Number.isFinite(readTime)&&Number.isFinite(currentTime)&&
   readTime<=currentTime&&currentTime-readTime<=120000&&
   typeof editorId==='string'&&/^\d+$/.test(editorId),
   'Friss, teljes Monday-board visszaolvasás és szerkesztői azonosító szükséges.');
  const verified=await resume();
  requireValid(verified.sessionId===expectedSessionId&&
   verified.revision===expectedRevision&&
   verified.receipt.sha256===expectedSha256,
   'A DRAFT megváltozott a Monday véglegesítési előnézetének elkészítése óta.');
  const v0=await readV0();
  const plan=describeV1Approval({verified,v0:v0.value,createdBy,editorId,
   at:now().toISOString()});
  const boardDigest=await sha256(new TextEncoder().encode(plan.approved.sourceFingerprint));
  requireValid(boardDigest===boardFingerprintSha256,
   'A Monday-board és a V0 kiinduló állapot SHA-256 bizonyítéka eltér.');
  // Delegated Entra identity is read from Graph, not from a postMessage body.
  const token=await getMeAccessToken();
  requireValid(typeof token==='string'&&token.length>0,
   'Microsoft Graph User.Read token szükséges az Approved Planhoz.');
  const who=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName',{
   method:'GET',cache:'no-store',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  requireValid(who.ok,'A Microsoft Graph /me azonosítás sikertelen: HTTP '+who.status);
  const me=await who.json();
  requireValid(typeof createdBy==='string'&&
   /^[0-9a-f-]{36}\.[0-9a-f-]{36}$/i.test(createdBy)&&
   me?.id?.toLowerCase()===createdBy.split('.')[0].toLowerCase(),
   'A Microsoft Graph /me eltér a V1 munkamenet eredeti Entra-azonosságától.');
  requireValid(typeof me?.id==='string'&&
   /^[0-9a-f-]{36}$/i.test(me.id)&&
   typeof me?.userPrincipalName==='string'&&!!me.userPrincipalName,
   'Érvénytelen Microsoft Entra személyazonosság.');
  const approvalPlan=structuredClone(plan.approved);
  approvalPlan.finalization.microsoftEntraObjectId=me.id;
  approvalPlan.finalization.microsoftUserPrincipalName=me.userPrincipalName;
  approvalPlan.finalization.boardVerifiedAt=boardVerifiedAt;
  approvalPlan.finalization.boardFingerprintSha256=boardFingerprintSha256;
  // Preflight: no pre-existing or ambiguous approval artifacts.
  requireValid(await readFile(draftPath(FREEZE_NAME))===null&&
   await readFile(approvedPath(APPROVED_V1_NAME))===null&&
   await readFile(draftPath('session-v1-approved.json'))===null,
   'A V1 véglegesítése már elindult vagy elkészült; tilos automatikusan újrapróbálni.');
  check();
  const freeze=await createFile('Draft-Plans',FREEZE_NAME,plan.freeze);
  // After freezing, re-read every immutable revision and verify the final
  // snapshot did not advance concurrently. A drift blocks approval.
  const frozen=await resume({allowFrozen:true});
  requireValid(frozen.revision===verified.revision&&
   frozen.receipt.sha256===verified.receipt.sha256&&
   frozen.sessionId===verified.sessionId,
   'A V1 megváltozott a véglegesítési zárolás alatt; kézi egyeztetés szükséges.');
  const approved=await createFile('Approved-Plans',APPROVED_V1_NAME,approvalPlan);
  // Final readback ensures the SharePoint plan refers to the same immutable V1.X.
  const post=await resume({allowFrozen:true});
  requireValid(post.revision===verified.revision&&
   post.receipt.sha256===verified.receipt.sha256,
   'A DRAFT eltér a mentett Approved Plantől; nincs sikeres zárás.');
  const marker={
   schemaVersion:1,format:'mflow-single-draft-approval-receipt',
   status:'APPROVED_PLAN_V1_STORED',boardId,planVersion:1,
   sessionId:verified.sessionId,revision:verified.revision,
   finalDraftSha256:verified.receipt.sha256,
   approvedPlanSha256:approved.sha256,
   approvedPlanId:approved.id,approvedPlanETag:approved.eTag,
   approvedPlanName:APPROVED_V1_NAME,
   frozenSha256:freeze.sha256,
   microsoftEntraObjectId:me.id,approvedAt:now().toISOString(),
   mondayWrites:0,automaticallyRetryable:false
  };
  const receipt=await createFile('Draft-Plans','session-v1-approved.json',marker);
  check();
  return Object.freeze({status:'APPROVED_PLAN_V1_STORED',boardId,
   planVersion:1,revision:verified.revision,sessionId:verified.sessionId,
   finalDraftSha256:verified.receipt.sha256,
   approvedPlan:{name:approved.name,id:approved.id,eTag:approved.eTag,
    sha256:approved.sha256,path:approved.path,
    verification:approved.verification},
   freezeSha256:freeze.sha256,receiptSha256:receipt.sha256,
   mondayWrites:0,mondaySyncAllowed:false,readOnlyBoard:true});
 }
 async function inspectApprovedSync({createdBy}={}){
  check();
  const current=await resume({allowFrozen:true});
  const [approved,freeze,approvalReceipt,v0]=await Promise.all([
   readFile(approvedPath(APPROVED_V1_NAME)),
   readFile(draftPath(FREEZE_NAME)),
   readFile(draftPath(APPROVAL_RECEIPT_FILE)),
   readV0()
  ]);
  requireValid(approved&&freeze&&approvalReceipt,
   'A jóváhagyott V1 és a hozzá tartozó két lezárási nyugta nem teljes.');
  const verified=inspectApprovedV1({verified:current,approved,freeze,
   approvalReceipt,v0,createdBy});
  check();
  return verified;
 }
 async function prepareApprovedSync({expectedApprovedSha256,createdBy,
   editorId,boardVerifiedAt,boardFingerprintSha256}={}){
  check();
  const approved=await inspectApprovedSync({createdBy});
  requireValid(approved.receipt.sha256===expectedApprovedSha256,
   'Az Approved Plan V1 időközben megváltozott.');
  const expectedBoardSha=await sha256(new TextEncoder().encode(
   approved.sourceFingerprint));
  requireValid(expectedBoardSha===boardFingerprintSha256,
   'A Monday-board aktuális állapota nem a jóváhagyott V0 forrás.');
  const token=await getMeAccessToken();
  requireValid(typeof token==='string'&&!!token,
   'Graph User.Read token szükséges a szinkron-előkészítéshez.');
  const response=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName',{
   method:'GET',cache:'no-store',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  requireValid(response.ok,
   'Microsoft Graph Entra identity HTTP '+response.status);
  const me=await response.json();
  requireValid(typeof createdBy==='string'&&
   /^[0-9a-f-]{36}\.[0-9a-f-]{36}$/i.test(createdBy)&&
   me?.id?.toLowerCase()===createdBy.split('.')[0].toLowerCase()&&
   me.id.toLowerCase()===
    approved.approvedPlan.finalization.microsoftEntraObjectId.toLowerCase(),
   'A Microsoft felhasználó eltér az Approved Plan V1 jóváhagyójától.');
  const prepared=makeV1SyncCheckpoint({verified:approved,editorId,
   createdBy,at:now().toISOString(),boardVerifiedAt,
   boardFingerprintSha256,microsoftEntraObjectId:me.id});
  requireValid(await readFile(urlOf([...folder('Sync-Status'),SYNC_CHECKPOINT_FILE]))===null,
   'Már létezik V1 szinkron-előkészítő fájl; nem próbáljuk felülírni.');
  const saved=await createFile('Sync-Status',SYNC_CHECKPOINT_FILE,prepared);
  const rechecked=await inspectApprovedSync({createdBy});
  requireValid(rechecked.receipt.sha256===approved.receipt.sha256&&
   rechecked.approvalReceiptSha256===approved.approvalReceiptSha256,
   'Az Approved Plan V1 változott a checkpoint mentése közben.');
  check();
  return Object.freeze({
   status:'PREPARED_NO_WRITES',boardId,planVersion:1,
   approvedSha256:approved.receipt.sha256,
   checkpoint:{name:saved.name,sha256:saved.sha256,eTag:saved.eTag,
    id:saved.id,path:saved.path,verification:saved.verification},
   mondayWrites:0,mutationAttempts:0,writeAuthorization:'NOT_GRANTED'
  });
 }
 const pilot=createV1PilotStore({
  readApproved:inspectApprovedSync,
  readSync:name=>readFile(urlOf([...folder('Sync-Status'),name])),
  createSync:(name,value)=>createFile('Sync-Status',name,value),check,now,
  identify:async()=>{
   check();const token=await getMeAccessToken();
   requireValid(typeof token==='string'&&!!token,'Graph User.Read token required.');
   const response=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName',{
    method:'GET',cache:'no-store',redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
   requireValid(response.ok,'V1 pilot Graph /me HTTP '+response.status);
   const me=await response.json();check();return me;
  }
 });

 async function listFullSyncFiles(prefix='sync-v1-step-'){
  const parent=await folderMeta('Sync-Status'),out=[],seen=new Set(),names=new Set();
  let next=root+'/items/'+encodeURIComponent(parent.id)+'/children?$select=id,name,file,size,eTag&$top=200';
  for(let page=0;next&&page<50;page++){
   requireValid(next.startsWith(root+'/')&&!seen.has(next),'Invalid Sync-Status pagination.');seen.add(next);
   const response=await request(next.slice(root.length));
   requireValid(response.ok,'Sync-Status list HTTP '+response.status);
   const data=await response.json();requireValid(Array.isArray(data.value),'Invalid Sync-Status list.');
   for(const item of data.value){
    if(!item.name?.startsWith(prefix))continue;
    requireValid(item.file&&item.id&&item.eTag&&!names.has(item.name),'Invalid/duplicate V1 journal.');
    names.add(item.name);out.push(item);
   }
   next=data['@odata.nextLink']||null;
  }
  requireValid(!next,'Incomplete Sync-Status pagination.');return out;
 }
 async function verifyPinnedV1(e,createdBy){
   check();const refs=[e.receipt,e.checkpointReceipt,e.ahead.receipt,e.result.receipt];
   for(const receipt of refs){
    const folderName=receipt.name==='approved-v1.json'?'Approved-Plans':'Sync-Status';
    const current=await metadata(urlOf([...folder(folderName),receipt.name]));
    requireValid(current?.id===receipt.id&&current.eTag===receipt.eTag,'Pinned V1 evidence changed.');
   }
   const token=await getMeAccessToken();requireValid(!!token,'Graph identity token required.');
   const response=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id',{
    method:'GET',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
   requireValid(response.ok,'Full sync identity HTTP '+response.status);
   const me=await response.json();
   requireValid(me?.id?.toLowerCase()===e.checkpoint.microsoftEntraObjectId.toLowerCase()&&
    createdBy===e.checkpoint.createdBy,'Full sync identity changed.');check();
 }
 const full=createV1FullSyncStore({inspectPilot:pilot.inspect,
  readSync:name=>readFile(urlOf([...folder('Sync-Status'),name])),listSync:listFullSyncFiles,
  createSync:(name,value)=>createFile('Sync-Status',name,value),check,now,checkPinned:verifyPinnedV1});
 async function listAllDraftFiles(){
  const parent=await folderMeta('Draft-Plans'),out=[],seen=new Set();
  let next=root+'/items/'+encodeURIComponent(parent.id)+'/children?$select=id,name,file,size,eTag&$top=200';
  for(let n=0;next&&n<50;n++){
   requireValid(next.startsWith(root+'/')&&!seen.has(next),'Invalid DRAFT pagination.');seen.add(next);
   const response=await request(next.slice(root.length));
   requireValid(response.ok,'DRAFT list HTTP '+response.status);
   const data=await response.json();requireValid(Array.isArray(data.value),'Invalid DRAFT listing.');
   out.push(...data.value);next=data['@odata.nextLink']||null;
  }
  requireValid(!next,'Incomplete DRAFT listing.');return out;
 }
 const nextSession=createV2SessionStore({inspectCompleted:args=>full.inspect(args),
  readDraft:name=>readFile(draftPath(name)),listDraft:listAllDraftFiles,
  createDraft:(name,value)=>createFile('Draft-Plans',name,value),check,now,randomUUID,
  checkPinned:async(e,oldClaim,createdBy)=>{
   await verifyPinnedV1(e,createdBy);
   for(const [folderName,receipt] of [['Sync-Status',e.final.receipt],['Draft-Plans',oldClaim.receipt]]){
    const current=await metadata(urlOf([...folder(folderName),receipt.name]));
    requireValid(current?.id===receipt.id&&current.eTag===receipt.eTag,'V1 closure source changed.');
   }check();
  }});
 const v2Flow=createV2ApprovalSyncStore({
  inspectSession:args=>nextSession.inspect(args),refreshSession:args=>nextSession.refresh(args),
  read:(folderName,name)=>readFile(urlOf([...folder(folderName),name])),
  listSync:()=>listFullSyncFiles('sync-v2-'),create:(folderName,name,value)=>{
   const allowed=(folderName==='Draft-Plans'&&['session-v2-freeze.json','session-v2-approved.json'].includes(name))||
    (folderName==='Approved-Plans'&&name==='approved-v2.json')||
    (folderName==='Sync-Status'&&(name==='sync-v2-completed.json'||/^sync-v2-step-\d{6}-(ahead|result)\.json$/.test(name)));
   requireValid(allowed,'Tiltott V2 fajlcel.');return createFile(folderName,name,value);
  },check,now,checkPinned:async(report,createdBy)=>{
   await verifyPinnedV1(report.session.evidence,createdBy);
   const pairs=[report.session.oldClaim,report.session.closure,report.session.claim,report.session.baseline,
    ...report.session.revisions,report.session.evidence.final,report.freeze,report.approved,report.approval,
    ...report.records.flatMap(r=>[r.ahead,r.result]),report.final].filter(Boolean);
   // Metadata pins are sufficient between independent full-content scans.
   for(let i=0;i<pairs.length;i+=4)await Promise.all(pairs.slice(i,i+4).map(async pair=>{
    const r=pair.receipt,folderName=r.path.split('/')[2];
    const current=await metadata(urlOf([...folder(folderName),r.name]));
    requireValid(current?.id===r.id&&current.eTag===r.eTag,'A V2 kapcsolt bizonyitek megvaltozott.');
   }));check();
  }});
 // Independent V3 namespace: no legacy Graph path is reused, V2 is read only.
 const v3Graph=createVersionedGraphFiles({boardId,version:3,driveId,getAccessToken,fetcher,
  assertCurrent:()=>{check();return true;}});
 const nextVersion=createVersionedDraftStore({version:3,
  inspectSource:args=>v2Flow.inspect(args),
  read:v3Graph.read,list:v3Graph.list,create:v3Graph.create,
  ensureFolders:v3Graph.ensureFolders,
  readBoard:async args=>args.boardSnapshot,
  now,randomUUID,check,
  checkPinned:async(args,model)=>{
   const report=await v2Flow.inspect(args);
   requireValid(report?.final?.receipt?.sha256===model.source.completionSha256&&
    report?.approved?.receipt?.sha256===model.source.approvedSha256,
    'A V2 kiindulo bizonyitek megvaltozott.');
   check();
  }});
 // Read-only CURRENT PROJECT discovery. No version is allocated here.
 const versionFolders=createVersionFolderCatalog({boardId,driveId,getAccessToken,fetcher,
  assertCurrent:()=>{check();return true;}});
 async function inspectPlanningState({createdBy,editorId,boardFingerprint}={}){
  check();requireValid(typeof createdBy==='string'&&createdBy.length>0&&
   typeof editorId==='string'&&/^\\d+$/.test(editorId)&&
   typeof boardFingerprint==='string'&&boardFingerprint.length>0,
   'Friss Monday-board es bejelentkezett szerkeszto szukseges.');
  const args={createdBy,editorId};
  const v0=await readV0();check();
  const v1Report=await full.inspect(args);
  const v1State=await inspectFullSyncEvidence(v1Report.evidence,editorId,now().getTime());check();
  const v2Report=await v2Flow.inspect(args);
  const v2State=await inspectV2Cycle(v2Report,editorId,createdBy,now().getTime());check();
  const oldV1Claim=await readFile(draftPath('active-session.json'));check();
  requireValid(!!oldV1Claim,'Hianyzo eredeti V1 munkamenetnyugta.');
  // Legacy versions are passed ONLY after their complete independent validation.
  const catalog=await versionFolders.inspect({legacyVersions:[1,2]});check();
  const v3Report=catalog.versions.includes(3)?
   await nextVersion.inspect(args):null;
  check();
  const result=projectVerifiedCycleState({boardId,approvedV0:v0,
   oldV1Claim,v1Report,v1State,v2Report,v2State,v3Report,
   folderCatalog:catalog,boardFingerprint});
  return structuredClone({...result,checkedAt:now().toISOString(),
   readOnly:true,mondayWrites:0});
 }
 return Object.freeze({start,resume,append,readV0,reviewApproval,approve,
  inspectApprovedSync,prepareApprovedSync,
  inspectV1Pilot:pilot.inspect,writeV1PilotAhead:pilot.writeAhead,
  saveV1PilotResult:pilot.saveResult,fullSync:full,nextSession,v2Flow,nextVersion,inspectPlanningState});
}
