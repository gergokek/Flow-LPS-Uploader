import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotFingerprint,pilotFileSha,pilotSha,pilotStable,pilotTask}
 from '../v1-pilot-contract.js';
import {versionedApprovalNames,makeVersionedApprovalFreeze,
 makeVersionedApprovedPlan,makeVersionedApprovalReceipt}
 from '../versioned-approval-sync-contract.js';
import {createVersionedSyncStore} from '../versioned-sync-storage.js';
import {versionedSyncCommon} from '../versioned-sync-contract.js';
const h=c=>c.repeat(64),boardId='5107075373',
 executionId='11111111-1111-4111-8111-111111111111',
 requestId='22222222-2222-4222-8222-222222222222';
const time=()=>new Date().toISOString();
async function fixture({lost='',drift=false}={}){
 const before={id:'101',name:'Task',note:'',week:'',status:'Not started'},
 after={...before,note:'Changed'};
 const base={id:boardId,workspaceId:'7145773',columns:[],groups:[],tasks:[before]};
 let current=structuredClone(drift?{...base,tasks:[{...before,note:'Drift'}]}:base);
 const sourceFingerprint=pilotFingerprint(base),expectedFingerprint=
  pilotFingerprint({...base,tasks:[after]});
 const names=versionedApprovalNames(boardId,3),files=new Map(),writes=[];
 const m={version:3,boardId,editorId:'96423073',createdBy:'test-account',
  sessionId:'33333333-3333-4333-8333-333333333333',revision:1,
  sourceDraftSha256:h('a'),claimSha256:h('b'),manifestSha256:h('c'),
  generationSha256:h('d'),source:{planVersion:2,completionSha256:h('e')},
  draftReceipt:{name:'draft-v3-r000001.json',id:'draft',eTag:'etag',sha256:h('a')},
  sourceFingerprint,sourceBoardSha256:await pilotSha(sourceFingerprint),
  finalBoardSha256:await pilotSha(expectedFingerprint),changedTaskCount:1,
  fieldCount:1,taskCount:1,names,
  draft:{base,working:[after],history:[],session:{planVersion:3,
   sessionId:'33333333-3333-4333-8333-333333333333'}},
  targets:[{step:1,taskId:'101',taskName:'Task',
   fields:{note:{before:'',after:'Changed'}},before,after,
   sourceBoardSha256:await pilotSha(sourceFingerprint),
   expectedBoardSha256:await pilotSha(expectedFingerprint),
   expectedItemSha256:await pilotSha(pilotStable(pilotTask(after)))}]};
 const write=async(path,value)=>{
  assert.equal(files.has(path),false,'Never overwrite any artifact');
  const name=path.split('/').at(-1),
   receipt={name,id:'id-'+(files.size+1),eTag:'etag-'+(files.size+1),path,
    sha256:await pilotFileSha(value),verification:'content-sha256-and-etag'};
  files.set(path,{...receipt,value:structuredClone(value)});
  writes.push(name);
  if(lost===name)throw Error('Simulated lost Graph result');
  return receipt;
 };
 const approvalArgs={editorId:m.editorId,createdBy:m.createdBy,
  expectedSessionId:m.sessionId,expectedRevision:m.revision,
  expectedDraftSha256:m.sourceDraftSha256,
  expectedGenerationSha256:m.generationSha256,
  expectedPredecessorSha256:m.source.completionSha256,
  boardFingerprintSha256:m.sourceBoardSha256,
  boardVerifiedAt:time(),createdAt:time(),userConfirmed:true,executionId};
 const freezeDoc=makeVersionedApprovalFreeze(m,approvalArgs);
 const f=await write(names.layout.session+'/'+names.freeze,freezeDoc);
 const freeze={document:freezeDoc,receipt:f};
 const approvedDoc=makeVersionedApprovedPlan(m,freeze);
 const a=await write(names.layout.approved+'/'+names.approved,approvedDoc);
 const approved={document:approvedDoc,receipt:a};
 const receiptDoc=makeVersionedApprovalReceipt(m,freeze,approved);
 const ap=await write(names.layout.session+'/'+names.approval,receiptDoc);
 const args=state=>({editorId:m.editorId,createdBy:m.createdBy,
  expectedSessionId:m.sessionId,expectedRevision:m.revision,
  expectedDraftSha256:m.sourceDraftSha256,
  expectedApprovedSha256:a.sha256,expectedApprovalReceiptSha256:ap.sha256,
  expectedGenerationSha256:state.generationSha256,
  boardFingerprintSha256:state.expectedBoardSha256,
  boardVerifiedAt:time(),executionId,requestId,step:1,taskId:'101',
  mutationValuesSha256:h('f'),userConfirmed:true,
  mondayConfirmed:true,uploaderConfirmed:true});
 writes.length=0;
 const deps={inspectModel:async()=>m,read:async path=>structuredClone(files.get(path)||null),
  list:async dir=>[...files.entries()].filter(([path])=>path.startsWith(dir+'/'))
   .map(([,v])=>({id:v.id,name:v.name,eTag:v.eTag})),
  create:write,readBoard:async()=>structuredClone(current),
  checkPinned:async()=>true};
 return {m,names,files,writes,base,before,after,args,deps,
  setBoard:value=>{current=structuredClone(value);},
  store:()=>createVersionedSyncStore(deps)};
}
test('V3 initial Sync is read-only until separate dual consent and live board match',async()=>{
 const f=await fixture(),store=f.store();
 const r=await store.inspect({});
 assert.equal(r.state.status,'READY_TO_SYNC');
 assert.equal(r.mondayWrites,0);
 assert.equal(f.writes.length,0);
 await assert.rejects(store.begin({...f.args(r.state),uploaderConfirmed:false}));
 const drift=await fixture({drift:true});
 const report=await drift.store().inspect({});
 await assert.rejects(drift.store().begin(drift.args(report.state)),/Monday-board/);
 assert.equal(drift.writes.length,0);
});
test('V3 Sync produces only ahead/result/final, with no Monday mutation client',async()=>{
 const f=await fixture(),store=f.store();
 const initial=await store.inspect({});
 const begun=await store.begin(f.args(initial.state));
 assert.equal(begun.state.status,'READY_TO_SYNC');
 const ahead=await store.ahead(f.args(begun.state));
 assert.equal(ahead.document.status,'WRITE_AHEAD');
 const pending=await store.inspect({});
 assert.equal(pending.state.status,'MANUAL_REVIEW_REQUIRED');
 f.setBoard({...f.base,tasks:[f.after]});
 const resultDoc={...versionedSyncCommon(f.m,initial.report),
  format:'mflow-versioned-sync-result',status:'ITEM_READBACK_VERIFIED',
  step:1,taskId:'101',executionId,requestId,
  writeAheadSha256:ahead.receipt.sha256,
  mutationValuesSha256:h('f'),mutationAttempts:1,
  replyConfirmed:true,itemReadbackMatches:true,fullBoardReadbackMatches:true,
  itemReadbackSha256:f.m.targets[0].expectedItemSha256,
  boardReadbackSha256:f.m.finalBoardSha256,error:null,
  checkedAt:time(),automaticallyRetryable:false};
 await store.result({executionId,editorId:f.m.editorId,
  createdBy:f.m.createdBy,result:resultDoc});
 const after=await store.inspect({});
 assert.equal(after.state.status,'READY_TO_CLOSE');
 assert.equal(after.state.remainingTaskCount,0);
 await store.finish(f.args(after.state));
 assert.equal((await store.inspect({})).state.status,'V3_SYNC_COMPLETED',
  'A vegnyugta ugyanabban a kapcsolaton olvashato marad.');
 const completed=await f.store().inspect({});
 assert.equal(completed.state.status,'V3_SYNC_COMPLETED');
 assert.deepEqual(f.writes,[f.names.ahead(1),f.names.result(1),f.names.completed]);
 assert.equal(completed.state.verifiedTaskCount,1);
});
test('lost ahead response blocks the instance and a new instance refuses mutation',async()=>{
 const f=await fixture({lost:'sync-v3-step-000001-ahead.json'});
 const store=f.store(),p=await store.inspect({});
 await store.begin(f.args(p.state));
 await assert.rejects(store.ahead(f.args(p.state)),/lost Graph/);
 await assert.rejects(store.ahead(f.args(p.state)),/Bizonytalan/);
 assert.equal((await f.store().inspect({})).state.status,'MANUAL_REVIEW_REQUIRED');
 assert.deepEqual(f.writes,[f.names.ahead(1)]);
});
test('foreign Sync document never becomes a verified journal or completion proof',async()=>{
 const f=await fixture();
 const path=f.names.layout.sync+'/unknown.json';
 f.files.set(path,{name:'unknown.json',id:'foreign',eTag:'etag',
  sha256:h('f'),value:{}});
 await assert.rejects(f.store().inspect({}),/Ismeretlen V3/);
});
