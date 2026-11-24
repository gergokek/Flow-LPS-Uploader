// Deterministic, read-only reconciliation of ALL immutable TEST batch files.
// Every "verified" item must have a matched write-ahead AND result journal.
// This module creates no Monday or SharePoint write authorization.
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const writable=new Set(['anchor','forecast','actual','duration','ffLag','startPre',
 'finishPre','note','readiness','critical','week','endWeek','status','obstacles','ledger']);
const stable=x=>JSON.stringify(sortValue(x));
function sortValue(x){
 if(Array.isArray(x))return x.map(sortValue);
 if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort()
  .map(k=>[k,sortValue(x[k])]));
 return x??null;
}
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>{
 if(!a||!b)return false;
 const {updatedAt:_unused1,...left}=a,{updatedAt:_unused2,...right}=b;
 return stable(left)===stable(right);
};
const part=(sha256,step,kind)=>'sync-batch-'+sha256.slice(0,24)+
 '-step-'+String(step).padStart(4,'0')+'-'+kind+'.json';

export async function reconcileVerifiedBatchLedger({
 boardId,approvedPlan,approvedReceipt,checkpointReceipt,pilotReport,
 journalFiles=[],maxPerBatch=10,inspectedAt=new Date()
}={}){
 if(boardId!=='5107075373'||maxPerBatch!==10||
    approvedPlan?.schemaVersion!==1||
    approvedPlan.format!=='flow-lps-approved-plan'||
    approvedPlan.status!=='APPROVED'||approvedPlan.isApprovedPlan!==true||
    approvedPlan.mondaySyncAllowed!==false||
    approvedPlan.boardId!==boardId||
    approvedReceipt?.status!=='APPROVED_PLAN_STORED'||
    approvedReceipt.boardId!==boardId||!hex(approvedReceipt.sha256)||
    checkpointReceipt?.status!=='CHECKPOINT_PREPARED'||
    checkpointReceipt.boardId!==boardId||!hex(checkpointReceipt.sha256)||
    checkpointReceipt.approvedPlanSha256!==approvedReceipt.sha256||
    pilotReport?.status!=='RESULT_VERIFIED'||
    pilotReport.boardId!==boardId||
    pilotReport.approvedPlanSha256!==approvedReceipt.sha256||
    pilotReport.checkpointSha256!==checkpointReceipt.sha256||
    pilotReport.result?.status!=='ITEM_READBACK_VERIFIED'||
    pilotReport.result.readbackMatches!==true||
    !/^\d+$/.test(pilotReport.result.taskId||'')||
    !Array.isArray(approvedPlan.plan?.base?.tasks)||
    !Array.isArray(approvedPlan.plan?.working)||
    !Array.isArray(journalFiles)||
    !Number.isFinite(inspectedAt?.getTime?.()))
  throw Error('Hianyzo vagy nem hitelesitett TEST batch recovery alap.');
 const before=approvedPlan.plan.base.tasks,after=approvedPlan.plan.working;
 const baseIds=new Set(before.map(t=>t.id));
 const desired=new Map(after.map(t=>[t.id,t]));
 if(!before.length||before.length!==after.length||baseIds.size!==before.length||
    desired.size!==before.length||[...desired.keys()].some(id=>!baseIds.has(id)))
  throw Error('Az Approved Plan teljes feladatlistaja elter.');
 const prior=new Map(before.map(t=>[t.id,t]));
 const changes=[];
 // Monday's domainDiff iterates Approved Plan working order.
 for(const next of after){
  const item=prior.get(next.id),fields=[];
  for(const key of new Set([...Object.keys(item),...Object.keys(next)])){
   if(key==='updatedAt'||same({value:item[key]},{value:next[key]}))continue;
   if(!writable.has(key))throw Error('Az Approved Plan nem szerkesztheto mezot is modosit: '+item.id);
   fields.push(key);
  }
  if(fields.length)changes.push({id:item.id,fields:fields.sort()});
 }
 if(changes.length===0)throw Error('Nincs szinkronizalando valtozas az Approved Planben.');
 const pilotId=pilotReport.result.taskId;
 if(!changes.some(t=>t.id===pilotId))throw Error('A pilot nem szerepel a modositott feladatok kozott.');
 const pending=changes.filter(t=>t.id!==pilotId);
 const matching=new Map(),prefix='sync-batch-'+approvedReceipt.sha256.slice(0,24)+'-';
 const regex=new RegExp('^'+prefix+'step-(\\d{4})-(ahead|result)\\.json$');
 for(const f of journalFiles){
  if(!f||typeof f.name!=='string'||!f.name.startsWith(prefix))
   throw Error('Idegen vagy hianyos batch-naplo.');
  const match=f.name.match(regex);
  if(!match||matching.has(f.name)||!hex(f.sha256)||!f.id||!f.eTag||
     !f.value||typeof f.value!=='object')
   throw Error('Hibas, ismetelt vagy osszekevert batch-naplo.');
  const step=Number(match[1]);
  if(step<1||step>pending.length||step>9999)
   throw Error('A batch-naplo sorszama tulnyulik az Approved Planen.');
  matching.set(f.name,f);
 }
 let verified=0,stoppedAt=null,stopReason=null;
 const records=[];
 for(let step=1;step<=pending.length;step++){
  const original=pending[step-1],expectedBatch=Math.ceil(step/maxPerBatch);
  const a=matching.get(part(approvedReceipt.sha256,step,'ahead'));
  const r=matching.get(part(approvedReceipt.sha256,step,'result'));
  if(!a&&!r){break;}
  if(!a&&r){stoppedAt=step;stopReason='ORPHAN_RESULT';break;}
  const value=a.value;
  if(value.schemaVersion!==1||value.format!=='flow-lps-batch-task-ahead'||
     value.status!=='BATCH_WRITE_AHEAD'||value.boardId!==boardId||
     value.taskId!==original.id||value.step!==step||
     value.batchNumber!==expectedBatch||
     value.approvedSha256!==approvedReceipt.sha256||
     value.checkpointSha256!==checkpointReceipt.sha256||
     value.sourceFingerprint!==approvedPlan.sourceFingerprint||
     value.maximumMondayWrites!==1||value.actualMondayWrites!==0||
     stable(value.fieldNames)!==stable(original.fields))
   {stoppedAt=step;stopReason='AHEAD_MISMATCH';break;}
  const pair={step,taskId:original.id,batchNumber:expectedBatch,
   ahead:{name:a.name,id:a.id,eTag:a.eTag,sha256:a.sha256},
   result:null};
  if(!r){records.push(pair);stoppedAt=step;stopReason='MISSING_RESULT';break;}
  const rv=r.value;
  if(rv.schemaVersion!==1||rv.format!=='flow-lps-batch-task-result'||
     rv.boardId!==boardId||rv.taskId!==original.id||
     rv.step!==step||rv.batchNumber!==expectedBatch||
     rv.approvedSha256!==approvedReceipt.sha256||
     rv.checkpointSha256!==checkpointReceipt.sha256||
     rv.writeAheadSha256!==a.sha256||rv.mondayWritesAttempted!==1||
     !['BATCH_ITEM_READBACK_VERIFIED','BATCH_ITEM_UNCERTAIN'].includes(rv.status))
   {records.push(pair);stoppedAt=step;stopReason='RESULT_MISMATCH';break;}
  pair.result={name:r.name,id:r.id,eTag:r.eTag,sha256:r.sha256,
   status:rv.status,readbackMatches:rv.readbackMatches};
  records.push(pair);
  if(rv.status!=='BATCH_ITEM_READBACK_VERIFIED'||
     rv.readbackMatches!==true||rv.error!==null)
   {stoppedAt=step;stopReason='UNCERTAIN_RESULT';break;}
  verified++;
 }
 // Any out-of-order or unexpected artifact blocks the entire batch chain,
 // even when the preceding results look valid.
 const included=new Set(records.flatMap(r=>[r.ahead?.name,r.result?.name].filter(Boolean)));
 if([...matching.keys()].some(name=>!included.has(name))){
  if(!stopReason)stopReason='NON_CONTIGUOUS_JOURNAL';
  stoppedAt??=verified+1;
 }
 if(!stopReason&&verified>0&&verified<pending.length&&verified%maxPerBatch!==0){
  stopReason='PARTIAL_BATCH_WITHOUT_NEXT_STEP';
  stoppedAt=verified+1;
 }
 const complete=verified===pending.length&&!stopReason;
 const nextBatch=verified===0?1:Math.floor(verified/maxPerBatch)+1;
 const nextStep=verified+1;
 const eligible=!stopReason&&!complete;
 const status=stopReason?'MANUAL_RECONCILIATION_REQUIRED':
  complete?'ALL_VERIFIED':
  verified===0?'FIRST_BATCH_READY':'NEXT_BATCH_READY';
 const remainder=eligible?pending.slice(verified,verified+maxPerBatch):[];
 const evidenceSha256=await sha(stable({
  boardId,approvedSha256:approvedReceipt.sha256,
  checkpointSha256:checkpointReceipt.sha256,
  pilotSha256:pilotReport.result.sha256,
  records:records.map(x=>({step:x.step,taskId:x.taskId,
   ahead:x.ahead?.sha256,result:x.result?.sha256}))
 }));
 return Object.freeze({
  schemaVersion:1,format:'flow-lps-batch-ledger-recovery',
  status,boardId,approvedPlanSha256:approvedReceipt.sha256,
  checkpointSha256:checkpointReceipt.sha256,
  sourceFingerprint:approvedPlan.sourceFingerprint,
  verifiedPilotTaskId:pilotId,verifiedBatchCount:verified,
  verifiedBatchTaskIds:pending.slice(0,verified).map(t=>t.id),
  totalPendingBatchTasks:pending.length,
  nextBatchNumber:eligible?nextBatch:null,
  nextStep:eligible?nextStep:null,
  nextTaskIds:remainder.map(t=>t.id),
  remainingTaskCount:pending.length-verified,
  stopReason,stoppedAt,canPrepareNextBatch:eligible,
  evidenceSha256,inspectedAt:inspectedAt.toISOString(),
  inspectedWithWrites:0,automaticallyResume:false,
  records
 });
}
