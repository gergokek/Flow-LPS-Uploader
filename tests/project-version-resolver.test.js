import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlanningState} from '../project-version-resolver.js';
const boardId='5107075373',H=n=>String(n).repeat(64);
const approvedV0={verified:true,sha256:H('a')};
const complete=(v,overrides={})=>({
 planVersion:v,status:'SYNC_COMPLETED',verified:true,
 sessionId:'11111111-1111-4111-8111-'+String(v).padStart(12,'0'),
 sourceVersion:v-1,
 ...(v===1?{sourceApprovedV0Sha256:approvedV0.sha256}:
  {sourceCompletionSha256:H(String(v-1))}),
 completionSha256:H(String(v)),fullBoardReadbackVerified:true,
 remainingTaskCount:0,...overrides
});
const active=(v,override={})=>complete(v,{
 status:'ACTIVE',revision:4,latestDraftSha256:H('f'),
 completionSha256:undefined,fullBoardReadbackVerified:undefined,
 remainingTaskCount:undefined,...override});
const req=(versions,other={})=>resolvePlanningState({
 boardId,approvedV0,versions,catalogComplete:true,boardVerified:true,...other});
test('new project starts V1, never assumes V3',()=>{
 const x=req([]);assert.equal(x.action,'START_NEXT');assert.equal(x.planVersion,1);
});
test('a fully completed V1 -> V2, V2 -> V3, V3 -> V4 and V4 -> V5 are all dynamic',()=>{
 for(const n of [1,2,3,4]){
  const v=Array.from({length:n},(_,i)=>complete(i+1));
  const x=req(v);assert.equal(x.action,'START_NEXT');assert.equal(x.nextVersion,n+1);
  assert.equal(x.status,'READY_TO_START');
 }
});
test('active V1, V2 or V3 always resumes the same revision and never opens a successor',()=>{
 for(const n of [1,2,3]){
  const versions=Array.from({length:n-1},(_,i)=>complete(i+1));
  versions.push(active(n));
  const x=req(versions);assert.equal(x.action,'RESUME_DRAFT');assert.equal(x.planVersion,n);
  assert.equal(x.revision,4);assert.equal(x.nextVersion,null);
 }
});
test('partial session, approval, write, uncertainty gate and incomplete catalog',()=>{
 for(const [status,action] of [['START_INCOMPLETE','RECOVER_SAME_SESSION'],
   ['APPROVAL_FROZEN','CONTINUE_FINALIZATION'],
   ['APPROVED_PENDING_SYNC','CONTINUE_FINALIZATION'],
   ['SYNC_IN_PROGRESS','CONTINUE_FINALIZATION'],
   ['SYNC_UNCERTAIN','MANUAL_REVIEW'],['UNKNOWN','MANUAL_REVIEW']]){
  const x=req([complete(1),active(2,{status})]);
  assert.equal(x.action,action);assert.notEqual(x.action,'START_NEXT');
 }
 assert.equal(req([complete(1)],{catalogComplete:false}).action,'MANUAL_REVIEW');
 assert.equal(req([complete(1)],{boardVerified:false}).action,'MANUAL_REVIEW');
});
test('gaps, duplicates, forged lineage or unverified history never increment',()=>{
 assert.equal(req([complete(2)]).action,'MANUAL_REVIEW');
 assert.equal(req([complete(1),complete(1)]).action,'MANUAL_REVIEW');
 assert.equal(req([complete(1),active(2,{sourceCompletionSha256:H('e')})]).action,'MANUAL_REVIEW');
 assert.equal(req([complete(1,{fullBoardReadbackVerified:false})]).action,'MANUAL_REVIEW');
 assert.equal(req([complete(1,{verified:false})]).action,'MANUAL_REVIEW');
 assert.equal(req([active(1),complete(2)]).action,'MANUAL_REVIEW');
});
test('order of verified catalog input does not change the selected version',()=>{
 const versions=[complete(3),complete(1),complete(2)];
 const x=req(versions);assert.equal(x.action,'START_NEXT');assert.equal(x.nextVersion,4);
});
