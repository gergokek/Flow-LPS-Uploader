import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotFileSha,pilotFingerprint,pilotSha} from '../v1-pilot-contract.js';
import {successorNames,makeSuccessorClaim,makeSuccessorManifest,
 makeSuccessorBaseline} from '../version-successor-contract.js';
import {versionedApprovalNames,checkVersionedApprovalFile,
 buildVersionedApprovalModelFromArtifacts,makeVersionedApprovalFreeze,
 validateVersionedApprovalFreeze,makeVersionedApprovedPlan,
 validateVersionedApprovedPlan,makeVersionedApprovalReceipt,
 validateVersionedApprovalReceipt,inspectVersionedApprovalState}
 from '../versioned-approval-sync-contract.js';
const boardId='5107075373',sessionId='44444444-4444-4444-8444-444444444444';
const editorId='96423073',createdBy='test.user',now=Date.now();
const createdAt=new Date(now-5000).toISOString();
const uuid='55555555-5555-4555-8555-555555555555';
const h=n=>n.repeat(64);
async function pair(document,path){
 const name=path.split('/').at(-1);
 return {document,receipt:{name,id:'id-'+name,eTag:'etag-'+name,path,
  sha256:await pilotFileSha(document),verification:'content-sha256-and-etag'}};
}
async function fixture(){
 const task={id:'101',name:'Sample',note:'',week:'',status:'Not started',
  forecast:null,actual:null,anchor:null,duration:1,ffLag:0,startPre:[],finishPre:[],
  readiness:'',critical:'',endWeek:'',obstacles:[],ledger:[],owner:'test'};
 const base={id:boardId,workspaceId:'7145773',columns:[],groups:[],tasks:[task]};
 const fingerprint=pilotFingerprint(base);
 const m={version:3,boardId,base,fingerprint,editorId,createdBy,taskCount:1,
  completedAt:new Date(now-60000).toISOString(),source:{
   planVersion:2,sessionId:'11111111-1111-4111-8111-111111111111',
   revision:1,approvedSha256:h('a'),completionSha256:h('b'),
   completionBoardSha256:await pilotSha(fingerprint),sourceClaimSha256:h('d')}};
 const n=successorNames(3);
 const claim=makeSuccessorClaim(m,{sessionId,createdAt});
 const artifacts={
  claim:await pair(claim,n.layout.session+'/'+n.claim),
  manifest:await pair(makeSuccessorManifest(m,claim),n.layout.session+'/'+n.manifest),
  baseline:await pair(makeSuccessorBaseline(m,claim),n.layout.drafts+'/'+n.baseline),
  revisions:[]};
 const next=structuredClone(artifacts.baseline.document);
 next.version=1;next.working[0].note='Edited';
 next.history=[{revision:1,type:'edit',at:createdAt}];
 next.session.revision=1;next.session.parentSha256=artifacts.baseline.receipt.sha256;
 artifacts.revisions.push(await pair(next,n.layout.drafts+'/draft-v3-r000001.json'));
 const model=await buildVersionedApprovalModelFromArtifacts({model:m,artifacts,now});
 const args={editorId,createdBy,expectedSessionId:sessionId,expectedRevision:1,
  expectedDraftSha256:model.sourceDraftSha256,
  expectedGenerationSha256:model.generationSha256,
  expectedPredecessorSha256:model.source.completionSha256,
  boardFingerprintSha256:model.sourceBoardSha256,
  boardVerifiedAt:new Date(now-3000).toISOString(),createdAt,
  executionId:uuid,userConfirmed:true};
 return {m,n,artifacts,model,args};
}
test('V3 approval source derives exactly one field delta and immutable version paths',async()=>{
 const f=await fixture();
 assert.equal(f.model.version,3);assert.equal(f.model.changedTaskCount,1);
 assert.equal(f.model.fieldCount,1);
 assert.equal(f.model.targets[0].fields.note.after,'Edited');
 const paths=versionedApprovalNames(boardId,3);
 assert.equal(paths.layout.approved,'Projects/5107075373/Versions/V0003/Approved');
 assert.equal(paths.ahead(12),'sync-v3-step-000012-ahead.json');
 assert.throws(()=>versionedApprovalNames(boardId,2));
 assert.throws(()=>paths.result(0));
});
test('create, validate and inspect fully bound approval receipts without writes',async()=>{
 const f=await fixture(),m=f.model,n=f.n;
 assert.equal((await inspectVersionedApprovalState({model:m,freeze:null,approved:null,approval:null})).status,'DRAFT_READY');
 const freeze=await pair(makeVersionedApprovalFreeze(m,f.args,now),
  n.layout.session+'/session-v3-freeze.json');
 assert.equal((await inspectVersionedApprovalState({model:m,freeze,approved:null,approval:null},now)).status,'APPROVAL_INCOMPLETE');
 await validateVersionedApprovalFreeze(freeze,m,now);
 const approved=await pair(makeVersionedApprovedPlan(m,freeze),
  n.layout.approved+'/approved-v3.json');
 await validateVersionedApprovedPlan(approved,m,freeze,now);
 const approval=await pair(makeVersionedApprovalReceipt(m,freeze,approved),
  n.layout.session+'/session-v3-approved.json');
 await validateVersionedApprovalReceipt(approval,m,freeze,approved,now);
 const result=await inspectVersionedApprovalState({model:m,freeze,approved,approval},now);
 assert.equal(result.status,'READY_TO_SYNC');
 assert.equal(result.readOnly,true);assert.equal(result.mondayWrites,0);
});
test('rejects mismatched SHA, path, version, drift and orphan approval',async()=>{
 const f=await fixture(),m=f.model,n=f.n;
 const freeze=await pair(makeVersionedApprovalFreeze(m,f.args,now),
  n.layout.session+'/session-v3-freeze.json');
 const badPath=structuredClone(freeze);badPath.receipt.path=n.layout.approved+'/session-v3-freeze.json';
 await assert.rejects(checkVersionedApprovalFile(badPath,boardId,3,'session','session-v3-freeze.json'));
 const tampered=structuredClone(freeze);tampered.document.finalBoardSha256=h('f');
 await assert.rejects(validateVersionedApprovalFreeze(tampered,m,now));
 assert.throws(()=>makeVersionedApprovalFreeze(m,{...f.args,
  boardFingerprintSha256:h('f')},now));
 assert.throws(()=>makeVersionedApprovalFreeze(m,{...f.args,
  userConfirmed:false},now));
 await assert.rejects(inspectVersionedApprovalState({model:m,freeze:null,
  approved:{},approval:null},now));
 const altered={...f.m,source:{...f.m.source,completionSha256:h('f')}};
 await assert.rejects(buildVersionedApprovalModelFromArtifacts({
  model:altered,artifacts:f.artifacts,now}));
});
test('cannot authorize later versions by path existence alone',async()=>{
 const f=await fixture();
 await assert.rejects(buildVersionedApprovalModelFromArtifacts({
  model:{...f.m,version:4},artifacts:f.artifacts,now}));
});
