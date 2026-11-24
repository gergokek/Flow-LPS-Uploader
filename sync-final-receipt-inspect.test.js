import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStoredFinalSyncReceipt} from './sync-final-receipt-inspect.js';

const boardId='5107075373',approvedSha='a'.repeat(64),cpSha='b'.repeat(64),
 ledgerSha='c'.repeat(64),pilotSha='d'.repeat(64),boardSha='e'.repeat(64),
 driveId='b!dummy',sourceFingerprint='approved-plan-fingerprint';
const now=new Date().toISOString();
function setup({missing=false,alter=null,wrongEtag=false}={}){
 const value={schemaVersion:1,format:'flow-lps-sync-final-receipt',
  status:'SYNC_FINALIZED_TEST',boardId,
  approvedPlanSha256:approvedSha,checkpointSha256:cpSha,
  sourceFingerprint,verifiedPilotTaskId:'101',
  pilotResultSha256:pilotSha,ledgerEvidenceSha256:ledgerSha,
  boardFingerprint:boardSha,totalChangedTasks:12,
  verifiedBatchTaskCount:11,remainingTaskCount:0,
  ledgerInspectedAt:now,boardVerifiedAt:now,finalizedAt:now,
  mondayWritesByFinalization:0,mondaySyncAllowed:false,
  automaticallyRetryable:false};
 alter?.(value);
 const content=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
 const filename='sync-final-'+approvedSha.slice(0,24)+'.json';
 const metadata=(etag='etag')=>({id:'file-id',name:filename,eTag:etag,
  file:{mimeType:'application/json'},size:content.byteLength,
  parentReference:{driveId}});
 let reads=0,writes=0,metaCount=0;
 const fetcher=async(url,options={})=>{
  if((options.method||'GET')!=='GET'){writes++;throw Error('Read-only inspection must never write.');}
  reads++;const u=String(url);
  if(u.includes('/root:/')){
   if(missing)return new Response('',{status:404});
   metaCount++;return new Response(JSON.stringify(metadata(
    wrongEtag&&metaCount>1?'changed':'etag')),{status:200});
  }
  if(u.includes('/items/file-id'))
   return new Response(JSON.stringify({...metadata(),
    '@microsoft.graph.downloadUrl':'https://tenant.sharepoint.com/download'}),{status:200});
  if(u.includes('tenant.sharepoint.com/download'))
   return new Response(content,{status:200});
  throw Error('Unexpected fetch '+u);
 };
 const args={boardId,driveId,
  approvedReceipt:{status:'APPROVED_PLAN_STORED',boardId,sha256:approvedSha,
   approvedPlan:{sourceFingerprint}},
  checkpointReceipt:{status:'CHECKPOINT_PREPARED',boardId,
   sha256:cpSha,approvedPlanSha256:approvedSha},
  pilotReport:{status:'RESULT_VERIFIED',result:{taskId:'101',
   status:'ITEM_READBACK_VERIFIED',sha256:pilotSha}},
  batchReport:{status:'ALL_VERIFIED',approvedPlanSha256:approvedSha,
   checkpointSha256:cpSha,remainingTaskCount:0,
   evidenceSha256:ledgerSha,verifiedBatchCount:11},
  getAccessToken:async()=> 'token',assertCurrent:()=>true,fetcher};
 return {args,stats:()=>({reads,writes})};
}
test('reopened SharePoint final receipt is verified without Monday write',async()=>{
 const f=setup(),res=await inspectStoredFinalSyncReceipt(f.args);
 assert.equal(res.status,'HISTORICAL_FINAL_RECEIPT_VERIFIED');
 assert.equal(res.currentMondayBoardVerified,false);
 assert.match(res.sha256,/^[a-f0-9]{64}$/);
 assert.equal(f.stats().writes,0);
});
test('missing final receipt is reported, never re-created',async()=>{
 const f=setup({missing:true}),res=await inspectStoredFinalSyncReceipt(f.args);
 assert.equal(res.status,'FINAL_RECEIPT_NOT_FOUND');
 assert.equal(f.stats().writes,0);
});
test('tampered final receipt or changed SharePoint eTag blocks historical proof',async()=>{
 for(const variant of [
  {alter:v=>v.ledgerEvidenceSha256='0'.repeat(64)},
  {alter:v=>v.mondayWritesByFinalization=1},
  {alter:v=>v.boardFingerprint='bad'},
  {wrongEtag:true}
 ]){
  const f=setup(variant);
  await assert.rejects(inspectStoredFinalSyncReceipt(f.args));
  assert.equal(f.stats().writes,0);
 }
});
