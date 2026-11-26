import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotFileSha,pilotFingerprint} from '../v1-pilot-contract.js';
import {verifiedVersionedSelection} from '../versioned-session-selection.js';
const boardId='5107075373',sessionId='22222222-2222-4222-8222-222222222222';
async function sample(){
 const base={id:boardId,workspaceId:'17',columns:[],groups:[],
  tasks:[{id:'101',name:'Task',status:'Not started',note:'',week:'',ledger:[]}]};
 const draft={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,
  boardId,source:pilotFingerprint(base),version:1,base,working:structuredClone(base.tasks),
  history:[{revision:1,type:'edit',at:'2026-11-26T10:00:00Z'}],
  session:{sessionId,planVersion:3,revision:1,parentSha256:'a'.repeat(64)}};
 const receipt={id:'draft-1',eTag:'etag-1',name:'draft-v3-r000001.json',
  path:'Projects/5107075373/Versions/V0003/Drafts/draft-v3-r000001.json',
  sha256:await pilotFileSha(draft),verification:'content-sha256-and-etag'};
 return {status:'ACTIVE',planVersion:3,revision:1,
  claim:{document:{sessionId,boardId,planVersion:3}},
  latest:{document:draft,receipt},hasFreeze:false,hasApproval:false,hasClosure:false};
}
test('verified V3.1 editor selection transfers only the checked original receipt',async()=>{
 const input=await sample(),result=await verifiedVersionedSelection(input);
 assert.equal(result.versionLabel,'V3.1');assert.equal(result.planVersion,3);
 assert.equal(result.sessionId,sessionId);assert.equal(result.mondayWrites,0);
 input.latest.document.working[0].note='tampered after selection';
 assert.equal(result.draft.working[0].note,'');
});
test('freeze, replaced SHA, wrong folder or mismatched session cannot be handed off',async()=>{
 const a=await sample();
 for(const changed of [
  {...a,hasFreeze:true},
  {...a,latest:{...a.latest,receipt:{...a.latest.receipt,sha256:'f'.repeat(64)}}},
  {...a,latest:{...a.latest,receipt:{...a.latest.receipt,path:'Projects/5107075373/Draft-Plans/draft-v3-r000001.json'}}},
  {...a,claim:{document:{...a.claim.document,sessionId:'33333333-3333-4333-8333-333333333333'}}}
 ])await assert.rejects(verifiedVersionedSelection(changed));
});
