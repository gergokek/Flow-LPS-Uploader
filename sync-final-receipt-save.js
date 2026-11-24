import {checkApproverPreflight} from './approver-identity-preflight.js';
import {inspectStoredBatchProgress} from './sync-batch-recovery-inspect.js';

const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const nonempty=s=>typeof s==='string'&&s.length>0;
const MAX_BYTES=5_000_000;
const ALLOWED=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const serialized=o=>new TextEncoder().encode(JSON.stringify(o,null,2)+'\n');
const strict=(yes,message)=>{if(!yes)throw Error(message);};
const safeUrl=value=>{
 let u;try{u=new URL(value);}catch{throw Error('Hianyzo SharePoint letoltesi/feltoltesi URL.');}
 strict(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
  ALLOWED.some(x=>u.hostname.toLowerCase().endsWith(x)),
  'Nem megbizhato SharePoint ideiglenes URL.');
 return u.href;
};
export const finalReceiptName=approvedSha=>'sync-final-'+approvedSha.slice(0,24)+'.json';

// The only caller allowed to produce the final document is the user-confirmed
// Uploader controller. No Monday API calls are performed. A fresh, per-request
// whole-board attestation is obtained after full SharePoint journal inspection.
export async function saveFinalSyncReceipt({
 boardId,driveId,approvedReceipt,checkpointReceipt,pilotReport,
 tenantId,accountTenantId,getAccessToken,requestLiveClosure,
 assertCurrent=()=>true,fetcher=fetch,
 inspectBatch=inspectStoredBatchProgress,identityCheck=checkApproverPreflight,
 now=()=>new Date()
}={}){
 strict(boardId==='5107075373'&&/^b![-_a-zA-Z0-9]+$/.test(driveId||'')&&
  approvedReceipt?.status==='APPROVED_PLAN_STORED'&&
  approvedReceipt.boardId===boardId&&hex(approvedReceipt.sha256)&&
  approvedReceipt.mondaySyncAllowed===false&&
  approvedReceipt.approvedPlan?.format==='flow-lps-approved-plan'&&
  approvedReceipt.approvedPlan.boardId===boardId&&
  checkpointReceipt?.status==='CHECKPOINT_PREPARED'&&
  checkpointReceipt.boardId===boardId&&
  checkpointReceipt.approvedPlanSha256===approvedReceipt.sha256&&
  hex(checkpointReceipt.sha256)&&checkpointReceipt.mondayWrites===0&&
  checkpointReceipt.mondaySyncAllowed===false&&
  pilotReport?.status==='RESULT_VERIFIED'&&
  pilotReport.boardId===boardId&&
  pilotReport.approvedPlanSha256===approvedReceipt.sha256&&
  pilotReport.checkpointSha256===checkpointReceipt.sha256&&
  pilotReport.result?.status==='ITEM_READBACK_VERIFIED'&&
  pilotReport.result.readbackMatches===true&&hex(pilotReport.result.sha256)&&
  typeof getAccessToken==='function'&&
  typeof requestLiveClosure==='function'&&
  typeof assertCurrent==='function'&&typeof fetcher==='function'&&
  typeof inspectBatch==='function'&&typeof identityCheck==='function'&&
  typeof now==='function',
  'A vegleges TEST nyugta eloellenorzese hianyzik.');
 const check=()=>strict(assertCurrent()===true,
  'A DRAFT, Entra vagy Monday munkamenet megvaltozott. Nincs veglegesites.');
 check();
 const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const path=components=>'/root:/'+components.map(encodeURIComponent).join('/');
 const folder=['Projects',boardId,'Sync-Status'];
 const target=finalReceiptName(approvedReceipt.sha256);
 const location=path([...folder,target]);
 const get=async(suffix,options={})=>{
  check();
  const token=await getAccessToken();
  strict(nonempty(token),'Nincs Microsoft Graph token.');
  return fetcher(base+suffix,{method:'GET',redirect:'error',cache:'no-store',...options,
   headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
 };
 // First, inspect every immutable journal directly from SharePoint. Never
 // trust a browser-forwarded ALL_VERIFIED or a stale ledger as authority.
 const ledger=await inspectBatch({boardId,driveId,approvedReceipt,
  checkpointReceipt,getAccessToken,fetcher,assertCurrent:()=>{check();return true;},now});
 check();
 strict(ledger?.status==='ALL_VERIFIED'&&ledger.boardId===boardId&&
  ledger.approvedPlanSha256===approvedReceipt.sha256&&
  ledger.checkpointSha256===checkpointReceipt.sha256&&
  ledger.verifiedPilotTaskId===pilotReport.result.taskId&&
  hex(ledger.evidenceSha256)&&ledger.inspectedWithWrites===0&&
  ledger.automaticallyResume===false&&ledger.remainingTaskCount===0&&
  ledger.canPrepareNextBatch===false&&
  Number.isSafeInteger(ledger.verifiedBatchCount)&&
  Number.isSafeInteger(ledger.totalPendingBatchTasks)&&
  ledger.verifiedBatchCount===ledger.totalPendingBatchTasks,
  'A friss SharePoint batch-naplosor nem teljes.');
 // Ask Monday to independently recheck the actual entire board *after* Graph.
 const closure=await requestLiveClosure(ledger);
 check();
 const time=now().getTime(),inspected=Date.parse(closure?.inspectedAt),
  boardRead=Date.parse(closure?.boardCheckedAt),report=Date.parse(ledger.inspectedAt);
 strict(Number.isFinite(time)&&Number.isFinite(inspected)&&
  Number.isFinite(report)&&Math.abs(time-report)<=120000&&
  Math.abs(time-inspected)<=120000,
  'A friss Monday vagy SharePoint ellenorzes lejart.');
 strict(closure?.schemaVersion===1&&
  closure.format==='flow-lps-test-sync-closure-preview'&&
  closure.status==='ALL_VERIFIED_CLOSURE_PREVIEW'&&
  closure.readOnly===true&&closure.mutationAllowed===false&&
  closure.mondayWritesPerformed===0&&closure.automaticallyResume===false&&
  closure.closureReceiptStored===false&&closure.finalized===false&&
  closure.boardId===boardId&&
  closure.approvedPlanSha256===approvedReceipt.sha256&&
  closure.checkpointSha256===checkpointReceipt.sha256&&
  closure.sourceFingerprint===approvedReceipt.approvedPlan.sourceFingerprint&&
  closure.pilotTaskId===pilotReport.result.taskId&&
  closure.pilotResultSha256===pilotReport.result.sha256&&
  closure.ledgerEvidenceSha256===ledger.evidenceSha256&&
  closure.verifiedBatchTaskCount===ledger.verifiedBatchCount&&
  closure.changedTaskCount===ledger.verifiedBatchCount+1&&
  closure.remainingTaskCount===0&&
  nonempty(closure.boardFingerprint)&&
  closure.inspectedAt===ledger.inspectedAt,
  'A Monday teljes-board friss vegso bizonyiteka nem egyezik a SharePointtal.');
 const identity=await identityCheck({getAccessToken,fetcher,tenantId,accountTenantId});
 check();
 strict(nonempty(identity?.identity?.objectId)&&
  identity.identity.objectId.toLowerCase()===
  String(approvedReceipt.approvedPlan.finalization?.microsoftEntraObjectId||'').toLowerCase(),
  'A SharePoint bejelentkezett felhasznalo nem az Approved Plan jovahagyoja.');
 const filename=target;
 // The name is unique per Approved Plan; NEVER overwrite or reuse it.
 const exists=await get(location+'?$select=id,name');
 strict(exists.status===404,
  exists.ok?'Ehhez az Approved Planhez mar van tartos zaronugta. Nincs ujrairas.':
  'A SharePoint zaronugta nevellenorzese nem bizonyithato: HTTP '+exists.status);
 const data=Object.freeze({
  schemaVersion:1,format:'flow-lps-sync-final-receipt',
  status:'SYNC_FINALIZED_TEST',boardId,
  approvedPlanSha256:approvedReceipt.sha256,
  checkpointSha256:checkpointReceipt.sha256,
  sourceFingerprint:closure.sourceFingerprint,
  verifiedPilotTaskId:closure.pilotTaskId,
  pilotResultSha256:closure.pilotResultSha256,
  ledgerEvidenceSha256:closure.ledgerEvidenceSha256,
  boardFingerprint:closure.boardFingerprint,
  totalChangedTasks:closure.changedTaskCount,
  verifiedBatchTaskCount:closure.verifiedBatchTaskCount,
  remainingTaskCount:0,ledgerInspectedAt:ledger.inspectedAt,
  boardVerifiedAt:now().toISOString(),
  finalizedAt:now().toISOString(),
  finalizedByEntraObjectId:identity.identity.objectId,
  mondayWritesByFinalization:0,
  mondaySyncAllowed:false,automaticallyRetryable:false
 });
 const body=serialized(data);
 strict(body.byteLength<=MAX_BYTES,'A zaronugta tul nagy.');
 const hash=await sha(body);
 const folderResponse=await get(path(folder)+'?$select=id,name,folder,parentReference');
 strict(folderResponse.ok,'A SharePoint Sync-Status mappa nem ellenorizheto.');
 const folderItem=await folderResponse.json();
 strict(nonempty(folderItem?.id)&&folderItem.name==='Sync-Status'&&
  folderItem.folder&&folderItem.parentReference?.driveId===driveId,
  'A SharePoint Sync-Status mappa elter.');
 check();
 const session=await get('/items/'+encodeURIComponent(folderItem.id)+':/'+
  encodeURIComponent(filename)+':/createUploadSession',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',
   name:filename}})
 });
 strict(session.ok,'A konfliktusvedett zaronugta upload-session nem indithato.');
 const details=await session.json();
 const uploadUrl=safeUrl(details?.uploadUrl);
 strict(Number.isFinite(Date.parse(details?.expirationDateTime))&&
  Date.parse(details.expirationDateTime)>Date.now(),
  'Lejart Graph feltoltesi munkamenet.');
 check();
 let created;
 try{
  const upload=await fetcher(uploadUrl,{method:'PUT',mode:'cors',redirect:'error',
   cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/octet-stream',
    'Content-Range':'bytes 0-'+(body.byteLength-1)+'/'+body.byteLength},body});
  strict(upload.status===201,
   'Nem uj SharePoint fajlkent jott letre (HTTP '+upload.status+').');
  created=await upload.json();
 }catch(e){throw Error('A zaronugta feltoltese bizonytalan. NINCS automatikus ismetles: '+(e?.message||e));}
 strict(nonempty(created?.id)&&created.name===filename&&
  created.size===body.byteLength&&created.file,
  'A zaronugta letrehozasanak bizonyiteka hianyzik.');
 const metadata=async()=>{
  const response=await get(location+'?$select=id,name,size,file,parentReference,eTag');
  strict(response.ok,'Zaronugta metadata Graph HTTP '+response.status);
  const item=await response.json();
  strict(item?.id===created.id&&item.name===filename&&
   item.size===body.byteLength&&item.file&&nonempty(item.eTag)&&
   item.parentReference?.driveId===driveId,
   'A SharePoint zaronugta fajlazonosito / eTag elter.');
  return item;
 };
 const before=await metadata();
 const detailResponse=await get('/items/'+encodeURIComponent(created.id));
 strict(detailResponse.ok,'Zaronugta download metadata Graph HTTP '+detailResponse.status);
 const detail=await detailResponse.json();
 strict(detail?.id===before.id&&detail.eTag===before.eTag&&
  detail.size===before.size&&detail.name===before.name&&detail.file&&
  detail.parentReference?.driveId===driveId,
  'A zaronugta download metadata elter.');
 const downloaded=await fetcher(safeUrl(detail['@microsoft.graph.downloadUrl']),{
  method:'GET',mode:'cors',cache:'no-store',redirect:'follow',
  credentials:'omit',referrerPolicy:'no-referrer'});
 strict(downloaded.ok,'A zaronugta SharePoint visszaolvasasa sikertelen.');
 const bytes=await downloaded.arrayBuffer();
 strict(bytes.byteLength===body.byteLength&&await sha(bytes)===hash,
  'A SharePoint zaronugta tartalmi SHA-256 egyezese nem igazolt.');
 const after=await metadata();
 strict(after.eTag===before.eTag&&after.id===before.id&&
  after.size===before.size,'A zaronugta SharePoint fajlja valtozott.');
 check();
 return Object.freeze({
  status:'SYNC_FINAL_RECEIPT_STORED',boardId,
  name:filename,path:'Projects/'+boardId+'/Sync-Status/'+filename,
  id:before.id,eTag:before.eTag,sha256:hash,
  approvedPlanSha256:approvedReceipt.sha256,
  checkpointSha256:checkpointReceipt.sha256,
  ledgerEvidenceSha256:ledger.evidenceSha256,
  boardFingerprint:closure.boardFingerprint,
  verification:'content-sha256-and-etag',mondayWrites:0,
  automaticallyRetryable:false,receipt:data
 });
}
