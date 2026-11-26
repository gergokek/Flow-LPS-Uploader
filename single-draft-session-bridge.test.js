import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSingleDraftSessionBridge} from './single-draft-session-bridge.js';

const boardId='5107075373',
 nonce='11111111-1111-4111-8111-111111111111',
 sessionId='22222222-2222-4222-8222-222222222222',
 protocol='mflow-single-draft-session-v1';
const ready=(onPilotRequest=async()=>{throw Error('No pilot');})=>{
 let handler,revCalls=0,approvalCalls=0,syncCalls=0;
 const sent=[];
 const opener={postMessage:(payload,origin)=>sent.push({payload,origin})};
 const win={opener,location:{hash:'#mflow-session='+nonce+'&board='+boardId},
  addEventListener:(e,fn)=>handler=fn,removeEventListener:()=>{}};
 const bridge=attachSingleDraftSessionBridge({win,onPilotRequest,
  onSaveRevision:async({draft})=>{
   revCalls++;
   return {status:'SAVED',sessionId,revision:draft.version,
    receipt:{name:'draft-v1-r000001.json',sha256:'f'.repeat(64),
     eTag:'etag',verification:'content-sha256-and-etag'}};
  },
  onPrepareSync:async req=>{
   syncCalls++;
   return {status:'PREPARED_NO_WRITES',approvedSha256:req.expectedApprovedSha256,
    checkpoint:{name:'sync-v1-prepared.json',sha256:'c'.repeat(64),
     eTag:'sync-etag',verification:'content-sha256-and-etag'},
    mondayWrites:0,writeAuthorization:'NOT_GRANTED'};
  },
  onApprovePlan:async req=>{
   approvalCalls++;
   return {status:'APPROVED_PLAN_V1_STORED',sessionId,
    revision:req.expectedRevision,finalDraftSha256:req.expectedSha256,
    approvedPlan:{name:'approved-v1.json',sha256:'e'.repeat(64),
     eTag:'approved-etag',verification:'content-sha256-and-etag'},
    receiptSha256:'c'.repeat(64),mondayWrites:0,mondaySyncAllowed:false};
  }});
 const emit=(kind,extras={},origin='https://monday-test.example')=>
  handler({source:opener,origin,data:{protocol,nonce,boardId,kind,...extras}});
 const selected={status:'ACTIVE',boardId,sessionId,planVersion:1,revision:0,
  versionLabel:'V1',draft:{boardId,version:0,
   session:{sessionId,planVersion:1,revision:0}},
  receipt:{sha256:'a'.repeat(64),eTag:'origin',
   verification:'content-sha256-and-etag'}};
 return {bridge,emit,sent,selected,calls:()=>revCalls,approvalCalls:()=>approvalCalls,
  syncCalls:()=>syncCalls};
};
test('refuses to send DRAFT before origin-bound hello',()=>{
 const a=ready();
 assert.equal(a.bridge.selected(a.selected),false);
 assert.equal(a.bridge.ready(),false);
 a.emit('hello',{},'http://unsafe.example');
 assert.equal(a.bridge.ready(),false);
 a.emit('hello');
 assert.equal(a.bridge.ready(),true);
 assert.equal(a.bridge.selected(a.selected),true);
 assert.ok(a.sent.some(x=>x.payload.kind==='session-selected'&&
  x.origin==='https://monday-test.example'));
 a.bridge.close();
});
test('only the next revision from selected session is persisted',async()=>{
 const a=ready();a.emit('hello');assert.equal(a.bridge.selected(a.selected),true);
 await a.emit('save-revision',{requestId:'44444444-4444-4444-8444-444444444444',
  draft:{boardId,version:2,session:{sessionId,planVersion:1}}});
 assert.equal(a.calls(),0);
 await a.emit('save-revision',{requestId:'44444444-4444-4444-8444-444444444444',
  draft:{boardId,version:1,session:{sessionId,planVersion:1}}});
 assert.equal(a.calls(),1);
 assert.ok(a.sent.some(x=>x.payload.kind==='revision-saved'&&
  x.payload.revision===1));
 await a.emit('save-revision',{requestId:'55555555-5555-4555-8555-555555555555',
  draft:{boardId,version:1,session:{sessionId}}});
 assert.equal(a.calls(),1);
 a.bridge.close();
});

test('Monday V1 approval rejects stale SHA and only accepts one verified request',async()=>{
 const a=ready();a.emit('hello');assert.equal(a.bridge.selected(a.selected),true);
 const req='44444444-4444-4444-8444-444444444444';
 const boardFingerprintSha256='b'.repeat(64);
 await a.emit('approve-plan',{requestId:req,expectedSessionId:sessionId,
  expectedRevision:0,expectedSha256:'f'.repeat(64),
  boardFingerprintSha256,boardVerifiedAt:new Date().toISOString(),editorId:'96423073'});
 assert.equal(a.approvalCalls(),0);
 await a.emit('approve-plan',{requestId:req,expectedSessionId:sessionId,
  expectedRevision:0,expectedSha256:'a'.repeat(64),
  boardFingerprintSha256,boardVerifiedAt:new Date().toISOString(),editorId:'96423073'},
  'https://forged.example');
 assert.equal(a.approvalCalls(),0);
 await a.emit('approve-plan',{requestId:req,expectedSessionId:sessionId,
  expectedRevision:0,expectedSha256:'a'.repeat(64),
  boardFingerprintSha256,boardVerifiedAt:new Date().toISOString(),editorId:'96423073'});
 assert.equal(a.approvalCalls(),1);
 assert.ok(a.sent.some(x=>x.payload.kind==='approval-stored'&&
  x.payload.approvedPlan.name==='approved-v1.json'&&
  x.payload.mondayWrites===0));
 await a.emit('approve-plan',{requestId:'55555555-5555-4555-8555-555555555555',
  expectedSessionId:sessionId,expectedRevision:0,expectedSha256:'a'.repeat(64),
  boardFingerprintSha256,boardVerifiedAt:new Date().toISOString(),editorId:'96423073'});
 assert.equal(a.approvalCalls(),1);
 a.bridge.close();
});

test('frozen Approved V1 can be handed off without starting a new DRAFT session',async()=>{
 const a=ready();a.emit('hello');
 const source='d'.repeat(64),sha='b'.repeat(64);
 assert.equal(a.bridge.approvedForSync({
  status:'APPROVED_V1_VERIFIED',boardId,sessionId,planVersion:1,revision:4,
  receipt:{name:'approved-v1.json',sha256:sha,eTag:'etag',
   verification:'content-sha256-and-etag'},
  sourceDraftSha256:source,
  approvedPlan:{sourceDraft:{sha256:source}},
  mondayWrites:0,mondaySyncAllowed:false
 }),true);
 assert.equal(a.bridge.session(),null);
 assert.ok(a.sent.some(x=>x.payload.kind==='approved-sync-selected'&&
  x.payload.receipt.sha256===sha));
 const requestId='55555555-5555-4555-8555-555555555555';
 const args={requestId,expectedApprovedSha256:sha,
  expectedSessionId:sessionId,expectedRevision:4,
  boardFingerprintSha256:'f'.repeat(64),
  boardVerifiedAt:new Date().toISOString(),editorId:'96423073'};
 await a.emit('prepare-sync-checkpoint',{...args,expectedApprovedSha256:'a'.repeat(64)});
 assert.equal(a.syncCalls(),0);
 await a.emit('prepare-sync-checkpoint',args,'https://forged.example');
 assert.equal(a.syncCalls(),0);
 await a.emit('prepare-sync-checkpoint',args);
 assert.equal(a.syncCalls(),1);
 assert.ok(a.sent.some(x=>x.payload.kind==='sync-checkpoint-stored'&&
  x.payload.mondayWrites===0&&x.payload.writeAuthorization==='NOT_GRANTED'));
 await a.emit('prepare-sync-checkpoint',{...args,requestId:'66666666-6666-4666-8666-666666666666'});
 assert.equal(a.syncCalls(),1);
 a.bridge.close();
});

test('V1 pilot bridge binds source/origin, Approved SHA and request identity; blocks replay',async()=>{
 const received=[],a=ready(async r=>{received.push(r);return {status:'TEST_REPLY'};});
 a.emit('hello');const sha='b'.repeat(64),source='d'.repeat(64);
 assert.equal(a.bridge.approvedForSync({status:'APPROVED_V1_VERIFIED',boardId,sessionId,planVersion:1,revision:4,
  receipt:{name:'approved-v1.json',sha256:sha,eTag:'etag',verification:'content-sha256-and-etag'},
  sourceDraftSha256:source,approvedPlan:{sourceDraft:{sha256:source}},mondayWrites:0,mondaySyncAllowed:false}),true);
 const request={action:'ahead',payload:{taskId:'101'},requestId:'44444444-4444-4444-8444-444444444444',
  expectedApprovedSha256:sha,expectedSessionId:sessionId,expectedRevision:4};
 await a.emit('v1-pilot-request',request,'https://forged.example');assert.equal(received.length,0);
 await a.emit('v1-pilot-request',{...request,expectedApprovedSha256:'f'.repeat(64)});assert.equal(received.length,0);
 await a.emit('v1-pilot-request',request);assert.equal(received.length,1);
 assert.ok(a.sent.some(x=>x.payload.kind==='v1-pilot-response'&&x.payload.action==='ahead'));
 await a.emit('v1-pilot-request',request);assert.equal(received.length,1);
 await a.emit('v1-pilot-request',{...request,requestId:'55555555-5555-4555-8555-555555555555'});
 assert.equal(received.length,1);assert.ok(a.sent.some(x=>x.payload.kind==='v1-pilot-failed'));
 await a.emit('v1-pilot-request',{...request,action:'inspect',requestId:'66666666-6666-4666-8666-666666666666'});
 assert.equal(received.length,2);a.bridge.close();
});

test('planning-inspect passes authenticated Approved V1 bridge with no write action',async()=>{
 const received=[],a=ready(async req=>{received.push(req);
  return {action:'START_NEXT',planVersion:3,readOnly:true,mondayWrites:0};});
 a.emit('hello');const sha='b'.repeat(64),source='d'.repeat(64);
 assert.equal(a.bridge.approvedForSync({status:'APPROVED_V1_VERIFIED',
  boardId,sessionId,planVersion:1,revision:4,
  receipt:{name:'approved-v1.json',sha256:sha,eTag:'etag',
   verification:'content-sha256-and-etag'},sourceDraftSha256:source,
  approvedPlan:{sourceDraft:{sha256:source}},
  mondayWrites:0,mondaySyncAllowed:false}),true);
 const request={action:'planning-inspect',
  payload:{editorId:'96423073',boardFingerprint:'verified-board'},
  requestId:'44444444-4444-4444-8444-444444444444',
  expectedApprovedSha256:sha,expectedSessionId:sessionId,expectedRevision:4};
 await a.emit('v1-pilot-request',request,'https://forged.example');
 assert.equal(received.length,0);
 await a.emit('v1-pilot-request',{...request,expectedSessionId:nonce});
 assert.equal(received.length,0);
 await a.emit('v1-pilot-request',request);
 assert.equal(received.length,1);
 assert.ok(a.sent.some(x=>x.payload.kind==='v1-pilot-response'&&
  x.payload.action==='planning-inspect'&&
  x.payload.result.mondayWrites===0));
 await a.emit('v1-pilot-request',request);
 assert.equal(received.length,1);
 a.bridge.close();
});

test('V3 revision handoff retains planVersion and cannot invoke V1 approval handler',async()=>{
 const a=ready();a.emit('hello');
 const v3=structuredClone(a.selected);
 v3.planVersion=3;v3.versionLabel='V3';
 v3.draft.session.planVersion=3;
 assert.equal(a.bridge.selected(v3),true);
 await a.emit('approve-plan',{requestId:'44444444-4444-4444-8444-444444444444',
  expectedSessionId:sessionId,expectedRevision:0,expectedSha256:'a'.repeat(64),
  boardFingerprintSha256:'b'.repeat(64),boardVerifiedAt:new Date().toISOString(),
  editorId:'96423073'});
 assert.equal(a.approvalCalls(),0);
 await a.emit('save-revision',{requestId:'55555555-5555-4555-8555-555555555555',
  draft:{boardId,version:1,session:{sessionId,planVersion:1}}});
 assert.equal(a.calls(),0);
 await a.emit('save-revision',{requestId:'66666666-6666-4666-8666-666666666666',
  draft:{boardId,version:1,session:{sessionId,planVersion:3}}});
 assert.equal(a.calls(),1);
 assert.ok(a.sent.some(x=>x.payload.kind==='revision-saved'&&
  x.payload.revision===1));
 a.bridge.close();
});
