import test from 'node:test';
import assert from 'node:assert/strict';
import {createV1PilotStore} from '../single-v1-pilot-storage.js';
import {fixture,file,resultFor,at,editorId,createdBy,objectId} from './v1-pilot-fixture.mjs';
import {pilotTarget,pilotSha,pilotFileSha,PILOT_AHEAD,PILOT_RESULT,PILOT_CHECKPOINT} from '../single-v1-pilot-contract.js';
async function setup(){
 const e=await fixture(),stored=new Map([[PILOT_CHECKPOINT,{value:e.checkpoint,...e.checkpointReceipt}]]),calls=[];
 const deps={readApproved:async()=>({approvedPlan:e.approvedPlan,receipt:e.receipt}),
  readSync:async name=>{calls.push('read:'+name);return structuredClone(stored.get(name)||null);},
  createSync:async(name,value)=>{calls.push('write:'+name);assert.equal(stored.has(name),false);
   const proof=await file(value,'Sync-Status',name);stored.set(name,{value:proof.document,...proof.receipt});return proof.receipt;},
  identify:async()=>({id:objectId}),now:()=>new Date(at)};
 const t=await pilotTarget(e,editorId);
 const args={createdBy,userConfirmed:true,editorId,taskId:t.taskId,
  expectedApprovedSha256:t.approvedSha256,expectedCheckpointSha256:t.checkpointSha256,
  expectedSessionId:t.sessionId,expectedRevision:t.revision,
  requestId:'44444444-4444-4444-8444-444444444444',mutationValuesSha256:'d'.repeat(64),
  boardVerifiedAt:at,boardFingerprintSha256:await pilotSha(t.sourceFingerprint)};
 return {e,stored,calls,deps,args,store:createV1PilotStore(deps)};
}
test('V1 pilot inspection reads existing checkpoint and never creates or overwrites it',async()=>{
 const x=await setup(),before=structuredClone(x.stored.get(PILOT_CHECKPOINT));
 const p=await x.store.inspect({createdBy,editorId});assert.equal(p.status,'READY_FOR_PILOT');
 assert.equal(p.taskId,'101');assert.ok(x.calls.includes('read:'+PILOT_AHEAD));
 assert.ok(x.calls.includes('read:'+PILOT_RESULT));assert.ok(!x.calls.some(x=>x.startsWith('write:')));
 assert.deepEqual(x.stored.get(PILOT_CHECKPOINT),before);
});
test('V1 pilot full immutable ahead/result roundtrip and read-only reopen',async()=>{
 const x=await setup(),ahead=await x.store.writeAhead(x.args);
 assert.equal(ahead.document.status,'WRITE_AHEAD');
 const evidence={...x.e,ahead},result=await resultFor(evidence);
 const stored=await x.store.saveResult({createdBy,result:result.document});
 assert.equal(stored.receipt.name,PILOT_RESULT);
 const reopened=await createV1PilotStore(x.deps).inspect({createdBy,editorId});
 assert.equal(reopened.status,'PILOT_RECORDED');
 await assert.rejects(x.store.writeAhead(x.args));
 await assert.rejects(createV1PilotStore(x.deps).writeAhead(x.args),/naplo/);
 assert.deepEqual(x.calls.filter(x=>x.startsWith('write:')),['write:'+PILOT_AHEAD,'write:'+PILOT_RESULT]);
});
test('V1 pilot uncertain create is never retried, even when the file exists',async()=>{
 const x=await setup(),original=x.deps.createSync;
 x.deps.createSync=async(...a)=>{await original(...a);throw Error('lost upload response');};
 const s=createV1PilotStore(x.deps);
 await assert.rejects(s.writeAhead(x.args),/lost/);
 await assert.rejects(s.writeAhead(x.args),/ujraprobalas/);
 assert.equal((await s.inspect({createdBy,editorId})).status,'WRITE_AHEAD_ONLY');
 await assert.rejects(createV1PilotStore(x.deps).writeAhead(x.args),/naplo/);
 assert.equal(x.calls.filter(x=>x.startsWith('write:')).length,1);
});
test('V1 pilot HTTP 403/500 is not interpreted as missing journal',async()=>{
 for(const status of [403,500]){
  const x=await setup();x.deps.readSync=async name=>{if(name===PILOT_AHEAD)throw Error('HTTP '+status);return x.stored.get(name);};
  const s=createV1PilotStore(x.deps);await assert.rejects(s.inspect({createdBy,editorId}),new RegExp(String(status)));
  await assert.rejects(s.writeAhead(x.args));assert.ok(!x.calls.some(x=>x.startsWith('write:')));
 }
});
test('V1 pilot refuses wrong identity, stale board evidence, wrong target, missing confirmation',async()=>{
 for(const kind of ['identity','stale','target','confirmation','boardsha']){
  const x=await setup();if(kind==='identity')x.deps.identify=async()=>({id:'different'});
  if(kind==='stale')x.args.boardVerifiedAt='2020-01-01T00:00:00Z';
  if(kind==='target')x.args.taskId='102';
  if(kind==='confirmation')x.args.userConfirmed=false;
  if(kind==='boardsha')x.args.boardFingerprintSha256='f'.repeat(64);
  await assert.rejects(createV1PilotStore(x.deps).writeAhead(x.args));
  assert.ok(!x.calls.some(x=>x.startsWith('write:')),kind);
 }
});
test('V1 pilot refuses fabricated successful readback before result persistence',async()=>{
 const x=await setup(),ahead=await x.store.writeAhead(x.args);
 const result=await resultFor({...x.e,ahead},{fullBoardReadbackMatches:false});
 await assert.rejects(x.store.saveResult({createdBy,result:result.document}),/sikeres/);
 assert.equal(x.stored.has(PILOT_RESULT),false);
});
test('V1 pilot persists abort/uncertain result without granting resume permission',async()=>{
 const x=await setup(),ahead=await x.store.writeAhead(x.args);
 const result=await resultFor({...x.e,ahead},{status:'ABORTED_NO_WRITE',mutationAttempts:0,
  replyConfirmed:false,itemReadbackMatches:false,fullBoardReadbackMatches:false,error:'BOARD_DRIFT'});
 await x.store.saveResult({createdBy,result:result.document});
 assert.equal((await x.store.inspect({createdBy,editorId})).status,'MANUAL_RECONCILIATION_REQUIRED');
});
