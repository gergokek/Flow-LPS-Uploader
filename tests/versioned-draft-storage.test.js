import test from 'node:test';
import {createPlanningStartPermit} from '../planning-start-permit.js';
import assert from 'node:assert/strict';
import {pilotFileSha,pilotFingerprint} from '../v1-pilot-contract.js';
import {createVersionedDraftStore} from '../versioned-draft-storage.js';
import {createPlanningActionGate} from '../project-planning-action-gate.js';
import {verifiedVersionedSelection} from '../versioned-session-selection.js';
const boardId='5107075373',identity={editorId:'96423073',createdBy:'test-home.account'};
const uuid='44444444-4444-4444-8444-444444444444';
function data(){
 const t={id:'101',name:'Sample',week:'',status:'Not started',note:'',
  owner:'',ownerIds:[],group:'',groupId:'',issues:[],planned:null,accepted:null,
  forecast:null,actual:null,readiness:'',duration:1,ffLag:0,startPre:[],finishPre:[],
  critical:'',endWeek:'',anchor:null,obstacles:[],ledger:[]};
 const base={id:boardId,workspaceId:'7145773',columns:[],groups:[],tasks:[t]};
 const m={version:3,boardId,base,source:{planVersion:2,
  sessionId:'11111111-1111-4111-8111-111111111111',revision:1,
  approvedSha256:'a'.repeat(64),completionSha256:'b'.repeat(64),
  completionBoardSha256:'c'.repeat(64),sourceClaimSha256:'d'.repeat(64)},
  fingerprint:pilotFingerprint(base),editorId:identity.editorId,
  createdBy:identity.createdBy,taskCount:1,completedAt:'2026-11-25T00:00:00Z'};
 return m;
}
function fixture({failAt='',boardChanged=false}={}){
 const files=new Map(),writes=[],model=data();let folders=0,boardReads=0;
 const deps={
  version:3,inspectSource:async()=>({status:'V2_SYNC_COMPLETED'}),
  sourceVerifier:async()=>structuredClone(model),
  read:async path=>structuredClone(files.get(path)||null),
  list:async dir=>[...files.entries()].filter(([key])=>key.startsWith(dir+'/')&&
   !key.slice(dir.length+1).includes('/')).map(([,file])=>({id:file.id,name:file.name,eTag:file.eTag})),
  create:async(path,doc)=>{
   assert.ok(path.startsWith('Projects/5107075373/Versions/V0003/'));
   assert.equal(files.has(path),false,'Cannot overwrite stored file');
   const receipt={path,name:path.split('/').at(-1),id:'file-'+(files.size+1),
    eTag:'etag-'+(files.size+1),sha256:await pilotFileSha(doc),
    verification:'content-sha256-and-etag'};
   files.set(path,{value:structuredClone(doc),...receipt});
   writes.push(receipt.name);
   if(receipt.name===failAt)throw Error('Simulated lost SharePoint response');
   return receipt;
  },
  ensureFolders:async()=>{folders++;},
  readBoard:async()=>{boardReads++;return structuredClone(boardChanged?
   {...model.base,tasks:[{...model.base.tasks[0],status:'Candidate'}]}:model.base);},
  randomUUID:()=>uuid
 };
 const args=()=>({...identity,executionId:'55555555-5555-4555-8555-555555555555',
  expectedPredecessorSha256:model.source.completionSha256,
  boardFingerprint:model.fingerprint,boardVerifiedAt:new Date().toISOString(),
  userConfirmed:true});
 const store=()=>createVersionedDraftStore(deps);
 return {files,writes,model,store,args,folderCount:()=>folders,boardReads:()=>boardReads};
}
test('verified V3 begin creates exactly manifest, claim, baseline; repeat is read-only',async()=>{
 const x=fixture();const s=x.store();const initial=await s.inspect(identity);
 assert.equal(initial.status,'READY_TO_START');
 const result=await s.begin(x.args());
 assert.equal(result.status,'ACTIVE');assert.equal(result.revision,0);
 assert.deepEqual(x.writes,['version-info.json','active-session-v3.json','draft-v3.json']);
 assert.ok(x.boardReads()>=2);
 const restarted=await x.store().begin(x.args());
 assert.equal(restarted.status,'ACTIVE');
 assert.equal(restarted.claim.document.sessionId,uuid);
 assert.equal(x.writes.length,3,'Verified existing session is never duplicated');
});
test('lost claim-create response recovers the same session id and no duplicate files',async()=>{
 const x=fixture({failAt:'active-session-v3.json'});
 await assert.rejects(x.store().begin(x.args()),/Simulated/);
 assert.equal(x.writes.length,2);
 const r=await x.store().begin(x.args());
 assert.equal(r.status,'ACTIVE');assert.equal(r.claim.document.sessionId,uuid);
 assert.deepEqual(x.writes,['version-info.json','active-session-v3.json','draft-v3.json']);
});
test('baseline loss recovers without a new session or baseline overwrite',async()=>{
 const x=fixture({failAt:'draft-v3.json'});
 await assert.rejects(x.store().begin(x.args()));
 const r=await x.store().begin(x.args());
 assert.equal(r.status,'ACTIVE');
 assert.equal(x.writes.length,3);
});
test('revised V3 draft stored in same version folder, with strict parent SHA',async()=>{
 const x=fixture(),s=x.store(),init=await s.begin(x.args());
 const d=structuredClone(init.baseline.document);
 d.version=1;d.history=[{revision:1,type:'edit',at:new Date().toISOString()}];
 d.working[0].note='V3 first edit';
 const saved=await s.append({...identity,updatedDraft:d,expectedSessionId:uuid,
  expectedParentSha256:init.baseline.receipt.sha256});
 assert.equal(saved.versionLabel,'V3.1');
 assert.equal(saved.receipt.path,'Projects/5107075373/Versions/V0003/Drafts/draft-v3-r000001.json');
 assert.equal(x.writes.length,4);
 await assert.rejects(x.store().append({...identity,updatedDraft:d,expectedSessionId:uuid,
  expectedParentSha256:init.baseline.receipt.sha256}));
 const latest=await x.store().inspect(identity);
 assert.equal(latest.status,'ACTIVE');assert.equal(latest.revision,1);
});
test('board drift or missing authorization writes absolutely no new session files',async()=>{
 const bad=fixture({boardChanged:true});
 await assert.rejects(bad.store().begin(bad.args()),/board elter/);
 assert.equal(bad.writes.length,0);assert.equal(bad.folderCount(),0);
 const x=fixture();await assert.rejects(x.store().begin({...x.args(),userConfirmed:false}));
 assert.equal(x.writes.length,0);
});

test('a frozen V3 session never reports itself as a resumable ACTIVE draft',async()=>{
 const x=fixture(),store=x.store();
 const opened=await store.begin(x.args());
 const freezePath='Projects/5107075373/Versions/V0003/Session/session-v3-freeze.json';
 const document={schemaVersion:1,format:'mflow-versioned-freeze',planVersion:3,
  sessionId:opened.claim.document.sessionId};
 const file={value:document,path:freezePath,name:'session-v3-freeze.json',
  id:'freeze-id',eTag:'freeze-etag',sha256:await pilotFileSha(document),
  verification:'content-sha256-and-etag'};
 x.files.set(freezePath,file);
 const result=await x.store().inspect(identity);
 assert.equal(result.status,'APPROVAL_FROZEN');
 assert.equal(result.hasFreeze,true);
 await assert.rejects(x.store().append({...identity,
  expectedSessionId:opened.claim.document.sessionId,
  expectedParentSha256:opened.baseline.receipt.sha256,
  updatedDraft:opened.baseline.document}),/zarolt/);
});

test('unverified Approved or Sync artifact blocks a supposedly editable V3 DRAFT',async()=>{
 for(const folder of ['Approved','Sync']){
  const x=fixture();const opened=await x.store().begin(x.args());
  const path='Projects/5107075373/Versions/V0003/'+folder+'/foreign.json';
  x.files.set(path,{id:'unexpected-'+folder,eTag:'etag-'+folder,
   name:'foreign.json',value:{status:'UNVERIFIED'},sha256:'f'.repeat(64)});
  await assert.rejects(x.store().inspect(identity),/Approved\/Sync/);
  const next=structuredClone(opened.baseline.document);
  next.version=1;next.history=[{revision:1,type:'edit',at:new Date().toISOString()}];
  next.working[0].note='edit';
  await assert.rejects(x.store().append({...identity,
   expectedSessionId:opened.claim.document.sessionId,
   expectedParentSha256:opened.baseline.receipt.sha256,updatedDraft:next}),/Approved\/Sync/);
 }
});

test('patch batch integrated: state-selected start -> verified V3.0 -> V3.1 -> resume, no duplicate writes',async()=>{
 const x=fixture();
 const makeGate=()=>createPlanningActionGate({
  inspectCurrent:async()=>{
   const p=await x.store().inspect(identity),active=p.status==='ACTIVE';
   return {readOnly:true,mondayWrites:0,verifiedVersionCount:active?3:2,
    boardMatches:true,action:active?'RESUME_DRAFT':'START_NEXT',
    status:active?'ACTIVE':'READY_TO_START',planVersion:3,
    revision:active?p.revision:null,
    predecessorCompletionSha256:x.model.source.completionSha256,
    ...(active?{sessionId:p.claim.document.sessionId,latestDraftSha256:p.latest.receipt.sha256}:{})};
  },storeForVersion:async version=>{
   assert.equal(version,3);return x.store();
  }
 });
 const first=await makeGate().execute({...x.args(),
  mondayConfirmed:true,uploaderConfirmed:true});
 assert.equal(first.action,'START_NEXT');
 assert.equal(first.report.status,'ACTIVE');
 const selected=await verifiedVersionedSelection(first.report);
 assert.equal(selected.versionLabel,'V3');assert.equal(selected.planVersion,3);
 assert.equal(x.writes.length,3);
 const d=structuredClone(selected.draft);d.version=1;
 d.history=[{revision:1,type:'edit',at:new Date().toISOString()}];
 d.working[0].note='batch-v3-edit';
 const saved=await x.store().append({...identity,updatedDraft:d,
  expectedSessionId:selected.sessionId,
  expectedParentSha256:selected.receipt.sha256});
 assert.equal(saved.boardId,boardId);assert.equal(saved.versionLabel,'V3.1');
 assert.equal(x.writes.length,4);
 const second=await makeGate().execute({...identity});
 assert.equal(second.action,'RESUME_DRAFT');
 assert.equal(second.report.revision,1);
 assert.equal(x.writes.length,4);
});

test('real gate and store: two approvals before fresh board and exactly one V3.0',async()=>{
 const x=fixture();
 const args={...x.args(),mondayConfirmed:true,boardSnapshot:x.model.base};
 const state={action:'START_NEXT',status:'READY_TO_START',planVersion:3,revision:null,readOnly:true,mondayWrites:0,verifiedVersionCount:2,boardMatches:true,predecessorCompletionSha256:x.model.source.completionSha256};
 const permit=createPlanningStartPermit();
 const proof=permit.issue({state,args,confirmed:true,isCurrent:()=>true});
 assert.equal(x.writes.length,0);
 const begin={...args,permitId:proof.permitId,boardVerifiedAt:new Date().toISOString()};
 const auth=permit.consume(begin);
 const gate=createPlanningActionGate({inspectCurrent:async()=>state,storeForVersion:async v=>{assert.equal(v,3);return x.store();}});
 const result=await gate.execute({...begin,uploaderConfirmed:auth.uploaderConfirmed});
 assert.equal((await verifiedVersionedSelection(result.report)).versionLabel,'V3');
 assert.deepEqual(x.writes,['version-info.json','active-session-v3.json','draft-v3.json']);
 assert.throws(()=>permit.consume(begin));
 assert.equal(x.writes.length,3);
});
