import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSingleTaskJournalControl} from '../pilot-journal-ui.js';

const boardId='5107075373',sha='a'.repeat(64),approvedSha='b'.repeat(64),
 cpSha='c'.repeat(64),requestId='11111111-1111-4111-8111-111111111111';
const entry={schemaVersion:1,format:'flow-lps-single-task-write-ahead',
 status:'WRITE_AHEAD',boardId,taskId:'101',
 approvedSha256:approvedSha,checkpointSha256:cpSha,
 sourceFingerprint:'expected fingerprint',fieldNames:['note'],
 checkedAt:new Date().toISOString(),maximumMondayWrites:1,actualMondayWrites:0};
const ahead={status:'WRITE_AHEAD_VERIFIED',boardId,taskId:'101',
 approvedSha256:approvedSha,checkpointSha256:cpSha,
 sha256:'d'.repeat(64),id:'ahead-id',eTag:'etag-ahead',
 verification:'content-sha256-and-etag',mondayWriteLimit:1};
const journalResult={...ahead,status:'ITEM_RESULT_VERIFIED',
 sha256:'e'.repeat(64),id:'result-id',eTag:'etag-result'};
const resultEntry={schemaVersion:1,format:'flow-lps-single-task-result',
 status:'ITEM_READBACK_VERIFIED',boardId,taskId:'101',
 approvedSha256:approvedSha,checkpointSha256:cpSha,
 writeAheadSha256:ahead.sha256,mondayWritesAttempted:1,
 readbackMatches:true};
function fixture({ask=()=>true,makeJournal,token=async()=> 'token'}={}){
 const events={},button={disabled:true,addEventListener:(key,fn)=>events[key]=fn};
 const output={textContent:''},saved=[];
 const current={boardId,
  account:{homeAccountId:'home-A',tenantId:'tenant-A'},
  saved:{version:8,sha256:sha},validated:{version:8,sha256:sha},
  approved:{status:'APPROVED_PLAN_STORED',boardId,
   version:8,sourceDraftSha256:sha,sha256:approvedSha,
   approvedPlan:{boardId,plan:{base:{tasks:[{id:'101',note:'old'}]},
    working:[{id:'101',note:'new'}]}}},
  checkpoint:{status:'CHECKPOINT_PREPARED',sha256:cpSha,
   approvedPlanSha256:approvedSha,mondayWrites:0,mondaySyncAllowed:false,
   checkpoint:{mondaySourceFingerprint:entry.sourceFingerprint}}
 };
 const calls={ahead:[],result:[],publishedAhead:[],publishedResult:[]};
 const create=makeJournal||(()=>({
  recordAhead:async args=>{calls.ahead.push(args);return ahead;},
  recordResult:async args=>{calls.result.push(args);return journalResult;}
 }));
 const controller=mountSingleTaskJournalControl({
  button,output,getCurrent:()=>current,getAccessToken:token,confirm:ask,
  driveId:'b!testdrive',makeJournal:create,
  onAheadVerified:(proof,id)=>{calls.publishedAhead.push({proof,id});return true;},
  onResultVerified:(proof,id)=>{calls.publishedResult.push({proof,id});return true;}
 });
 return {controller,output,button,current,calls,click:()=>events.click(),saved};
}
test('two-phase pilot: no file before click, then one ahead and one result',async()=>{
 const f=fixture();
 assert.equal(f.controller.acceptAhead({entry,requestId}),true);
 assert.equal(f.calls.ahead.length,0);
 assert.equal(f.button.disabled,false);
 await f.click();
 assert.equal(f.controller.status(),'AHEAD_CONFIRMED');
 assert.equal(f.calls.ahead.length,1);
 assert.equal(f.calls.publishedAhead.length,1);
 assert.equal(f.calls.publishedAhead[0].id,requestId);
 assert.equal(f.button.disabled,true);
 assert.equal(await f.controller.acceptResult({entry:resultEntry,requestId,aheadReceipt:ahead}),true);
 assert.equal(f.controller.status(),'DONE');
 assert.equal(f.calls.result.length,1);
 assert.equal(f.calls.publishedResult.length,1);
 assert.match(f.output.textContent,/Nincs automatikus folytatás/);
 assert.equal(f.controller.acceptAhead({entry,requestId}),false);
});
test('declined Uploader confirmation does not acquire a token or persist ahead',async()=>{
 let approved=false,requests=0;
 const f=fixture({ask:()=>approved,token:async()=>{requests++;return 'token';}});
 assert.equal(f.controller.acceptAhead({entry,requestId}),true);
 await f.click();
 assert.equal(requests,0);
 assert.equal(f.calls.ahead.length,0);
 approved=true;
 await f.click();
 assert.equal(requests,1);
 assert.equal(f.calls.ahead.length,1);
});
test('changed account and forged source prevent journal creation',async()=>{
 const f=fixture();
 assert.equal(f.controller.acceptAhead({entry:{...entry,checkpointSha256:'x'},requestId}),false);
 assert.equal(f.controller.acceptAhead({entry,requestId}),true);
 f.current.account={homeAccountId:'home-B',tenantId:'tenant-A'};
 await f.click();
 assert.equal(f.calls.ahead.length,0);
 assert.equal(f.button.disabled,true);
});
test('SharePoint ahead uncertainty forbids all repeats and result submissions',async()=>{
 let attempt=0;
 const f=fixture({makeJournal:()=>({
  recordAhead:async()=>{attempt++;throw Error('Graph upload timeout');},
  recordResult:async()=>{throw Error('never');}
 })});
 f.controller.acceptAhead({entry,requestId});
 await f.click();
 assert.equal(attempt,1);
 assert.equal(f.controller.status(),'STOPPED');
 await f.click();
 assert.equal(attempt,1);
 assert.equal(await f.controller.acceptResult({entry:resultEntry,requestId,aheadReceipt:ahead}),false);
 assert.match(f.output.textContent,/Tilos az automatikus újraküldés/);
});
test('failed result journal preserves one ahead and requires manual reconciliation',async()=>{
 let attempts=0;
 const f=fixture({makeJournal:()=>({
  recordAhead:async()=>ahead,
  recordResult:async()=>{attempts++;throw Error('Graph result timeout');}
 })});
 f.controller.acceptAhead({entry,requestId});
 await f.click();
 assert.equal(await f.controller.acceptResult({entry:resultEntry,requestId,aheadReceipt:ahead}),false);
 assert.equal(attempts,1);
 assert.equal(f.controller.status(),'STOPPED');
 assert.equal(await f.controller.acceptResult({entry:resultEntry,requestId,aheadReceipt:ahead}),false);
 assert.equal(attempts,1);
});
