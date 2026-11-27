import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVE_NAME,BASELINE_NAME,revisionName,newSessionClaim,makeBaseline,
 inspectV0,inspectRevision,makeNextDraft,fingerprint} from './single-draft-session-core.js';
import {createImmutableDraftQueue} from './single-draft-write-queue.js';

const boardId='5107075373';
const base={id:boardId,workspaceId:'7145773',name:'TEST',columns:[],groups:[],
 tasks:[{id:'1',name:'First',updatedAt:'1',note:''},
        {id:'2',name:'Second',updatedAt:'1',note:''}]};
const v0={schemaVersion:1,format:'flow-lps-approved-plan',
 status:'APPROVED',isApprovedPlan:true,mondaySyncAllowed:false,
 syncStatus:'NOT_STARTED',boardId,draftVersion:0,
 sourceFingerprint:fingerprint(base),plan:{base,working:structuredClone(base.tasks)}};
const claim=newSessionClaim({boardId,
 sessionId:'11111111-1111-4111-8111-111111111111',
 approvedV0Sha256:'a'.repeat(64),createdBy:'entra-user',
 createdAt:'2026-11-24T11:00:00.000Z'});
test('manual immutable Approved Plan V0 becomes unchanged V1 baseline',()=>{
 assert.deepEqual(inspectV0(v0,boardId),base);
 const first=makeBaseline({v0,claim});
 assert.equal(first.version,0);
 assert.equal(first.session.revision,0);
 assert.equal(first.source,fingerprint(base));
 assert.deepEqual(first.working,base.tasks);
 assert.equal(revisionName(0),BASELINE_NAME);
 assert.equal(revisionName(1),'draft-v1-r000001.json');
 assert.equal(ACTIVE_NAME,'active-session.json');
 inspectRevision(first,claim,0,null);
});
test('V1.1 preserves all engine changes in one complete atomic snapshot',()=>{
 const previous=makeBaseline({v0,claim}),updated=structuredClone(previous);
 updated.version=1;
 updated.history.push({revision:1,type:'edit',at:'2026-11-24T11:00:01Z'});
 updated.working[0].note='user edit';
 updated.working[1].note='indirect recalculation';
 const result=makeNextDraft({previous,claim,
  previousSha256:'b'.repeat(64),updated});
 assert.equal(result.session.parentSha256,'b'.repeat(64));
 assert.equal(result.version,1);
 assert.equal(result.working[1].note,'indirect recalculation');
 inspectRevision(result,claim,1,'b'.repeat(64));
});
test('changed V0, missing parent or malformed revision cannot proceed',()=>{
 for(const alter of [
  x=>x.plan.working[0].name='unauthorized',
  x=>x.plan.base.tasks.push({...x.plan.base.tasks[0]}),
  x=>x.sourceFingerprint='forged'
 ]){
  const c=structuredClone(v0);alter(c);assert.throws(()=>inspectV0(c,boardId));
 }
 const previous=makeBaseline({v0,claim}),updated=structuredClone(previous);
 updated.version=1;updated.history=[{revision:1,type:'edit'}];
 assert.throws(()=>makeNextDraft({previous,claim,
  previousSha256:'wrong',updated}));
 const bad=structuredClone(updated);bad.base.tasks[0].note='drift';
 assert.throws(()=>makeNextDraft({previous,claim,
  previousSha256:'c'.repeat(64),updated:bad}));
 assert.throws(()=>revisionName(1000000));
});
test('every rapid accepted edit persists, in original revision order',async()=>{
 const receipts=[],deferred=[],statuses=[];
 const queue=createImmutableDraftQueue({persist:async work=>{
  receipts.push(work.updatedDraft.version);
  await new Promise(resolve=>deferred.push(resolve));
  return {status:'SAVED',sessionId:claim.sessionId,
   revision:work.updatedDraft.version,receipt:{
    sha256:work.updatedDraft.version.toString(16).padStart(64,'0'),
    eTag:'etag',verification:'content-sha256-and-etag'}};
 },onState:s=>statuses.push(s)});
 queue.open({sessionId:claim.sessionId,revision:0,sha256:'a'.repeat(64)});
 for(let i=1;i<=3;i++)assert.equal(queue.enqueue({version:i}),true);
 assert.equal(queue.state().pendingCount,3);
 // Drain one promise at a time, no revision is collapsed.
 for(let i=0;i<3;i++){
  for(let j=0;j<20&&deferred.length<=i;j++)await new Promise(r=>setImmediate(r));
  deferred[i]();
  await new Promise(r=>setImmediate(r));
 }
 await queue.idle();
 assert.deepEqual(receipts,[1,2,3]);
 assert.equal(queue.state().verifiedRevision,3);
 assert.equal(queue.state().canApprove,true);
 assert.ok(statuses.length>3);
});
test('uncertain write blocks following drafts and prevents approve/retry',async()=>{
 let count=0;
 const queue=createImmutableDraftQueue({persist:async()=>{
  count++;throw Error('network failed after Graph PUT');}});
 queue.open({sessionId:claim.sessionId,revision:0,sha256:'a'.repeat(64)});
 assert.equal(queue.enqueue({version:1}),true);
 assert.equal(queue.enqueue({version:2}),true);
 await assert.rejects(queue.idle(),/bizonytalan/i);
 assert.equal(count,1);
 assert.equal(queue.state().verifiedRevision,0);
 assert.equal(queue.state().canApprove,false);
 assert.equal(queue.enqueue({version:3}),false);
 assert.throws(()=>queue.open({sessionId:claim.sessionId,revision:0,sha256:'a'.repeat(64)}));
});
