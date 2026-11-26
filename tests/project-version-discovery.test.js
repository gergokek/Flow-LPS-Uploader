import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectVersionDiscovery} from '../project-version-discovery.js';
const boardId='5107075373',sha=n=>String(n).repeat(64);
const v0={verified:true,sha256:sha('a')};
function complete(v){
 return {planVersion:v,verified:true,status:'SYNC_COMPLETED',
  sessionId:'11111111-1111-4111-8111-'+String(v).padStart(12,'0'),
  sourceVersion:v-1,...(v===1?{sourceApprovedV0Sha256:v0.sha256}:
  {sourceCompletionSha256:sha(v-1)}),
  completionSha256:sha(v),remainingTaskCount:0,fullBoardReadbackVerified:true};
}
function engine(ids,{completeListing=true,modified=null}={}){
 const visited=[];
 const discovery=createProjectVersionDiscovery({boardId,
  listVersions:async()=>({complete:completeListing,versions:ids}),
  inspectV0:async()=>v0,inspectBoard:async()=>({verified:true}),
  inspectVersion:async v=>{visited.push(v);return modified?.[v]||complete(v);}});
 return {discovery,visited};
}
test('discovers new V1 after verified V0 without assuming any previous cycle',async()=>{
 const {discovery,visited}=engine([]);
 const x=await discovery.inspect();
 assert.equal(x.action,'START_NEXT');assert.equal(x.nextVersion,1);
 assert.deepEqual(visited,[]);
});
test('reads every verified version and selects the next from latest completed',async()=>{
 for(const count of [1,2,3,4]){
  const e=engine(Array.from({length:count},(_,i)=>count-i));
  const x=await e.discovery.inspect();
  assert.equal(x.nextVersion,count+1);assert.equal(x.catalogVersionCount,count);
  assert.deepEqual(e.visited,Array.from({length:count},(_,i)=>i+1));
 }
});
test('unverified, missing or duplicated SharePoint files block selection',async()=>{
 for(const ids of [[1,3],[2],[1,1]]){
  const e=engine(ids);await assert.rejects(e.discovery.inspect());
 }
 await assert.rejects(engine([1],{completeListing:false}).discovery.inspect());
});
test('verified active session wins over increment even with completed history',async()=>{
 const active={...complete(3),status:'ACTIVE',revision:7,
  latestDraftSha256:sha('f')};
 const e=engine([3,1,2],{modified:{3:active}});
 const x=await e.discovery.inspect();
 assert.equal(x.action,'RESUME_DRAFT');assert.equal(x.planVersion,3);
 assert.equal(x.revision,7);
});
test('an uncertain latest sync requires manual review, never new cycle',async()=>{
 const problem={...complete(2),status:'SYNC_UNCERTAIN'};
 const e=engine([1,2],{modified:{2:problem}});
 assert.equal((await e.discovery.inspect()).action,'MANUAL_REVIEW');
});
