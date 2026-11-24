// Read-only recovery for a durable TEST closure receipt after browser restart.
// This verifies historical SharePoint evidence, NOT that Monday remains unchanged.
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',x)),b=>b.toString(16).padStart(2,'0')).join('');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const allowed=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
const safeUrl=value=>{
 let u;try{u=new URL(value);}catch{throw Error('Hianyzo Graph tartalom URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    !allowed.some(t=>u.hostname.toLowerCase().endsWith(t)))
  throw Error('Tiltott SharePoint letoltesi forras.');
 return u.href;
};
export async function inspectStoredFinalSyncReceipt({
 boardId,driveId,approvedReceipt,checkpointReceipt,pilotReport,batchReport,
 getAccessToken,fetcher=fetch,assertCurrent=()=>true
}={}){
 if(boardId!=='5107075373'||!/^b![-_a-zA-Z0-9]+$/.test(driveId||'')||
    approvedReceipt?.status!=='APPROVED_PLAN_STORED'||
    approvedReceipt.boardId!==boardId||!hex(approvedReceipt.sha256)||
    checkpointReceipt?.status!=='CHECKPOINT_PREPARED'||
    checkpointReceipt.boardId!==boardId||
    checkpointReceipt.approvedPlanSha256!==approvedReceipt.sha256||
    !hex(checkpointReceipt.sha256)||
    pilotReport?.status!=='RESULT_VERIFIED'||
    pilotReport.result?.status!=='ITEM_READBACK_VERIFIED'||
    !hex(pilotReport.result.sha256)||
    batchReport?.status!=='ALL_VERIFIED'||
    batchReport.approvedPlanSha256!==approvedReceipt.sha256||
    batchReport.checkpointSha256!==checkpointReceipt.sha256||
    batchReport.remainingTaskCount!==0||
    !hex(batchReport.evidenceSha256)||
    typeof getAccessToken!=='function'||typeof fetcher!=='function'||
    typeof assertCurrent!=='function')
  throw Error('Nem igazolt a tarolt TEST szinkron elozmenye.');
 const check=()=>{if(assertCurrent()!==true)
  throw Error('A Microsoft SharePoint munkamenet megvaltozott.');};
 const filename='sync-final-'+approvedReceipt.sha256.slice(0,24)+'.json';
 const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const url=base+'/root:/'+['Projects',boardId,'Sync-Status',filename]
  .map(encodeURIComponent).join('/')+'?$select=id,name,size,file,parentReference,eTag';
 const graph=async address=>{
  check();const token=await getAccessToken();if(!token)throw Error('Hianyzo Graph token.');
  return fetcher(address,{method:'GET',cache:'no-store',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 };
 const meta=async()=>{
  const response=await graph(url);
  if(response.status===404)return null;
  if(!response.ok)throw Error('SharePoint zaronugta metadata HTTP '+response.status);
  const file=await response.json();
  if(file?.name!==filename||!file.id||!file.file||!file.eTag||
     file.parentReference?.driveId!==driveId||
     !Number.isSafeInteger(file.size)||file.size<1||file.size>5_000_000)
   throw Error('A tarolt zaronugta metadata hianyos vagy elter.');
  return file;
 };
 const first=await meta();
 if(!first)return Object.freeze({status:'FINAL_RECEIPT_NOT_FOUND',
  boardId,approvedPlanSha256:approvedReceipt.sha256,readOnly:true});
 const infoResponse=await graph(base+'/items/'+encodeURIComponent(first.id));
 if(!infoResponse.ok)throw Error('Zaronugta letoltesi metadata HTTP '+infoResponse.status);
 const info=await infoResponse.json();
 if(info?.id!==first.id||info?.name!==first.name||info?.eTag!==first.eTag||
    info?.size!==first.size||!info.file||info.parentReference?.driveId!==driveId)
  throw Error('A zaronugta letoltesi metadataja elter.');
 const download=await fetcher(safeUrl(info['@microsoft.graph.downloadUrl']),{
  method:'GET',mode:'cors',cache:'no-store',redirect:'follow',
  credentials:'omit',referrerPolicy:'no-referrer'});
 if(!download.ok)throw Error('A SharePoint zaronugta letoltese sikertelen.');
 const bytes=await download.arrayBuffer();
 if(bytes.byteLength!==first.size)throw Error('A zaronugta merete elter.');
 const hash=await sha(bytes);
 let value;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw Error('A zaronugta nem ervenyes UTF-8 JSON.');}
 if(value?.schemaVersion!==1||value.format!=='flow-lps-sync-final-receipt'||
    value.status!=='SYNC_FINALIZED_TEST'||value.boardId!==boardId||
    value.approvedPlanSha256!==approvedReceipt.sha256||
    value.checkpointSha256!==checkpointReceipt.sha256||
    value.sourceFingerprint!==approvedReceipt.approvedPlan?.sourceFingerprint||
    value.verifiedPilotTaskId!==pilotReport.result.taskId||
    value.pilotResultSha256!==pilotReport.result.sha256||
    value.ledgerEvidenceSha256!==batchReport.evidenceSha256||
    value.verifiedBatchTaskCount!==batchReport.verifiedBatchCount||
    value.totalChangedTasks!==batchReport.verifiedBatchCount+1||
    value.remainingTaskCount!==0||!hex(value.boardFingerprint)||
    value.mondayWritesByFinalization!==0||
    value.mondaySyncAllowed!==false||
    value.automaticallyRetryable!==false||
    !Number.isFinite(Date.parse(value.ledgerInspectedAt))||
    !Number.isFinite(Date.parse(value.boardVerifiedAt))||
    !Number.isFinite(Date.parse(value.finalizedAt)))
  throw Error('A tarolt SharePoint zaronugta tartalma nem egyezik a teljes naplosorral.');
 const second=await meta();
 if(!second||second.id!==first.id||second.eTag!==first.eTag||
    second.size!==first.size)
  throw Error('A SharePoint zaronugta ellenorzes kozben megvaltozott.');
 check();
 return Object.freeze({status:'HISTORICAL_FINAL_RECEIPT_VERIFIED',
  boardId,approvedPlanSha256:approvedReceipt.sha256,
  name:filename,path:'Projects/'+boardId+'/Sync-Status/'+filename,
  id:first.id,eTag:first.eTag,sha256:hash,
  finalizedAt:value.finalizedAt,boardFingerprint:value.boardFingerprint,
  ledgerEvidenceSha256:batchReport.evidenceSha256,
  readOnly:true,currentMondayBoardVerified:false});
}
