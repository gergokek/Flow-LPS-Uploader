import test from 'node:test';
import assert from 'node:assert/strict';
import {attachDraftHandoff} from '../draft-handoff-receiver.js';
const nonce='11111111-2222-4333-8444-555555555555';
const protocol='flow-lps-draft-handoff-v1';
const boardId='5107075373',hash='a'.repeat(64),bytes=1234;
function fixture(hashUrl='#draft-handoff='+nonce){
 const listeners=new Map(),posts=[],opener={postMessage:(data,origin)=>posts.push({data,origin})};
 const win={location:{hash:hashUrl},opener,addEventListener:(n,h)=>listeners.set(n,h),
  removeEventListener:(n,h)=>{if(listeners.get(n)===h)listeners.delete(n);}};
 return {win,opener,posts,send:async event=>listeners.get('message')?.(event),active:()=>listeners.has('message')};
}
const valid=()=>({boardId,version:5,sha256:hash,bytes});
const save=extra=>({boardId,version:5,sha256:hash,bytes,verification:'content-sha256-and-etag',
 name:'draft-v5-abcdefgh-12345678.json',itemId:'sp-id',eTag:'etag-v1',...extra});
const transferred=(f,source=f.opener,origin='https://monday.example.com')=>({
 source,origin,data:{protocol,kind:'draft',nonce,boardId,content:'some DRAFT json'}
});
test('receiver acknowledges validated DRAFT, later sends verified receipt to opener origin',async()=>{
 const f=fixture(),received=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async x=>{received.push(x);return valid();}});
 assert.equal(receiver.active,true);
 assert.deepEqual(f.posts[0],{data:{protocol,kind:'ready',nonce},origin:'*'});
 await f.send(transferred(f,{}));
 assert.equal(received.length,0);
 await f.send({...transferred(f),data:{protocol,kind:'draft',nonce:'wrong',boardId,content:'test'}});
 assert.equal(received.length,0);
 await f.send(transferred(f));
 assert.deepEqual(received,[{content:'some DRAFT json',boardId,sourceOrigin:'https://monday.example.com'}]);
 assert.deepEqual(f.posts.at(-1).data,{protocol,kind:'received',nonce,version:5,sha256:hash});
 assert.equal(receiver.publishVerifiedReceipt(save()),true);
 assert.equal(f.posts.at(-1).data.kind,'verified');
 assert.equal(f.posts.at(-1).origin,'https://monday.example.com');
 assert.deepEqual(f.posts.at(-1).data.receipt,{...save(),isApprovedPlan:false,mondaySyncAllowed:false});
 assert.equal(receiver.publishVerifiedReceipt(save()),false);
 assert.equal(f.active(),true); // Session remains open for opted-in later revisions.
 receiver.close();
 assert.equal(f.active(),false);
});
test('receipt refused for wrong board, revision, hash, bytes or unverified upload',async()=>{
 for(const override of [{boardId:'2'},{version:4},{sha256:'0'.repeat(64)},{bytes:1235},
  {verification:'metadata-only'},{name:'draft-v4-abcdefgh-12345678.json'},{eTag:''},{itemId:''}]){
  const f=fixture(),receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid()});
  await f.send(transferred(f));
  assert.equal(receiver.publishVerifiedReceipt(save(override)),false,JSON.stringify(override));
  assert.equal(f.posts.filter(p=>p.data.kind==='verified').length,0);
  receiver.close();
 }
});
test('invalid source or DRAFT validation failure never sends ACK or receipt',async()=>{
 const f=fixture(),receiver=attachDraftHandoff({win:f.win,onDraft:async()=>{throw Error('bad draft');}});
 await f.send(transferred(f));
 assert.equal(f.posts.length,1);
 assert.equal(receiver.publishVerifiedReceipt(save()),false);
 const absent=fixture('#draft-handoff=wrong');
 assert.equal(attachDraftHandoff({win:absent.win,onDraft:async()=>valid()}).active,false);
});

test('receiver can accept newer revision and will not report an old verified result',async()=>{
 const f=fixture(),queued=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid(),
  onRevision:async({boardId})=>({boardId,version:6,sha256:'b'.repeat(64),bytes:2000}),
  onAcceptedRevision:x=>queued.push(x.version)});
 await f.send(transferred(f));
 await f.send({source:f.opener,origin:'https://monday.example.com',data:{
  protocol,kind:'revision',nonce,boardId,content:'new draft'}});
 assert.deepEqual(queued,[6]);
 assert.deepEqual(f.posts.at(-1).data,{protocol,kind:'received',nonce,version:6,sha256:'b'.repeat(64)});
 assert.equal(receiver.publishVerifiedReceipt(save()),false);
 assert.equal(receiver.publishVerifiedReceipt(save({version:6,sha256:'b'.repeat(64),bytes:2000,
  name:'draft-v6-abcdefgh-12345678.json'})),true);
 assert.equal(f.posts.at(-1).data.receipt.version,6);
 receiver.close();
});

test('review-only finalization intent needs current content-verified save and matching opener',async()=>{
 const f=fixture(),approved=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid(),
  onFinalizationIntent:async({boardId,intent})=>{approved.push({boardId,intent});return true;}});
 const intent={schemaVersion:1,format:'flow-lps-draft-finalization-intent',
  status:'INTENT_ONLY',boardId,version:5,sha256:hash,bytes,
  editorId:'96423073',confirmedAt:new Date().toISOString(),
  isApprovedPlan:false,mondaySyncAllowed:false,approvalEligible:false};
 const event=(override={},origin='https://monday.example.com')=>({
  source:f.opener,origin,data:{protocol,kind:'finalization-intent',nonce,boardId,
   intent:{...intent,...override}}
 });
 await f.send(transferred(f));
 await f.send(event());
 assert.equal(approved.length,0);
 assert.equal(receiver.publishVerifiedReceipt(save()),true);
 await f.send(event({sha256:'0'.repeat(64)}));
 await f.send(event({isApprovedPlan:true}));
 await f.send(event({},'https://attacker.example'));
 assert.equal(approved.length,0);
 await f.send(event());
 assert.equal(approved.length,1);
 assert.deepEqual(f.posts.at(-1).data,{
  protocol,kind:'finalization-intent-received',nonce,boardId,
  version:5,sha256:hash,status:'REVIEW_INTENT_ONLY'
 });
 await f.send(event());
 assert.equal(approved.length,1);
 receiver.close();
});
test('a failed review callback yields no confirmation, and old intents do not survive new revisions',async()=>{
 const f=fixture(),requested=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid(),
  onRevision:async()=>({boardId,version:6,sha256:'b'.repeat(64),bytes:2000}),
  onFinalizationIntent:async ({intent})=>{requested.push(intent.version);return false;}});
 await f.send(transferred(f));
 receiver.publishVerifiedReceipt(save());
 const intent={schemaVersion:1,format:'flow-lps-draft-finalization-intent',
  status:'INTENT_ONLY',boardId,version:5,sha256:hash,bytes,
  editorId:'96423073',confirmedAt:new Date().toISOString(),
  isApprovedPlan:false,mondaySyncAllowed:false,approvalEligible:false};
 const event=x=>({source:f.opener,origin:'https://monday.example.com',
  data:{protocol,kind:'finalization-intent',nonce,boardId,intent:x}});
 await f.send(event(intent));
 assert.deepEqual(requested,[5]);
 assert.equal(f.posts.at(-1).data.kind,'verified');
 await f.send({source:f.opener,origin:'https://monday.example.com',data:{
  protocol,kind:'revision',nonce,boardId,content:'new draft'
 }});
 await f.send(event(intent));
 assert.deepEqual(requested,[5]);
 receiver.close();
});

test('verified Approved Plan may be sent only after current DRAFT finalization intent, with no writes',async()=>{
 const f=fixture();
 const receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid(),
  onFinalizationIntent:async()=>true});
 const name='approved-v5-'+hash.slice(0,24)+'.json';
 const approvedPlan={
  schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',
  isApprovedPlan:true,mondaySyncAllowed:false,boardId,draftVersion:5,
  sourceDraft:{sha256:hash},plan:{base:{id:boardId,tasks:[]},working:[],history:[]}
 };
 const result={status:'APPROVED_PLAN_STORED',boardId,version:5,
  sourceDraftSha256:hash,verification:'content-sha256-and-etag',
  sha256:'b'.repeat(64),name,id:'approved-id',eTag:'approved-etag',
  path:'Projects/'+boardId+'/Approved-Plans/'+name,
  mondaySyncAllowed:false,approvedPlan};
 assert.equal(receiver.publishApprovedSyncPreview(result),false);
 await f.send(transferred(f));
 assert.equal(receiver.publishApprovedSyncPreview(result),false);
 assert.equal(receiver.publishVerifiedReceipt(save()),true);
 assert.equal(receiver.publishApprovedSyncPreview(result),false);
 const intent={schemaVersion:1,format:'flow-lps-draft-finalization-intent',
  status:'INTENT_ONLY',boardId,version:5,sha256:hash,bytes,
  editorId:'96423073',confirmedAt:new Date().toISOString(),
  isApprovedPlan:false,mondaySyncAllowed:false,approvalEligible:false};
 await f.send({source:f.opener,origin:'https://monday.example.com',data:{
  protocol,kind:'finalization-intent',nonce,boardId,intent
 }});
 assert.equal(receiver.publishApprovedSyncPreview({...result,sourceDraftSha256:'c'.repeat(64)}),false);
 assert.equal(receiver.publishApprovedSyncPreview({...result,approvedPlan:{...approvedPlan,mondaySyncAllowed:true}}),false);
 assert.equal(receiver.publishApprovedSyncPreview(result),true);
 const sent=f.posts.at(-1);
 assert.equal(sent.data.kind,'approved-sync-dry-run');
 assert.equal(sent.origin,'https://monday.example.com');
 assert.equal(sent.data.receipt.mondaySyncAllowed,false);
 assert.equal(sent.data.receipt.sha256,'b'.repeat(64));
 assert.equal(sent.data.approvedPlan.status,'APPROVED');
 receiver.close();
 assert.equal(receiver.publishApprovedSyncPreview(result),false);
});

test('Monday read-only dry-run acknowledgement can prepare one checkpoint, never approve writes',async()=>{
 const f=fixture(),reports=[],aheadRequests=[],resultRequests=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid(),
  onFinalizationIntent:async()=>true,
  onSyncDryRunVerified:x=>reports.push(x),
  onPilotAheadRequested:x=>aheadRequests.push(x),
  onPilotResultRequested:x=>resultRequests.push(x)});
 await f.send(transferred(f));
 receiver.publishVerifiedReceipt(save());
 const intent={schemaVersion:1,format:'flow-lps-draft-finalization-intent',
  status:'INTENT_ONLY',boardId,version:5,sha256:hash,bytes,
  editorId:'96423073',confirmedAt:new Date().toISOString(),
  isApprovedPlan:false,mondaySyncAllowed:false,approvalEligible:false};
 await f.send({source:f.opener,origin:'https://monday.example.com',
  data:{protocol,kind:'finalization-intent',nonce,boardId,intent}});
 const name='approved-v5-'+hash.slice(0,24)+'.json',approvedHash='b'.repeat(64);
 const result={status:'APPROVED_PLAN_STORED',boardId,version:5,sha256:approvedHash,
  sourceDraftSha256:hash,verification:'content-sha256-and-etag',
  name,id:'approved-item',eTag:'approved-etag',
  path:'Projects/'+boardId+'/Approved-Plans/'+name,mondaySyncAllowed:false,
  approvedPlan:{schemaVersion:1,format:'flow-lps-approved-plan',
   status:'APPROVED',isApprovedPlan:true,mondaySyncAllowed:false,
   boardId,draftVersion:5,sourceDraft:{sha256:hash},
   plan:{base:{tasks:[{id:'101',note:'old'}]},working:[{id:'101',note:'changed'}]}}};
 assert.equal(receiver.publishApprovedSyncPreview(result),true);
 assert.equal(receiver.publishApprovedSyncPreview(result),false);
 const report={schemaVersion:1,format:'flow-lps-sync-preparation-report',
  status:'BOARD_PRECHECK_ONLY',boardId,draftVersion:5,
  sourceDraftSha256:hash,approvedPlanSha256:approvedHash,
  approvedFile:name,approvedETag:'approved-etag',
  sourceFingerprint:'{"id":"5107075373","tasks":[]}',
  editorId:'96423073',checkedAt:new Date().toISOString(),
  totalTasks:193,changedTasks:193,fieldChanges:434,
  fieldCounts:[{field:'forecast',tasks:193},{field:'endWeek',tasks:193},
   {field:'critical',tasks:48}],
  checks:{currentMondaySnapshot:'matched',columnEncoding:'passed'},
  mondaySyncAllowed:false,mondayWritten:false,mutationCount:0};
 const evt=(r,origin='https://monday.example.com')=>({
  source:f.opener,origin,data:{protocol,kind:'sync-dry-run-verified',
   nonce,boardId,report:r}});
 await f.send(evt(report,'https://attacker.example.com'));
 await f.send(evt({...report,mondayWritten:true}));
 await f.send(evt({...report,approvedETag:'replaced'}));
 await f.send(evt({...report,fieldChanges:435}));
 assert.equal(reports.length,0);
 await f.send(evt(report));
 assert.equal(reports.length,1);
 assert.equal(reports[0].approvedSha256,approvedHash);
 assert.equal(reports[0].report.mutationCount,0);
 await f.send(evt(report));
 assert.equal(reports.length,1);
 const cpName='sync-prepared-v5-'+approvedHash.slice(0,24)+'.json';
 const checkpoint={schemaVersion:1,format:'flow-lps-sync-checkpoint',
  status:'PREPARED_NO_WRITES',boardId,
  mondaySourceFingerprint:report.sourceFingerprint,
  approvedPlan:{sha256:approvedHash,name,eTag:'approved-etag'},
  writeAuthorization:'NOT_GRANTED',mondaySyncAllowed:false,mondayWritten:false,
  progress:{cursor:0,mondayWrites:0,inFlight:null,verifiedTaskIds:[]}};
 const cpResult={status:'CHECKPOINT_PREPARED',boardId,draftVersion:5,
  approvedPlanSha256:approvedHash,verification:'content-sha256-and-etag',
  id:'cp-id',eTag:'cp-etag',sha256:'c'.repeat(64),
  name:cpName,path:'Projects/'+boardId+'/Sync-Status/'+cpName,
  mondayWrites:0,mondaySyncAllowed:false,checkpoint};
 assert.equal(receiver.publishVerifiedCheckpoint({...cpResult,
  checkpoint:{...checkpoint,writeAuthorization:'GRANTED'}},result),false);
 assert.equal(receiver.publishVerifiedCheckpoint(cpResult,result),true);
 assert.equal(f.posts.at(-1).data.kind,'sync-checkpoint-preview');
 assert.equal(f.posts.at(-1).data.checkpoint.status,'PREPARED_NO_WRITES');
 assert.equal(receiver.publishVerifiedCheckpoint(cpResult,result),false);
 const pilotRequestId='22222222-2222-4222-8222-222222222222';
 const entry={schemaVersion:1,format:'flow-lps-single-task-write-ahead',
  status:'WRITE_AHEAD',boardId,taskId:'101',approvedSha256:approvedHash,
  checkpointSha256:cpResult.sha256,sourceFingerprint:report.sourceFingerprint,
  fieldNames:['note'],checkedAt:new Date().toISOString(),
  maximumMondayWrites:1,actualMondayWrites:0};
 const pilotEvent=(kind,e,origin='https://monday.example.com')=>({
  source:f.opener,origin,data:{protocol,kind,nonce,boardId,
   requestId:pilotRequestId,entry:e}});
 await f.send(pilotEvent('pilot-write-ahead-request',entry,'https://attacker.example'));
 await f.send(pilotEvent('pilot-write-ahead-request',{...entry,checkpointSha256:'d'.repeat(64)}));
 assert.equal(aheadRequests.length,0);
 await f.send(pilotEvent('pilot-write-ahead-request',entry));
 assert.equal(aheadRequests.length,1);
 const aheadReceipt={status:'WRITE_AHEAD_VERIFIED',boardId,taskId:'101',
  approvedSha256:approvedHash,checkpointSha256:cpResult.sha256,
  verification:'content-sha256-and-etag',mondayWriteLimit:1,
  sha256:'d'.repeat(64),id:'sp-ahead',eTag:'etag-ahead'};
 assert.equal(receiver.publishPilotAhead({...aheadReceipt,taskId:'999'},pilotRequestId),false);
 assert.equal(receiver.publishPilotAhead(aheadReceipt,pilotRequestId),true);
 assert.equal(f.posts.at(-1).data.kind,'pilot-write-ahead-verified');
 assert.equal(receiver.publishPilotAhead(aheadReceipt,pilotRequestId),false);
 const resultEntry={schemaVersion:1,format:'flow-lps-single-task-result',
  status:'ITEM_READBACK_VERIFIED',boardId,taskId:'101',approvedSha256:approvedHash,
  checkpointSha256:cpResult.sha256,writeAheadSha256:aheadReceipt.sha256,
  mondayWritesAttempted:1,readbackMatches:true};
 await f.send(pilotEvent('pilot-result-request',{...resultEntry,writeAheadSha256:'bad'}));
 assert.equal(resultRequests.length,0);
 await f.send(pilotEvent('pilot-result-request',resultEntry));
 assert.equal(resultRequests.length,1);
 const resultReceipt={...aheadReceipt,status:'ITEM_RESULT_VERIFIED',
  sha256:'e'.repeat(64),id:'sp-result',eTag:'etag-result'};
 assert.equal(receiver.publishPilotResult(resultReceipt,pilotRequestId),true);
 assert.equal(f.posts.at(-1).data.kind,'pilot-result-verified');
 await f.send(pilotEvent('pilot-write-ahead-request',entry));
 assert.equal(aheadRequests.length,1);
 receiver.close();
});
