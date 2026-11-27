import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotFingerprint,pilotSha,pilotFileSha} from '../v1-pilot-contract.js';
import {versionedApprovalNames} from '../versioned-approval-sync-contract.js';
import {createVersionedApprovalStore} from '../versioned-approval-storage.js';
const boardId='5107075373',identity={editorId:'96423073',createdBy:'test-account'};
const uuid='55555555-5555-4555-8555-555555555555';
async function fixture({drift=false,lost='',changedModel=false}={}){
 const task={id:'101',name:'Sample',note:'',week:'',status:'Not started'};
 const base={id:boardId,workspaceId:'7145773',columns:[],groups:[],tasks:[task]};
 const sourceFingerprint=pilotFingerprint(base);
 const sha=await pilotSha(sourceFingerprint);
 const names=versionedApprovalNames(boardId,3),files=new Map(),writes=[];
 const document={base,working:[{...task,note:'Approved test'}],
  history:[{revision:1,type:'edit',at:new Date().toISOString()}],
  session:{planVersion:3,sessionId:'44444444-4444-4444-8444-444444444444'}};
 const model={...identity,boardId,version:3,revision:1,names,
  sessionId:document.session.sessionId,sourceDraftSha256:'e'.repeat(64),
  generationSha256:'f'.repeat(64),claimSha256:'c'.repeat(64),
  manifestSha256:'d'.repeat(64),draftReceipt:{name:'draft-v3-r000001.json',
   sha256:'e'.repeat(64),id:'draftid',eTag:'draftetag'},
  source:{planVersion:2,completionSha256:'a'.repeat(64)},
  sourceFingerprint,sourceBoardSha256:sha,
  finalBoardSha256:await pilotSha(pilotFingerprint({...base,tasks:document.working})),
  changedTaskCount:1,fieldCount:1,taskCount:1,draft:document};
 const args=()=>({...identity,userConfirmed:true,mondayConfirmed:true,uploaderConfirmed:true,
  expectedSessionId:model.sessionId,expectedRevision:1,
  expectedDraftSha256:model.sourceDraftSha256,
  expectedGenerationSha256:model.generationSha256,
  expectedPredecessorSha256:model.source.completionSha256,
  boardFingerprintSha256:sha,boardVerifiedAt:new Date().toISOString(),executionId:uuid});
 const deps={inspectModel:async()=>changedModel?{...model,sourceDraftSha256:'0'.repeat(64)}:model,
  read:async path=>structuredClone(files.get(path)||null),
  list:async dir=>[...files.entries()].filter(([path])=>path.startsWith(dir+'/')&&
   !path.slice(dir.length+1).includes('/')).map(([,v])=>({id:v.id,name:v.name,eTag:v.eTag})),
  create:async(path,value)=>{
   assert.equal(files.has(path),false,'No overwrite permitted');
   const n=path.split('/').at(-1);
   const receipt={id:'file-'+(files.size+1),name:n,path,
    eTag:'etag-'+(files.size+1),sha256:await pilotFileSha(value),
    verification:'content-sha256-and-etag'};
   files.set(path,{...receipt,value:structuredClone(value)});
   writes.push(path);
   if(lost===n)throw Error('Simulated lost Graph response');
   return receipt;
  },
  checkPinned:async()=>true,
  readBoard:async()=>structuredClone(drift?{...base,tasks:[{...task,note:'Drift'}]}:base)};
 return {files,writes,args,deps,model,names,store:()=>createVersionedApprovalStore(deps)};
}
test('V3 approval creates an immutable freeze, Approved and receipt exactly once',async()=>{
 const f=await fixture(),s=f.store();
 assert.equal((await s.inspect(f.args())).state.status,'DRAFT_READY');
 const result=await s.approve(f.args());
 assert.equal(result.state.status,'READY_TO_SYNC');assert.equal(result.mondayWrites,0);
 assert.deepEqual(f.writes,[
  f.names.layout.session+'/session-v3-freeze.json',
  f.names.layout.approved+'/approved-v3.json',
  f.names.layout.session+'/session-v3-approved.json']);
 assert.equal((await f.store().inspect(f.args())).state.status,'READY_TO_SYNC');
 assert.equal(f.writes.length,3);
 await assert.rejects(f.store().approve(f.args()),/mar jovahagyott/);
 assert.equal(f.writes.length,3);
});
test('missing second consent and changed board both cause zero writes',async()=>{
 const f=await fixture();
 await assert.rejects(f.store().approve({...f.args(),uploaderConfirmed:false}),/Ket fuggetlen/);
 assert.equal(f.writes.length,0);
 const drift=await fixture({drift:true});
 await assert.rejects(drift.store().approve(drift.args()),/Monday-board/);
 assert.equal(drift.writes.length,0);
});
test('lost Graph response blocks same instance and resumes from verified immutable prefix',async()=>{
 const f=await fixture({lost:'approved-v3.json'}),s=f.store();
 await assert.rejects(s.approve(f.args()),/lost Graph/);
 assert.equal(f.writes.length,2);
 await assert.rejects(s.approve(f.args()),/Bizonytalan/);
 assert.equal(f.writes.length,2);
 const resumed=await f.store().approve(f.args());
 assert.equal(resumed.state.status,'READY_TO_SYNC');
 assert.equal(f.writes.length,3);
});
test('unexpected Sync files prevent approval even with explicit confirmation',async()=>{
 const f=await fixture();
 const path=f.names.layout.sync+'/sync-v3-step-000001-ahead.json';
 f.files.set(path,{id:'foreign',eTag:'etag',name:path.split('/').at(-1),
  value:{},sha256:'a'.repeat(64)});
 await assert.rejects(f.store().approve(f.args()),/Approved\/Sync/);
 assert.equal(f.writes.length,0);
});
test('stale board evidence and rejected identity pin block before create',async()=>{
 const f=await fixture();
 const old={...f.args(),boardVerifiedAt:new Date(Date.now()-240000).toISOString()};
 await assert.rejects(f.store().approve(old),/Elavult/);
 assert.equal(f.writes.length,0);
 f.deps.checkPinned=async()=>{throw Error('Pin mismatch');};
 await assert.rejects(f.store().approve(f.args()),/Pin mismatch/);
 assert.equal(f.writes.length,0);
});
test('modified model is not allowed to use stale expected draft',async()=>{
 const f=await fixture({changedModel:true});
 await assert.rejects(f.store().approve(f.args()),/Elavult/);
 assert.equal(f.writes.length,0);
});
