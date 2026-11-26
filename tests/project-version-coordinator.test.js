import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectVersionCoordinator} from '../project-version-coordinator.js';
const boardId='5107075373',H=n=>String(n).repeat(64);
const approvedV0={verified:true,sha256:H('a')};
const complete=v=>({planVersion:v,status:'SYNC_COMPLETED',verified:true,
 sessionId:'11111111-1111-4111-8111-'+String(v).padStart(12,'0'),
 sourceVersion:v-1,...(v===1?{sourceApprovedV0Sha256:approvedV0.sha256}:
 {sourceCompletionSha256:H(v-1)}),completionSha256:H(v),
 fullBoardReadbackVerified:true,remainingTaskCount:0});
const draft=v=>({...complete(v),status:'ACTIVE',revision:2,
 latestDraftSha256:H('f')});
function fixture(versions){
 let inspected=0,starts=0,resumes=0,versionRequested=[];
 const state=()=>({boardId,approvedV0,versions,catalogComplete:true,boardVerified:true});
 const coordinator=createProjectVersionCoordinator({boardId,readProjectState:async()=>{
   inspected++;return state();},
  storeForVersion:async v=>{
   versionRequested.push(v);return {inspect:async()=>{resumes++;return {status:'ACTIVE',planVersion:v}},
    begin:async()=>{starts++;return {status:'ACTIVE',planVersion:v}}};
  }});
 return {coordinator,counts:()=>({inspected,starts,resumes,versionRequested})};
}
test('dispatch starts V1, V2, V3, V4 from project state without a baked successor',async()=>{
 for(let n=0;n<4;n++){
  const x=fixture(Array.from({length:n},(_,i)=>complete(i+1)));
  const result=await x.coordinator.execute({userConfirmed:true});
  assert.equal(result.action,'START_NEXT');assert.equal(result.version,n+1);
  assert.deepEqual(x.counts().versionRequested,[n+1]);
 }
});
test('active DRAFT continues same version even if another version would be implemented',async()=>{
 const x=fixture([complete(1),draft(2)]);
 const result=await x.coordinator.execute();
 assert.equal(result.action,'RESUME_DRAFT');assert.equal(result.version,2);
 assert.equal(x.counts().starts,0);assert.equal(x.counts().resumes,1);
});
test('requires explicit approval for a new version and prevents side effects',async()=>{
 const x=fixture([complete(1),complete(2)]);
 await assert.rejects(x.coordinator.execute(),/confirmation/);
 assert.equal(x.counts().starts,0);
 assert.deepEqual(x.counts().versionRequested,[]);
});
test('a changed catalog between checks blocks starting a new version',async()=>{
 let count=0,started=0;
 const coordinator=createProjectVersionCoordinator({boardId,readProjectState:async()=>{
  count++;return {boardId,approvedV0,versions:count===1?[complete(1)]:[complete(1),draft(2)],
   catalogComplete:true,boardVerified:true};
 },storeForVersion:async()=>({begin:async()=>{started++;}})});
 await assert.rejects(coordinator.execute({userConfirmed:true}),/changed/);
 assert.equal(started,0);
});
test('an unsupported successor must fail closed, never silently start an earlier version',async()=>{
 const coordinator=createProjectVersionCoordinator({boardId,
 readProjectState:async()=>({boardId,approvedV0,versions:[complete(1),complete(2),complete(3)],
 catalogComplete:true,boardVerified:true}),storeForVersion:async()=>null});
 await assert.rejects(coordinator.execute({userConfirmed:true}),/not yet implemented/);
});
test('incomplete and uncertain states never allocate a new session',async()=>{
 const x=fixture([complete(1),{...draft(2),status:'SYNC_UNCERTAIN'}]);
 await assert.rejects(x.coordinator.execute({userConfirmed:true}));
 assert.equal(x.counts().starts,0);
});
