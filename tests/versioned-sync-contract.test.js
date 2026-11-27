import test from 'node:test';
import {inspectV4StartReadiness} from '../versioned-next-cycle-proof.js';
import assert from 'node:assert/strict';
import {pilotFingerprint,pilotFileSha,pilotSha,pilotStable,pilotTask}
 from '../v1-pilot-contract.js';
import {versionedApprovalNames,makeVersionedApprovalFreeze,
 makeVersionedApprovedPlan,makeVersionedApprovalReceipt}
 from '../versioned-approval-sync-contract.js';
import {inspectVersionedSyncCycle,makeVersionedSyncAhead,
 makeVersionedSyncFinal,versionedSyncCommon,validateVersionedSyncAhead,
 validateVersionedSyncResult} from '../versioned-sync-contract.js';
const boardId='5107075373';
const uuid='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const h=c=>c.repeat(64),date=()=>new Date().toISOString();
const folder=(m,kind)=>m.names.layout[kind];
async function wrap(m,kind,name,document){
 return {document,receipt:{name,id:'id-'+name,eTag:'etag-'+name,
 path:folder(m,kind)+'/'+name,sha256:await pilotFileSha(document),
 verification:'content-sha256-and-etag'}};
}
async function fixture(){
 const before={id:'101',name:'Task',note:'',week:'',status:'Not started'};
 const after={...before,note:'Changed'};
 const base={id:boardId,workspaceId:'7145773',columns:[],groups:[],tasks:[before]};
 const sourceFingerprint=pilotFingerprint(base);
 const expectedFingerprint=pilotFingerprint({...base,tasks:[after]});
 const sessionId='33333333-3333-4333-8333-333333333333';
 const m={version:3,boardId,editorId:'96423073',createdBy:'home-account',
  revision:1,sessionId,sourceDraftSha256:h('a'),claimSha256:h('b'),
  manifestSha256:h('c'),generationSha256:h('d'),
  source:{planVersion:2,completionSha256:h('e')},
  draftReceipt:{name:'draft-v3-r000001.json',id:'draft',eTag:'etag',
   sha256:h('a')},draft:{base,working:[after],history:[],
  session:{planVersion:3,sessionId}},sourceFingerprint,
  sourceBoardSha256:await pilotSha(sourceFingerprint),
  finalBoardSha256:await pilotSha(expectedFingerprint),changedTaskCount:1,
  fieldCount:1,taskCount:1,names:versionedApprovalNames(boardId,3),
  targets:[{step:1,taskId:'101',taskName:'Task',
   fields:{note:{before:'',after:'Changed'}},before,after,
   sourceBoardSha256:await pilotSha(sourceFingerprint),
   expectedBoardSha256:await pilotSha(expectedFingerprint),
   expectedItemSha256:await pilotSha(pilotStable(pilotTask(after)))}]};
 const when=date();
 const freeze=await wrap(m,'session',m.names.freeze,makeVersionedApprovalFreeze(m,{
  userConfirmed:true,executionId:uuid,createdAt:when,boardVerifiedAt:when,
  editorId:m.editorId,createdBy:m.createdBy,expectedSessionId:m.sessionId,
  expectedRevision:1,expectedDraftSha256:m.sourceDraftSha256,
  expectedGenerationSha256:m.generationSha256,
  expectedPredecessorSha256:m.source.completionSha256,
  boardFingerprintSha256:m.sourceBoardSha256}));
 const approved=await wrap(m,'approved',m.names.approved,makeVersionedApprovedPlan(m,freeze));
 const approval=await wrap(m,'session',m.names.approval,
  makeVersionedApprovalReceipt(m,freeze,approved));
 const report={model:m,freeze,approved,approval,records:[],final:null};
 const state=await inspectVersionedSyncCycle(report);
 const args=s=>({editorId:m.editorId,createdBy:m.createdBy,
  expectedSessionId:m.sessionId,expectedRevision:m.revision,
  expectedDraftSha256:m.sourceDraftSha256,
  expectedApprovedSha256:approved.receipt.sha256,
  expectedApprovalReceiptSha256:approval.receipt.sha256,
  expectedGenerationSha256:s.generationSha256,
  boardFingerprintSha256:s.expectedBoardSha256,boardVerifiedAt:date(),
  executionId:uuid,requestId,step:1,taskId:'101',mutationValuesSha256:h('f')});
 return {m,report,state,args};
}
test('V3 never syncs without exact approved lineage and no journal',async()=>{
 const f=await fixture();
 assert.equal(f.state.status,'READY_TO_SYNC');
 assert.equal(f.state.verifiedTaskCount,0);
 assert.equal(f.state.expectedBoardSha256,f.m.sourceBoardSha256);
 await assert.rejects(inspectVersionedSyncCycle({...f.report,approval:null}));
});
test('V3 complete write-ahead, readback and final receipt chain',async()=>{
 const f=await fixture(),t=f.m.targets[0];
 const aheadDoc=makeVersionedSyncAhead(f.m,f.report,f.state,f.args(f.state));
 const ahead=await wrap(f.m,'sync',f.m.names.ahead(1),aheadDoc);
 await validateVersionedSyncAhead(ahead,f.m,f.report,t,
  f.state.previousResultSha256);
 const partial={...f.report,records:[{step:1,ahead,result:null}]};
 assert.equal((await inspectVersionedSyncCycle(partial)).status,'MANUAL_REVIEW_REQUIRED');
 const resultDoc={...versionedSyncCommon(f.m,f.report),
  format:'mflow-versioned-sync-result',status:'ITEM_READBACK_VERIFIED',
  step:1,taskId:'101',executionId:uuid,requestId,
  writeAheadSha256:ahead.receipt.sha256,mutationValuesSha256:h('f'),
  mutationAttempts:1,replyConfirmed:true,itemReadbackMatches:true,
  fullBoardReadbackMatches:true,itemReadbackSha256:t.expectedItemSha256,
  boardReadbackSha256:t.expectedBoardSha256,error:null,
  checkedAt:date(),automaticallyRetryable:false};
 const result=await wrap(f.m,'sync',f.m.names.result(1),resultDoc);
 await validateVersionedSyncResult(result,ahead,f.m,f.report,t);
 const ready={...f.report,records:[{step:1,ahead,result}]};
 const after=await inspectVersionedSyncCycle(ready);
 assert.equal(after.status,'READY_TO_CLOSE');
 assert.equal(after.remainingTaskCount,0);
 assert.equal(after.expectedBoardSha256,f.m.finalBoardSha256);
 const finalDoc=makeVersionedSyncFinal(f.m,ready,after,{
  ...f.args(after),step:undefined},Date.now());
 const final=await wrap(f.m,'sync',f.m.names.completed,finalDoc);
 const complete=await inspectVersionedSyncCycle({...ready,final});
 assert.equal(complete.status,'V3_SYNC_COMPLETED');
 assert.equal(complete.verifiedTaskCount,1);
 const v4=await inspectV4StartReadiness({report:{...ready,final},
  verifiedSource:{...f.m},liveBoard:{...f.m.draft.base,
   tasks:f.m.draft.working},editorId:f.m.editorId,createdBy:f.m.createdBy});
 assert.equal(v4.status,'V4_READY_TO_START');
 assert.equal(v4.nextVersion,4);assert.equal(v4.startEnabled,false);
 assert.equal(v4.source.completionSha256,final.receipt.sha256);
 await assert.rejects(inspectV4StartReadiness({report:{...ready,final},
  verifiedSource:{...f.m},liveBoard:{...f.m.draft.base,
   tasks:[{...f.m.draft.working[0],note:'Drift'}]},
  editorId:f.m.editorId,createdBy:f.m.createdBy}));
});
test('V3 uncertain result blocks journal progression and cannot close',async()=>{
 const f=await fixture(),t=f.m.targets[0];
 const ahead=await wrap(f.m,'sync',f.m.names.ahead(1),
  makeVersionedSyncAhead(f.m,f.report,f.state,f.args(f.state)));
 const abort={...versionedSyncCommon(f.m,f.report),
  format:'mflow-versioned-sync-result',status:'ABORTED_NO_WRITE',
  step:1,taskId:'101',executionId:uuid,requestId,
  writeAheadSha256:ahead.receipt.sha256,mutationValuesSha256:h('f'),
  mutationAttempts:0,replyConfirmed:false,itemReadbackMatches:false,
  fullBoardReadbackMatches:false,itemReadbackSha256:null,
  boardReadbackSha256:f.m.sourceBoardSha256,error:'PREWRITE_CHECK_FAILED',
  checkedAt:date(),automaticallyRetryable:false};
 const row={step:1,ahead,result:await wrap(f.m,'sync',f.m.names.result(1),abort)};
 const partial={...f.report,records:[row]};
 assert.equal((await inspectVersionedSyncCycle(partial)).status,'MANUAL_REVIEW_REQUIRED');
 await assert.rejects(inspectVersionedSyncCycle({...partial,
  final:await wrap(f.m,'sync',f.m.names.completed,{})}));
 const changed={...ahead,document:{...ahead.document,taskId:'999'}};
 await assert.rejects(validateVersionedSyncAhead(changed,f.m,f.report,t,
  f.state.previousResultSha256));
});
test('V3 sync board authorization requires current exact generation',async()=>{
 const f=await fixture();
 assert.throws(()=>makeVersionedSyncAhead(f.m,f.report,f.state,
  {...f.args(f.state),expectedGenerationSha256:h('9')}));
 assert.throws(()=>makeVersionedSyncAhead(f.m,f.report,f.state,
  {...f.args(f.state),boardVerifiedAt:new Date(Date.now()-300000).toISOString()}));
});
