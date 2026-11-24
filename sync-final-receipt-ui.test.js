import test from 'node:test';
import assert from 'node:assert/strict';
import {mountFinalSyncReceiptAction} from './sync-final-receipt-ui.js';

const boardId='5107075373',sha='a'.repeat(64),
 cp='b'.repeat(64),ledger='c'.repeat(64),fingerprint='d'.repeat(64),
 account={homeAccountId:'home-1',tenantId:'tenant-1'};
const requestId='a0e112a2-2ff4-4ac3-9c35-6e98bce22111';
function setup({confirmed=true}={}){
 let handler=null,saveCalls=0,confirmedCalls=0,stored=0,current={
  boardId,account,
  approved:{status:'APPROVED_PLAN_STORED',sha256:sha,approvedPlan:{
   sourceFingerprint:'source-1'}},
  checkpoint:{status:'CHECKPOINT_PREPARED',sha256:cp,checkpoint:{
   mondayPreflight:{editorIdClaim:'96423073'}}},
  recovery:{status:'RESULT_VERIFIED',result:{taskId:'101'}},
  batchLedger:{status:'ALL_VERIFIED',evidenceSha256:ledger,
   verifiedBatchCount:11,remainingTaskCount:0,canPrepareNextBatch:false}
 };
 const intent={schemaVersion:1,format:'flow-lps-sync-final-intent',
  status:'REQUEST_ONLY',boardId,approvedPlanSha256:sha,
  checkpointSha256:cp,sourceFingerprint:'source-1',verifiedPilotTaskId:'101',
  editorId:'96423073',ledgerEvidenceSha256:ledger,
  changedTaskCount:12,boardFingerprint:fingerprint};
 const button={disabled:true,addEventListener:(name,fn)=>{
  if(name==='click')handler=fn;}};
 const output={textContent:''};
 const mounted=mountFinalSyncReceiptAction({button,output,driveId:'b!dummy',
  tenantId:'tenant-1',getCurrent:()=>current,
  getAccessToken:async()=> 'test-token',
  confirm:()=>{confirmedCalls++;return confirmed;},
  requestLiveClosure:async()=>({status:'ALL_VERIFIED_CLOSURE_PREVIEW'}),
  save:async()=>{saveCalls++;return {status:'SYNC_FINAL_RECEIPT_STORED',
   boardId,name:'sync-final-'+sha.slice(0,24)+'.json',sha256:sha,eTag:'test'};},
  onStored:()=>{stored++;return true}});
 return {mounted,button,output,intent,requestId,
  click:async()=>handler(),getCurrent:()=>current,
  stats:()=>({saveCalls,confirmedCalls,stored})};
}
test('handoff does not create final receipt without explicit Uploader consent',async()=>{
 const x=setup({confirmed:false});
 assert.equal(x.mounted.receive({requestId:x.requestId,intent:x.intent}),true);
 assert.equal(x.button.disabled,false);
 await x.click();
 assert.equal(x.stats().saveCalls,0);
 assert.equal(x.stats().confirmedCalls,1);
});
test('single confirmed Uploader click consumes request, cannot repeat',async()=>{
 const x=setup();
 assert.equal(x.mounted.receive({requestId:x.requestId,intent:x.intent}),true);
 await x.click();await x.click();
 assert.equal(x.stats().saveCalls,1);
 assert.equal(x.stats().stored,1);
 assert.equal(x.button.disabled,true);
 assert.equal(x.mounted.receive({requestId:x.requestId,intent:x.intent}),false);
});
test('an edited plan, account, or ledger cannot obtain consent',async()=>{
 for(const alter of [
  x=>x.batchLedger.evidenceSha256='0'.repeat(64),
  x=>x.approved.sha256='f'.repeat(64),
  x=>x.checkpoint.checkpoint.mondayPreflight.editorIdClaim='000',
  x=>x.account={...x.account,homeAccountId:'other'}
 ]){
  const x=setup(),c=x.getCurrent();alter(c);
  assert.equal(x.mounted.receive({requestId:x.requestId,intent:x.intent}),
   x.getCurrent().account.homeAccountId==='other'?true:false);
  // An account with a different identity may establish a fresh request, but
  // once accepted, a changed account must invalidate that request.
  if(x.button.disabled===false){
   c.account.homeAccountId='different';
   await x.click();
  }
  assert.equal(x.stats().saveCalls,0);
 }
});
