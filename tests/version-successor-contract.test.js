import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotFileSha,pilotFingerprint} from '../v1-pilot-contract.js';
import {successorNames,makeSuccessorClaim,makeSuccessorManifest,
 makeSuccessorBaseline,makeNextSuccessorDraft,inspectSuccessorArtifacts,
 inspectPredecessor} from '../version-successor-contract.js';
const boardId='5107075373',now='2026-11-26T09:20:00.000Z';
function model(){
 const tasks=[{id:'101',name:'Minta',week:'',status:'Not started',note:'',
  owner:'',ownerIds:[],group:'',groupId:'',issues:[],planned:null,accepted:null,
  forecast:null,actual:null,readiness:'',duration:1,ffLag:0,startPre:[],finishPre:[],
  critical:'',endWeek:'',anchor:null,obstacles:[],ledger:[]}];
 const base={id:boardId,workspaceId:'7145773',columns:[],groups:[],tasks};
 return {version:3,boardId,base,source:{planVersion:2,
  sessionId:'11111111-1111-4111-8111-111111111111',revision:1,
  approvedSha256:'a'.repeat(64),completionSha256:'b'.repeat(64),
  completionBoardSha256:'c'.repeat(64),sourceClaimSha256:'d'.repeat(64)},
  fingerprint:pilotFingerprint(base),editorId:'96423073',
  createdBy:'22222222-2222-4222-8222-222222222222.33333333-3333-4333-8333-333333333333',
  taskCount:1,completedAt:'2026-11-25T00:00:00Z'};
}
async function wrap(document,folder,name){
 return {document,receipt:{name,id:'id-'+name,eTag:'etag-'+name,
  sha256:await pilotFileSha(document),path:folder+'/'+name,verification:'content-sha256-and-etag'}};
}
async function workspace(){
 const m=model(),names=successorNames(3);
 const claim=makeSuccessorClaim(m,{sessionId:'44444444-4444-4444-8444-444444444444',createdAt:now});
 const manifest=await wrap(makeSuccessorManifest(m,claim),names.layout.session,names.manifest);
 const c=await wrap(claim,names.layout.session,names.claim);
 const baseline=await wrap(makeSuccessorBaseline(m,claim),names.layout.drafts,names.baseline);
 return {m,names,claim,manifest,c,baseline};
}
test('successor source cannot start V3 from an unverified or future version',async()=>{
 await assert.rejects(inspectPredecessor({predecessor:{},version:3,
  editorId:'96423073',createdBy:'test',now:Date.parse(now)}));
 await assert.rejects(inspectPredecessor({predecessor:{},version:4,
  editorId:'96423073',createdBy:'test',now:Date.parse(now)}),/V4/);
});
test('no manifest is a read-only READY state; orphan claims fail closed',async()=>{
 const {m,baseline,c}=await workspace();
 assert.equal((await inspectSuccessorArtifacts({model:m,manifest:null,claim:null,baseline:null,revisions:[]},Date.parse(now))).status,'READY_TO_START');
 await assert.rejects(inspectSuccessorArtifacts({model:m,manifest:null,claim:c,baseline:null,revisions:[]},Date.parse(now)));
 await assert.rejects(inspectSuccessorArtifacts({model:m,manifest:null,claim:null,baseline,revisions:[]},Date.parse(now)));
});
test('V3 manifest, claim, baseline and one revision verify in isolated paths',async()=>{
 const {m,names,claim,manifest,c,baseline}=await workspace();
 let state=await inspectSuccessorArtifacts({model:m,manifest,claim:c,baseline,revisions:[]},Date.parse(now));
 assert.equal(state.status,'ACTIVE');assert.equal(state.revision,0);
 const d=structuredClone(baseline.document);
 d.version=1;d.working[0].note='V3 draft change';
 d.history=[{revision:1,type:'edit',at:now}];
 const next=makeNextSuccessorDraft(baseline.document,d,m,claim,baseline.receipt.sha256);
 const revision=await wrap(next,names.layout.drafts,'draft-v3-r000001.json');
 state=await inspectSuccessorArtifacts({model:m,manifest,claim:c,baseline,revisions:[revision]},Date.parse(now));
 assert.equal(state.status,'ACTIVE');assert.equal(state.revision,1);
 assert.equal(state.latest.document.working[0].note,'V3 draft change');
 assert.equal(state.latest.receipt.path,'Projects/5107075373/Versions/V0003/Drafts/draft-v3-r000001.json');
});
test('tampered source, receipt path or revision order blocks reopening',async()=>{
 const {m,manifest,c,baseline,claim,names}=await workspace();
 const tampered=structuredClone(manifest);tampered.document.sourceCompletionSha256='f'.repeat(64);
 await assert.rejects(inspectSuccessorArtifacts({model:m,manifest:tampered,claim:c,baseline,revisions:[]},Date.parse(now)));
 const bad=structuredClone(baseline);bad.receipt.path='Projects/5107075373/Draft-Plans/draft-v3.json';
 await assert.rejects(inspectSuccessorArtifacts({model:m,manifest,claim:c,baseline:bad,revisions:[]},Date.parse(now)));
 const orphan=structuredClone(baseline);orphan.document.version=2;
 const r=await wrap(orphan.document,names.layout.drafts,'draft-v3-r000002.json');
 await assert.rejects(inspectSuccessorArtifacts({model:m,manifest,claim:c,baseline,revisions:[r]},Date.parse(now)));
});
test('V3 cannot use a predecessor session ID, or mutate protected fields',async()=>{
 const m=model();
 assert.throws(()=>makeSuccessorClaim(m,{sessionId:m.source.sessionId,createdAt:now}));
 const {claim,baseline}=await workspace();
 const d=structuredClone(baseline.document);d.version=1;
 d.history=[{revision:1,type:'edit',at:now}];d.working[0].name='Replaced protected identity';
 assert.throws(()=>makeNextSuccessorDraft(baseline.document,d,m,claim,await pilotFileSha(baseline.document)));
});
