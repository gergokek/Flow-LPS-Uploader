// Read-only, fail-closed reconciliation of immutable SharePoint sync journals.
// Never infer that a Monday mutation did NOT occur merely because a result
// journal is missing. No Microsoft Graph write method appears in this module.
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const safeDownload=value=>{
 let u;try{u=new URL(value);}catch{throw Error('Graph letoltesi URL hianyzik.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
   !['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
     '.1drv.com','.blob.core.windows.net'].some(host=>u.hostname.toLowerCase().endsWith(host)))
  throw Error('Nem ellenorzott SharePoint letoltesi URL.');
 return u.href;
};
const digest=async data=>Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');

export async function inspectSingleTaskRecovery({
 boardId,driveId,approvedReceipt,checkpointReceipt,
 getAccessToken,fetcher=fetch,assertCurrent=()=>true,
 checkedAt=()=>new Date()
}={}){
 if(boardId!=='5107075373'||!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
    typeof getAccessToken!=='function'||typeof fetcher!=='function'||
    typeof assertCurrent!=='function'||typeof checkedAt!=='function'||
    approvedReceipt?.status!=='APPROVED_PLAN_STORED'||
    approvedReceipt.boardId!==boardId||!hex(approvedReceipt.sha256)||
    checkpointReceipt?.status!=='CHECKPOINT_PREPARED'||
    checkpointReceipt.boardId!==boardId||
    checkpointReceipt.approvedPlanSha256!==approvedReceipt.sha256||
    !hex(checkpointReceipt.sha256)||!checkpointReceipt.id||
    !checkpointReceipt.eTag||
    checkpointReceipt.verification!=='content-sha256-and-etag')
  throw Error('Egyfeladatos TEST recovery: hianyzo vagy eltero jovahagyott alap.');
 const head=approvedReceipt.sha256.slice(0,24),
  checkpointName='sync-prepared-v'+approvedReceipt.version+'-'+head+'.json',
  folder='Projects/'+boardId+'/Sync-Status/';
 if(checkpointReceipt.name!==checkpointName||
    checkpointReceipt.path!==folder+checkpointName||
    checkpointReceipt.draftVersion!==approvedReceipt.version||
    checkpointReceipt.mondayWrites!==0||
    checkpointReceipt.mondaySyncAllowed!==false)
  throw Error('A kiindulo checkpoint nem hitelesitett, vagy irast jelez.');
 const guard=()=>{if(assertCurrent()!==true)
  throw Error('A Microsoft- vagy SharePoint-munkamenet megvaltozott.');};
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const auth=async()=>{guard();const t=await getAccessToken();if(!t)throw Error('Graph token hianyzik.');return t;};
 const graph=async(url)=>fetcher(url,{method:'GET',cache:'no-store',redirect:'error',
  headers:{Authorization:'Bearer '+await auth(),Accept:'application/json'}});
 const target=name=>root+'/root:/'+['Projects',boardId,'Sync-Status',name]
  .map(encodeURIComponent).join('/')+'?$select=id,name,size,file,parentReference,eTag';
 async function readFile(name,{required=false,expected=null}={}){
  guard();
  const metadata=async()=>{
   const response=await graph(target(name));
   if(response.status===404){if(required)throw Error('Kotelezo SharePoint fajl hianyzik: '+name);return null;}
   if(!response.ok)throw Error('SharePoint metadata '+name+': HTTP '+response.status);
   const item=await response.json();
   if(item?.name!==name||!item.id||!item.eTag||!item.file||
      item.parentReference?.driveId!==driveId||
      !Number.isSafeInteger(item.size)||item.size<1||item.size>5_000_000)
    throw Error('Eltero SharePoint naplo metadata: '+name);
   if(expected&&(item.id!==expected.id||item.eTag!==expected.eTag))
    throw Error('SharePoint naplo eTag vagy item ID elter: '+name);
   return item;
  };
  const first=await metadata();if(!first)return null;
  const infoResponse=await graph(root+'/items/'+encodeURIComponent(first.id));
  if(!infoResponse.ok)throw Error('SharePoint download metadata HTTP '+infoResponse.status);
  const info=await infoResponse.json();
  if(info?.id!==first.id||info.name!==name||info.eTag!==first.eTag||
     info.size!==first.size||!info.file||info.parentReference?.driveId!==driveId)
   throw Error('SharePoint letoltesi metadata utkozik: '+name);
  const response=await fetcher(safeDownload(info['@microsoft.graph.downloadUrl']),{
   method:'GET',cache:'no-store',mode:'cors',redirect:'follow',
   credentials:'omit',referrerPolicy:'no-referrer'
  });
  if(!response.ok)throw Error('SharePoint fajl tartalom HTTP '+response.status);
  const data=await response.arrayBuffer();guard();
  if(data.byteLength!==first.size)throw Error('SharePoint fajl hossza elter: '+name);
  const sha256=await digest(data);
  if(expected&&sha256!==expected.sha256)throw Error('SharePoint SHA-256 elter: '+name);
  const second=await metadata();
  if(!second||second.id!==first.id||second.size!==first.size||
     second.eTag!==first.eTag)throw Error('SharePoint fajl megvaltozott: '+name);
  let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
  catch{throw Error('Nem olvashato SharePoint naplo JSON: '+name);}
  return Object.freeze({name,id:first.id,eTag:first.eTag,sha256,value});
 }
 const cp=await readFile(checkpointName,{required:true,expected:checkpointReceipt});
 if(cp.value?.schemaVersion!==1||cp.value.format!=='flow-lps-sync-checkpoint'||
    cp.value.status!=='PREPARED_NO_WRITES'||cp.value.boardId!==boardId||
    cp.value.approvedPlan?.sha256!==approvedReceipt.sha256||
    cp.value.mondayWritten!==false||cp.value.mondaySyncAllowed!==false||
    cp.value.writeAuthorization!=='NOT_GRANTED'||
    cp.value.progress?.cursor!==0||cp.value.progress?.mondayWrites!==0||
    cp.value.progress?.inFlight!==null||
    !Array.isArray(cp.value.progress?.verifiedTaskIds)||
    cp.value.progress.verifiedTaskIds.length!==0||
    typeof cp.value.mondaySourceFingerprint!=='string'||
    !/^[0-9a-f-]{36}$/i.test(cp.value.preparedByEntraObjectId||''))
  throw Error('A SharePoint kiindulo checkpoint tartalma elter.');
 const who=await graph('https://graph.microsoft.com/v1.0/me?$select=id');
 if(!who.ok)throw Error('Microsoft Entra azonossag nem ellenorizheto.');
 const me=await who.json();
 if(String(me?.id||'').toLowerCase()!==cp.value.preparedByEntraObjectId.toLowerCase())
  throw Error('Masik Microsoft-felhasznalo jelentkezett be a checkpoint keszitojehez kepest.');
 const aheadName='sync-one-'+head+'-ahead.json',
  resultName='sync-one-'+head+'-result.json';
 const ahead=await readFile(aheadName);
 const result=await readFile(resultName);
 if(!ahead&&result)throw Error('Az eredmenynaplohoz nem letezik iras elotti naplo.');
 if(ahead){
  const a=ahead.value;
  if(a?.schemaVersion!==1||a.format!=='flow-lps-single-task-write-ahead'||
     a.status!=='WRITE_AHEAD'||a.boardId!==boardId||
     !/^\d+$/.test(a.taskId||'')||
     a.approvedSha256!==approvedReceipt.sha256||
     a.checkpointSha256!==checkpointReceipt.sha256||
     a.sourceFingerprint!==cp.value.mondaySourceFingerprint||
     !Array.isArray(a.fieldNames)||!a.fieldNames.length||
     a.maximumMondayWrites!==1||a.actualMondayWrites!==0)
   throw Error('A SharePoint WRITE_AHEAD naplo nem hiteles.');
 }
 if(result){
  const r=result.value,a=ahead.value;
  if(r?.schemaVersion!==1||r.format!=='flow-lps-single-task-result'||
     !['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN'].includes(r.status)||
     r.boardId!==boardId||r.taskId!==a.taskId||
     r.approvedSha256!==approvedReceipt.sha256||
     r.checkpointSha256!==checkpointReceipt.sha256||
     r.writeAheadSha256!==ahead.sha256||r.mondayWritesAttempted!==1||
     typeof r.readbackMatches!=='boolean'||
     (r.status==='ITEM_READBACK_VERIFIED'&&
      (r.readbackMatches!==true||r.error!==null)))
   throw Error('Az utolagos SharePoint naplo hianyos vagy eltero.');
 }
 guard();
 const status=!ahead?'NO_JOURNAL':
  !result?'WRITE_AHEAD_ONLY':
  result.value.status==='ITEM_READBACK_VERIFIED'?'RESULT_VERIFIED':'RESULT_UNCERTAIN';
 return Object.freeze({
  schemaVersion:1,format:'flow-lps-single-task-recovery',status,
  boardId,approvedPlanSha256:approvedReceipt.sha256,
  checkpointSha256:checkpointReceipt.sha256,
  sourceFingerprint:cp.value.mondaySourceFingerprint,
  claimedMondayEditorId:cp.value.mondayPreflight?.editorIdClaim,
  inspectedAt:checkedAt().toISOString(),
  ahead:ahead?Object.freeze({name:ahead.name,id:ahead.id,eTag:ahead.eTag,
   sha256:ahead.sha256,taskId:ahead.value.taskId,fieldNames:ahead.value.fieldNames}):null,
  result:result?Object.freeze({name:result.name,id:result.id,eTag:result.eTag,
   sha256:result.sha256,taskId:result.value.taskId,
   status:result.value.status,readbackMatches:result.value.readbackMatches}):null,
  mondayWritesPerformedByThisInspection:0,
  automaticallyResume:false,
  action:status==='NO_JOURNAL'?'CHECK_LIVE_BOARD_BEFORE_ANY_START':
   status==='RESULT_VERIFIED'?'CHECK_LIVE_BOARD_BEFORE_PLANNING':
    'MANUAL_RECONCILIATION_REQUIRED'
 });
}
