import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileVerifiedBatchLedger} from '../sync-batch-ledger.js';
const boardId='5107075373',approvedSha='a'.repeat(64),
 cpSha='b'.repeat(64),pilotSha='c'.repeat(64);
const sha=step=>step.toString(16).padStart(64,'0');
const journalName=(step,kind)=>'sync-batch-'+approvedSha.slice(0,24)+
 '-step-'+String(step).padStart(4,'0')+'-'+kind+'.json';
function setup(total=24){
 const base=Array.from({length:total+1},(_,i)=>({
  id:String(i+101),name:'Task '+i,note:'old'
 }));
 const working=base.map(t=>({...t,note:'new'}));
 const approvedPlan={schemaVersion:1,format:'flow-lps-approved-plan',
  status:'APPROVED',isApprovedPlan:true,mondaySyncAllowed:false,
  boardId,sourceFingerprint:'checked-source',plan:{base:{tasks:base},working}};
 const approvedReceipt={status:'APPROVED_PLAN_STORED',boardId,sha256:approvedSha};
 const checkpointReceipt={status:'CHECKPOINT_PREPARED',boardId,
  sha256:cpSha,approvedPlanSha256:approvedSha};
 const pilotReport={status:'RESULT_VERIFIED',boardId,
  approvedPlanSha256:approvedSha,checkpointSha256:cpSha,
  result:{status:'ITEM_READBACK_VERIFIED',readbackMatches:true,taskId:'101',
   sha256:pilotSha}};
 const args={boardId,approvedPlan,approvedReceipt,checkpointReceipt,pilotReport};
 return {args,base,working};
}
function pair(step,{uncertain=false,taskId=String(step+101)}={}){
 const aheadSha=sha(step*2),resultSha=sha(step*2+1);
 const ahead={schemaVersion:1,format:'flow-lps-batch-task-ahead',
  status:'BATCH_WRITE_AHEAD',boardId,taskId,step,
  batchNumber:Math.ceil(step/10),approvedSha256:approvedSha,
  checkpointSha256:cpSha,sourceFingerprint:'checked-source',
  fieldNames:['note'],checkedAt:'2026-11-24T10:00:00Z',
  maximumMondayWrites:1,actualMondayWrites:0};
 const result={schemaVersion:1,format:'flow-lps-batch-task-result',
  status:uncertain?'BATCH_ITEM_UNCERTAIN':'BATCH_ITEM_READBACK_VERIFIED',
  boardId,taskId,step,batchNumber:Math.ceil(step/10),
  approvedSha256:approvedSha,checkpointSha256:cpSha,
  writeAheadSha256:aheadSha,mondayWritesAttempted:1,
  readbackMatches:!uncertain,error:uncertain?'transport failed':null};
 const wrap=(kind,value,hash)=>({name:journalName(step,kind),
  id:'id-'+step+'-'+kind,eTag:'etag-'+step+'-'+kind,sha256:hash,value});
 return [wrap('ahead',ahead,aheadSha),wrap('result',result,resultSha)];
}
const run=(args,journalFiles)=>reconcileVerifiedBatchLedger({...args,journalFiles});
test('empty ledger: first batch ready, nothing authorized automatically',async()=>{
 const x=await run(setup().args,[]);
 assert.equal(x.status,'FIRST_BATCH_READY');
 assert.equal(x.verifiedBatchCount,0);
 assert.equal(x.nextBatchNumber,1);
 assert.equal(x.nextStep,1);
 assert.equal(x.nextTaskIds.length,10);
 assert.deepEqual(x.nextTaskIds.slice(0,2),['102','103']);
 assert.equal(x.automaticallyResume,false);
 assert.equal(x.inspectedWithWrites,0);
});
test('10 verified steps make batch 2 eligible with absolute steps 11–20',async()=>{
 const files=Array.from({length:10},(_,i)=>pair(i+1)).flat();
 const x=await run(setup().args,files);
 assert.equal(x.status,'NEXT_BATCH_READY');
 assert.equal(x.verifiedBatchCount,10);
 assert.equal(x.nextBatchNumber,2);
 assert.equal(x.nextStep,11);
 assert.deepEqual(x.nextTaskIds,['112','113','114','115','116','117',
  '118','119','120','121']);
 assert.equal(x.records.length,10);
 assert.equal(x.remainingTaskCount,14);
 assert.match(x.evidenceSha256,/^[a-f0-9]{64}$/);
});
test('20 verified steps make batch 3 eligible',async()=>{
 const files=Array.from({length:20},(_,i)=>pair(i+1)).flat();
 const x=await run(setup().args,files);
 assert.equal(x.nextBatchNumber,3);
 assert.equal(x.nextStep,21);
 assert.deepEqual(x.nextTaskIds,['122','123','124','125']);
});
test('last short batch completes the entire immutable journal chain',async()=>{
 const files=Array.from({length:24},(_,i)=>pair(i+1)).flat();
 const x=await run(setup().args,files);
 assert.equal(x.status,'ALL_VERIFIED');
 assert.equal(x.canPrepareNextBatch,false);
 assert.equal(x.nextBatchNumber,null);
 assert.equal(x.verifiedBatchCount,24);
});
test('no result after write-ahead is ambiguous and blocks further batches',async()=>{
 const files=Array.from({length:10},(_,i)=>pair(i+1)).flat();
 files.push(pair(11)[0]);
 const x=await run(setup().args,files);
 assert.equal(x.status,'MANUAL_RECONCILIATION_REQUIRED');
 assert.equal(x.verifiedBatchCount,10);
 assert.equal(x.stoppedAt,11);
 assert.equal(x.stopReason,'MISSING_RESULT');
 assert.equal(x.canPrepareNextBatch,false);
});
test('partial batch, even with verified items, never allows another batch',async()=>{
 const files=Array.from({length:4},(_,i)=>pair(i+1)).flat();
 const x=await run(setup().args,files);
 assert.equal(x.status,'MANUAL_RECONCILIATION_REQUIRED');
 assert.equal(x.stopReason,'PARTIAL_BATCH_WITHOUT_NEXT_STEP');
 assert.equal(x.verifiedBatchCount,4);
});
test('uncertain write, conflicting result hash and missing first step block',async()=>{
 for(const files of [
  [...pair(1,{uncertain:true})],
  (()=>{const p=pair(1);p[1].value.writeAheadSha256='f'.repeat(64);return p;})(),
  pair(2),[pair(1)[1]],[...pair(1),...pair(3)]
 ]){
  const x=await run(setup().args,files);
  assert.equal(x.status,'MANUAL_RECONCILIATION_REQUIRED');
  assert.equal(x.canPrepareNextBatch,false);
 }
});
test('forged task IDs, reversed order and duplicate journal proof block',async()=>{
 for(const files of [
  pair(1,{taskId:'999'}),
  [pair(1)[0],pair(1)[0]],
  (()=>{const p=pair(1);p[0].value.fieldNames=['forecast'];return p;})()
 ]){
  let x;
  try{x=await run(setup().args,files);}catch{continue;}
  assert.equal(x.status,'MANUAL_RECONCILIATION_REQUIRED');
 }
});
test('non-writable Approved Plan changes block ledger reconciliation',async()=>{
 const f=setup();
 f.args.approvedPlan.plan.working[4].name='tampered name';
 await assert.rejects(()=>run(f.args,[]),/nem szerkesztheto/);
});
