const protocol='flow-lps-draft-handoff-v1';
const nonceRegex=/^[0-9a-f-]{36}$/i;
// Verified receipts are UI feedback only. They do not authorize Monday writes.
export function attachDraftHandoff({win=window,onDraft,onRevision=async()=>{},onAcceptedRevision=()=>{},onFinalizationIntent=async()=>false,onSyncDryRunVerified=()=>{},onPilotAheadRequested=()=>{},onPilotResultRequested=()=>{}}={}){
 if(!win||typeof win.addEventListener!=='function'||typeof onDraft!=='function'||
    typeof onRevision!=='function'||typeof onAcceptedRevision!=='function'||
    typeof onFinalizationIntent!=='function'||typeof onSyncDryRunVerified!=='function'||
    typeof onPilotAheadRequested!=='function'||typeof onPilotResultRequested!=='function')throw Error('Invalid handoff receiver');
 const params=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=params.get('draft-handoff');
 if(!nonce||!nonceRegex.test(nonce)||!win.opener)
  return Object.freeze({active:false,close:()=>{},publishVerifiedReceipt:()=>false});
 let closed=false,accepted=null,busy=false,verifiedVersion=0,finalizationIntentAccepted=false,syncPreviewPending=null,lastPreviewAck=null,checkpointPublished=false,lastCheckpoint=null,pilotPending=null;
 const close=()=>{closed=true;win.removeEventListener('message',handler);};
 const validProof=(proof,boardId)=>proof&&proof.boardId===boardId&&
  Number.isSafeInteger(proof.version)&&proof.version>0&&
  Number.isSafeInteger(proof.bytes)&&proof.bytes>0&&proof.bytes<=5_000_000&&
  typeof proof.sha256==='string'&&/^[0-9a-f]{64}$/.test(proof.sha256);
 const handler=async event=>{
  if(closed||busy||event.source!==win.opener||event.data?.protocol!==protocol||
   event.data?.nonce!==nonce||event.origin==='null'||!/^https:\/\//.test(event.origin))return;
  const kind=event.data?.kind;
  if(kind==='finalization-intent'){
   if(!accepted||verifiedVersion!==accepted.version||finalizationIntentAccepted||
      event.origin!==accepted.sourceOrigin||event.data.boardId!==accepted.boardId)return;
   const intent=event.data?.intent;
   if(intent?.schemaVersion!==1||intent.format!=='flow-lps-draft-finalization-intent'||
      intent.status!=='INTENT_ONLY'||intent.isApprovedPlan!==false||
      intent.mondaySyncAllowed!==false||intent.approvalEligible!==false||
      intent.boardId!==accepted.boardId||intent.version!==accepted.version||
      intent.sha256!==accepted.sha256||intent.bytes!==accepted.bytes||
      typeof intent.editorId!=='string'||!/^\d+$/.test(intent.editorId)||
      typeof intent.confirmedAt!=='string'||!/Z$/.test(intent.confirmedAt)||
      !Number.isFinite(Date.parse(intent.confirmedAt))||
      Math.abs(Date.now()-Date.parse(intent.confirmedAt))>15*60*1000)return;
   busy=true;
   try{
    const allowed=await onFinalizationIntent({boardId:accepted.boardId,intent});
    if(closed||!allowed||verifiedVersion!==accepted.version)return;
    finalizationIntentAccepted=true;
    win.opener?.postMessage({protocol,kind:'finalization-intent-received',nonce,
     boardId:accepted.boardId,version:accepted.version,sha256:accepted.sha256,
     status:'REVIEW_INTENT_ONLY'},accepted.sourceOrigin);
   }catch{
    // A failed browser handoff cannot create any approved plan or write.
   }finally{busy=false;}
   return;
  }
  if(kind==='pilot-write-ahead-request'){
   const entry=event.data?.entry,requestId=event.data?.requestId;
   if(!accepted||event.origin!==accepted.sourceOrigin||!checkpointPublished||
      !lastCheckpoint||pilotPending||verifiedVersion!==accepted.version||
      !finalizationIntentAccepted||event.data.boardId!==accepted.boardId||
      typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId)||
      entry?.schemaVersion!==1||entry.format!=='flow-lps-single-task-write-ahead'||
      entry.status!=='WRITE_AHEAD'||entry.boardId!==accepted.boardId||
      !/^\d+$/.test(entry.taskId||'')||
      entry.approvedSha256!==lastCheckpoint.approved.sha256||
      entry.checkpointSha256!==lastCheckpoint.checkpoint.sha256||
      entry.sourceFingerprint!==lastCheckpoint.checkpoint.checkpoint.mondaySourceFingerprint||
      entry.maximumMondayWrites!==1||entry.actualMondayWrites!==0||
      !Array.isArray(entry.fieldNames)||entry.fieldNames.length<1||
      entry.fieldNames.length>20||
      !lastCheckpoint.approved.approvedPlan.plan?.working?.some(t=>t.id===entry.taskId)||
      typeof entry.checkedAt!=='string'||!/Z$/.test(entry.checkedAt)||
      !Number.isFinite(Date.parse(entry.checkedAt))||
      Math.abs(Date.now()-Date.parse(entry.checkedAt))>5*60*1000)return;
   // One request may be prepared in a session. A crash after the write-ahead
   // file was persisted must never silently create a second attempt.
   pilotPending={requestId,entry,phase:'WAITING_AHEAD',receipt:null};
   try{onPilotAheadRequested(Object.freeze({requestId,entry}));}
   catch{pilotPending.phase='STOPPED';}
   return;
  }
  if(kind==='pilot-result-request'){
   const entry=event.data?.entry,requestId=event.data?.requestId,p=pilotPending;
   if(!p||p.phase!=='AHEAD_CONFIRMED'||!accepted||
      event.origin!==accepted.sourceOrigin||!lastCheckpoint||
      !checkpointPublished||verifiedVersion!==accepted.version||
      event.data.boardId!==accepted.boardId||requestId!==p.requestId||
      entry?.schemaVersion!==1||entry.format!=='flow-lps-single-task-result'||
      !['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN'].includes(entry.status)||
      entry.boardId!==accepted.boardId||entry.taskId!==p.entry.taskId||
      entry.approvedSha256!==p.entry.approvedSha256||
      entry.checkpointSha256!==p.entry.checkpointSha256||
      entry.writeAheadSha256!==p.receipt.sha256||
      entry.mondayWritesAttempted!==1||
      typeof entry.readbackMatches!=='boolean')return;
   p.phase='RESULT_PENDING';
   try{onPilotResultRequested(Object.freeze({requestId,entry,aheadReceipt:p.receipt}));}
   catch{p.phase='STOPPED';}
   return;
  }
  if(kind==='sync-dry-run-verified'){
   const report=event.data?.report,pending=syncPreviewPending;
   if(!pending||!accepted||event.origin!==accepted.sourceOrigin||
      !finalizationIntentAccepted||verifiedVersion!==accepted.version||
      event.data.boardId!==accepted.boardId||
      report?.schemaVersion!==1||report.format!=='flow-lps-sync-preparation-report'||
      report.status!=='BOARD_PRECHECK_ONLY'||report.mondaySyncAllowed!==false||
      report.mondayWritten!==false||report.mutationCount!==0||
      report.boardId!==accepted.boardId||
      report.draftVersion!==accepted.version||
      report.sourceDraftSha256!==accepted.sha256||
      report.approvedPlanSha256!==pending.sha256||
      report.approvedFile!==pending.name||report.approvedETag!==pending.eTag||
      typeof report.sourceFingerprint!=='string'||report.sourceFingerprint.length<10||
      typeof report.editorId!=='string'||!/^\d+$/.test(report.editorId)||
      typeof report.checkedAt!=='string'||!/Z$/.test(report.checkedAt)||
      !Number.isFinite(Date.parse(report.checkedAt))||
      Math.abs(Date.now()-Date.parse(report.checkedAt))>10*60*1000||
      report.checks?.currentMondaySnapshot!=='matched'||
      report.checks?.columnEncoding!=='passed'||
      !Number.isSafeInteger(report.totalTasks)||report.totalTasks<1||
      !Number.isSafeInteger(report.changedTasks)||report.changedTasks<1||
      report.changedTasks>report.totalTasks||
      !Number.isSafeInteger(report.fieldChanges)||report.fieldChanges<report.changedTasks||
      !Array.isArray(report.fieldCounts)||report.fieldCounts.length<1||
      report.fieldCounts.length>40||
      report.fieldCounts.some(f=>!f||typeof f.field!=='string'||
       !/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(f.field)||
       !Number.isSafeInteger(f.tasks)||f.tasks<1||f.tasks>report.totalTasks)||
      report.fieldCounts.reduce((n,f)=>n+f.tasks,0)!==report.fieldChanges)
    return;
   syncPreviewPending=null;lastPreviewAck=pending;checkpointPublished=false;
   try{onSyncDryRunVerified(Object.freeze({
    boardId:accepted.boardId,report,
    approvedName:pending.name,approvedSha256:pending.sha256,
    approvedETag:pending.eTag
   }));}catch{/* No checkpoint is authorized by a display callback failure. */}
   return;
  }
  if(kind!=='draft'&&kind!=='revision')return;
  if(kind==='draft'&&accepted||kind==='revision'&&!accepted)return;
  if(accepted&&event.origin!==accepted.sourceOrigin)return;
  const {content,boardId}=event.data;
  if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>5_000_000||
   !/^\d+$/.test(boardId||'')||accepted&&boardId!==accepted.boardId)return;
  busy=true;
  try{
   const verified=await (kind==='draft'?onDraft:onRevision)({content,boardId,sourceOrigin:event.origin});
   if(!validProof(verified,boardId))throw Error('DRAFT validation failed');
   if(accepted&&verified.version<=accepted.version)throw Error('Older or duplicate DRAFT revision');
   if(closed)return;
   finalizationIntentAccepted=false;syncPreviewPending=null;lastPreviewAck=null;checkpointPublished=false;lastCheckpoint=null;pilotPending=null;
   accepted={boardId,version:verified.version,sha256:verified.sha256,
    bytes:verified.bytes,sourceOrigin:event.origin};
   win.opener?.postMessage({protocol,kind:'received',nonce,version:verified.version,sha256:verified.sha256},event.origin);
   if(kind==='revision')onAcceptedRevision({...verified,content});
  }catch{
   // Invalid data: no ACK, no write authorization.
  }finally{busy=false;}
 };
 win.addEventListener('message',handler);
 win.opener.postMessage({protocol,kind:'ready',nonce},'*');
 function publishVerifiedReceipt(saved){
  if(closed||!accepted||!saved||saved.boardId!==accepted.boardId||
   saved.version!==accepted.version||saved.sha256!==accepted.sha256||
   saved.bytes!==accepted.bytes||saved.verification!=='content-sha256-and-etag'||
   saved.version<=verifiedVersion||typeof saved.name!=='string'||
   !saved.name.startsWith('draft-v'+accepted.version+'-')||
   typeof saved.itemId!=='string'||!saved.itemId||typeof saved.eTag!=='string'||!saved.eTag)
   return false;
  win.opener?.postMessage({protocol,kind:'verified',nonce,receipt:{
   boardId:saved.boardId,version:saved.version,sha256:saved.sha256,
   bytes:saved.bytes,name:saved.name,itemId:saved.itemId,eTag:saved.eTag,
   verification:saved.verification,isApprovedPlan:false,mondaySyncAllowed:false
  }},accepted.sourceOrigin);
  verifiedVersion=saved.version;
  return true;
 }
 function publishApprovedSyncPreview(result){
  const plan=result?.approvedPlan;
  if(syncPreviewPending)return false;
  if(closed||busy||!accepted||verifiedVersion!==accepted.version||
     !finalizationIntentAccepted||
     result?.status!=='APPROVED_PLAN_STORED'||
     result.boardId!==accepted.boardId||result.version!==accepted.version||
     result.sourceDraftSha256!==accepted.sha256||
     result.verification!=='content-sha256-and-etag'||
     result.mondaySyncAllowed!==false||
     !/^[a-f0-9]{64}$/.test(result.sha256||'')||
     typeof result.id!=='string'||!result.id||
     typeof result.eTag!=='string'||!result.eTag||
     !plan||plan.format!=='flow-lps-approved-plan'||plan.status!=='APPROVED'||
     plan.isApprovedPlan!==true||plan.mondaySyncAllowed!==false||
     plan.boardId!==accepted.boardId||plan.draftVersion!==accepted.version||
     plan.sourceDraft?.sha256!==accepted.sha256)return false;
  const name='approved-v'+accepted.version+'-'+accepted.sha256.slice(0,24)+'.json';
  if(result.name!==name||
     result.path!=='Projects/'+accepted.boardId+'/Approved-Plans/'+name)
   return false;
  try{
   const contents=JSON.stringify(plan);
   if(contents.length>5_000_000)return false;
   syncPreviewPending={sha256:result.sha256,name:result.name,eTag:result.eTag};
   win.opener.postMessage({protocol,kind:'approved-sync-dry-run',nonce,
    boardId:accepted.boardId,approvedPlan:plan,receipt:{
     status:result.status,boardId:result.boardId,version:result.version,
     sourceDraftSha256:result.sourceDraftSha256,
     sha256:result.sha256,eTag:result.eTag,id:result.id,
     name:result.name,path:result.path,
     verification:result.verification,mondaySyncAllowed:false
    }},accepted.sourceOrigin);
   return true;
  }catch{syncPreviewPending=null;return false;}
 }
 function publishVerifiedCheckpoint(result,approved){
  const cp=result?.checkpoint,plan=approved?.approvedPlan,ack=lastPreviewAck;
  if(closed||busy||!accepted||!ack||checkpointPublished||
     !finalizationIntentAccepted||verifiedVersion!==accepted.version||
     result?.status!=='CHECKPOINT_PREPARED'||result.boardId!==accepted.boardId||
     result.draftVersion!==accepted.version||result.approvedPlanSha256!==ack.sha256||
     result.verification!=='content-sha256-and-etag'||
     result.mondayWrites!==0||result.mondaySyncAllowed!==false||
     !/^[a-f0-9]{64}$/.test(result.sha256||'')||!result.id||!result.eTag||
     approved?.status!=='APPROVED_PLAN_STORED'||
     approved.boardId!==accepted.boardId||
     approved.version!==accepted.version||approved.sha256!==ack.sha256||
     approved.eTag!==ack.eTag||approved.name!==ack.name||
     plan?.format!=='flow-lps-approved-plan'||plan.status!=='APPROVED'||
     plan.isApprovedPlan!==true||plan.mondaySyncAllowed!==false||
     plan.boardId!==accepted.boardId||plan.draftVersion!==accepted.version||
     cp?.schemaVersion!==1||cp.format!=='flow-lps-sync-checkpoint'||
     cp.status!=='PREPARED_NO_WRITES'||cp.boardId!==accepted.boardId||
     cp.approvedPlan?.sha256!==ack.sha256||
     cp.approvedPlan?.name!==ack.name||cp.approvedPlan?.eTag!==ack.eTag||
     cp.mondaySyncAllowed!==false||cp.mondayWritten!==false||
     cp.writeAuthorization!=='NOT_GRANTED'||cp.progress?.cursor!==0||
     cp.progress?.mondayWrites!==0||cp.progress?.inFlight!==null||
     !Array.isArray(cp.progress?.verifiedTaskIds)||
     cp.progress.verifiedTaskIds.length!==0)return false;
  const cpName='sync-prepared-v'+accepted.version+'-'+ack.sha256.slice(0,24)+'.json';
  if(result.name!==cpName||
     result.path!=='Projects/'+accepted.boardId+'/Sync-Status/'+cpName)
   return false;
  try{
   if(JSON.stringify({plan,cp}).length>5_000_000)return false;
   win.opener.postMessage({protocol,kind:'sync-checkpoint-preview',nonce,
    boardId:accepted.boardId,approvedPlan:plan,
    receipt:{status:approved.status,boardId:approved.boardId,
     version:approved.version,name:approved.name,eTag:approved.eTag,
     sourceDraftSha256:approved.sourceDraftSha256,
     sha256:approved.sha256,verification:approved.verification,
     mondaySyncAllowed:false},
    checkpoint:cp,checkpointReceipt:{
     status:result.status,boardId:result.boardId,
     draftVersion:result.draftVersion,
     approvedPlanSha256:result.approvedPlanSha256,
     name:result.name,path:result.path,id:result.id,eTag:result.eTag,
     sha256:result.sha256,verification:result.verification,
     mondayWrites:0,mondaySyncAllowed:false
    }},accepted.sourceOrigin);
   checkpointPublished=true;lastCheckpoint={checkpoint:result,approved};return true;
  }catch{return false;}
 }
 function publishPilotAhead(receipt,requestId){
  const p=pilotPending;
  if(closed||!accepted||!p||p.phase!=='WAITING_AHEAD'||
     requestId!==p.requestId||!lastCheckpoint||
     receipt?.status!=='WRITE_AHEAD_VERIFIED'||receipt.boardId!==accepted.boardId||
     receipt.taskId!==p.entry.taskId||
     receipt.approvedSha256!==p.entry.approvedSha256||
     receipt.checkpointSha256!==p.entry.checkpointSha256||
     receipt.verification!=='content-sha256-and-etag'||
     receipt.mondayWriteLimit!==1||
     !/^[a-f0-9]{64}$/.test(receipt.sha256||'')||!receipt.id||!receipt.eTag)return false;
  const name='sync-one-'+p.entry.approvedSha256.slice(0,24)+'-ahead.json';
  if(receipt.name!==name||receipt.path!=='Projects/'+accepted.boardId+'/Sync-Status/'+name)return false;
  p.phase='AHEAD_CONFIRMED';p.receipt=receipt;
  try{
   win.opener.postMessage({protocol,kind:'pilot-write-ahead-verified',nonce,
    boardId:accepted.boardId,requestId,receipt},accepted.sourceOrigin);
   return true;
  }catch{p.phase='STOPPED';return false;}
 }
 function publishPilotResult(receipt,requestId){
  const p=pilotPending;
  if(closed||!accepted||!p||p.phase!=='RESULT_PENDING'||
     requestId!==p.requestId||
     !['ITEM_RESULT_VERIFIED','ITEM_UNCERTAIN_RECORDED'].includes(receipt?.status)||
     receipt.boardId!==accepted.boardId||receipt.taskId!==p.entry.taskId||
     receipt.approvedSha256!==p.entry.approvedSha256||
     receipt.checkpointSha256!==p.entry.checkpointSha256||
     receipt.verification!=='content-sha256-and-etag'||receipt.mondayWriteLimit!==1||
     !/^[a-f0-9]{64}$/.test(receipt.sha256||'')||!receipt.id||!receipt.eTag)return false;
  const name='sync-one-'+p.entry.approvedSha256.slice(0,24)+'-result.json';
  if(receipt.name!==name||receipt.path!=='Projects/'+accepted.boardId+'/Sync-Status/'+name)return false;
  p.phase='RESULT_RECORDED';
  try{
   win.opener.postMessage({protocol,kind:'pilot-result-verified',nonce,
    boardId:accepted.boardId,requestId,receipt},accepted.sourceOrigin);
   return true;
  }catch{return false;}
 }
 return Object.freeze({active:true,close,publishVerifiedReceipt,publishApprovedSyncPreview,publishVerifiedCheckpoint,publishPilotAhead,publishPilotResult});
}
