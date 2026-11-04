const protocol='flow-lps-draft-handoff-v1';
const nonceRegex=/^[0-9a-f-]{36}$/i;
// Verified receipts are UI feedback only. They do not authorize Monday writes.
export function attachDraftHandoff({win=window,onDraft,onRevision=async()=>{},onAcceptedRevision=()=>{},onFinalizationIntent=async()=>false,onSyncDryRunVerified=()=>{}}={}){
 if(!win||typeof win.addEventListener!=='function'||typeof onDraft!=='function'||
    typeof onRevision!=='function'||typeof onAcceptedRevision!=='function'||
    typeof onFinalizationIntent!=='function'||typeof onSyncDryRunVerified!=='function')throw Error('Invalid handoff receiver');
 const params=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=params.get('draft-handoff');
 if(!nonce||!nonceRegex.test(nonce)||!win.opener)
  return Object.freeze({active:false,close:()=>{},publishVerifiedReceipt:()=>false});
 let closed=false,accepted=null,busy=false,verifiedVersion=0,finalizationIntentAccepted=false,syncPreviewPending=null;
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
      !Array.isArray(report.fieldCounts)||
      report.fieldCounts.reduce((n,f)=>n+f.tasks,0)!==report.fieldChanges)
    return;
   syncPreviewPending=null;
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
   finalizationIntentAccepted=false;syncPreviewPending=null;
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
 return Object.freeze({active:true,close,publishVerifiedReceipt,publishApprovedSyncPreview});
}
