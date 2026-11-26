import test from 'node:test';
import assert from 'node:assert/strict';
import {projectVerifiedCycleState} from '../project-live-state-adapter.js';
const H=x=>String(x).repeat(64);
const session1='11111111-1111-4111-8111-111111111111';
const session2='22222222-2222-4222-8222-222222222222';
const session3='33333333-3333-4333-8333-333333333333';
const approvedV0={sha256:H('a')},v1End=H('1'),v2End=H('2');
const oldV1Claim={value:{sessionId:session1,planVersion:1,
 approvedV0Sha256:approvedV0.sha256},sha256:H('c')};
const v1State={status:'V1_SYNC_COMPLETED',remainingTaskCount:0,
 model:{pilot:{sessionId:session1}}};
const v1Report={evidence:{final:{receipt:{sha256:v1End}}}};
const v2Report={session:{closure:{document:{lineage:{
 sourceClaimSha256:oldV1Claim.sha256}}},claim:{document:{
 sessionId:session2,planVersion:2}}},final:{document:{
 fullBoardReadbackMatches:true},receipt:{sha256:v2End}}};
const v2State={status:'V2_SYNC_COMPLETED',remainingTaskCount:0,
 model:{sessionId:session2,completionV1Sha256:v1End,revision:1,
 sourceDraftSha256:H('f'),sourceFingerprint:'V1 board fingerprint',
 finalFingerprint:'V2 board fingerprint',draft:{session:{planVersion:2}}}};
const folderCatalog={complete:true,versions:[1,2],preparedFolders:[3]};
const options={boardId:'5107075373',approvedV0,oldV1Claim,
 v1State,v1Report,v2State,v2Report,folderCatalog,
 boardFingerprint:v2State.model.finalFingerprint};
test('verified real V2 closure selects next unstarted version; empty V3 is not active',()=>{
 const d=projectVerifiedCycleState(options);
 assert.equal(d.action,'START_NEXT');assert.equal(d.nextVersion,3);
 assert.deepEqual(d.preparedFolders,[3]);assert.equal(d.boardMatches,true);
 assert.equal(d.mondayWrites,0);
});
test('V2 active revision always resumes V2 without allocating V3',()=>{
 const model={...v2State.model,revision:5};
 const x=projectVerifiedCycleState({...options,
  v2State:{status:'DRAFT_READY',model},boardFingerprint:model.sourceFingerprint});
 assert.equal(x.action,'RESUME_DRAFT');assert.equal(x.planVersion,2);
 assert.equal(x.revision,5);
});
test('changed Monday board blocks transition to a new plan',()=>{
 const x=projectVerifiedCycleState({...options,boardFingerprint:'external edit'});
 assert.equal(x.action,'MANUAL_REVIEW');assert.equal(x.nextVersion,null);
});
test('V3 with verified active session resumes V3, not V4',()=>{
 const v3Report={status:'ACTIVE',planVersion:3,revision:2,
  claim:{document:{sessionId:session3,source:{completionSha256:v2End}}},
  latest:{receipt:{sha256:H('e')}}};
 const x=projectVerifiedCycleState({...options,
  folderCatalog:{complete:true,versions:[1,2,3]},v3Report});
 assert.equal(x.action,'RESUME_DRAFT');assert.equal(x.planVersion,3);
 assert.equal(x.revision,2);
});
test('missing or inconsistent V1/V2 lineage and partial V3 fail closed',()=>{
 assert.throws(()=>projectVerifiedCycleState({...options,
  oldV1Claim:{...oldV1Claim,sha256:H('b')}}));
 assert.throws(()=>projectVerifiedCycleState({...options,
  v2State:{...v2State,model:{...v2State.model,completionV1Sha256:H('b')}}}));
 assert.throws(()=>projectVerifiedCycleState({...options,
  folderCatalog:{complete:true,versions:[1,2,3]}}));
});
test('V2 uncertain status never permits V3 start',()=>{
 const x=projectVerifiedCycleState({...options,
  v2State:{...v2State,status:'MANUAL_REVIEW_REQUIRED'}});
 assert.equal(x.action,'CONTINUE_FINALIZATION');assert.equal(x.readOnly,true);
});
test('unknown V4 folder blocks unsupported transition rather than silently skipping',()=>{
 assert.throws(()=>projectVerifiedCycleState({...options,
  folderCatalog:{complete:true,versions:[1,2,3,4]}}));
});
