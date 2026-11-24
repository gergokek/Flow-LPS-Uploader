import test from 'node:test';
import assert from 'node:assert/strict';
import {saveFinalSyncReceipt,finalReceiptName} from './sync-final-receipt-save.js';

const boardId='5107075373',approvedSha='a'.repeat(64),cpSha='b'.repeat(64),
 ledgerSha='c'.repeat(64),pilotSha='d'.repeat(64),fingerprintSha='e'.repeat(64),
 userId='de3f74bd-0fd9-40e3-aa11-f543d1a11111',
 driveId='b!dummy-Drive1',tenantId='fdf44c5d-a30f-4b0c-871a-4f9d08c11111';
const folder='Projects/'+boardId+'/Sync-Status/';
const ok=value=>new Response(JSON.stringify(value),{status:200,
 headers:{'Content-Type':'application/json'}});
const fixture=({existing=false,corrupt=false,uploadError=false}={})=>{
 const approvedPlan={format:'flow-lps-approved-plan',boardId,
  sourceFingerprint:'snapshot-'+approvedSha,
  finalization:{microsoftEntraObjectId:userId}};
 const approvedReceipt={status:'APPROVED_PLAN_STORED',boardId,
  sha256:approvedSha,mondaySyncAllowed:false,approvedPlan};
 const checkpointReceipt={status:'CHECKPOINT_PREPARED',boardId,
  sha256:cpSha,approvedPlanSha256:approvedSha,mondayWrites:0,
  mondaySyncAllowed:false};
 const pilotReport={status:'RESULT_VERIFIED',boardId,
  approvedPlanSha256:approvedSha,checkpointSha256:cpSha,
  result:{status:'ITEM_READBACK_VERIFIED',taskId:'101',readbackMatches:true,
   sha256:pilotSha}};
 const inspectedAt=new Date().toISOString();
 const ledger={status:'ALL_VERIFIED',boardId,
  approvedPlanSha256:approvedSha,checkpointSha256:cpSha,
  verifiedPilotTaskId:'101',evidenceSha256:ledgerSha,
  inspectedWithWrites:0,automaticallyResume:false,
  remainingTaskCount:0,canPrepareNextBatch:false,
  verifiedBatchCount:11,totalPendingBatchTasks:11,inspectedAt};
 const closure={schemaVersion:1,format:'flow-lps-test-sync-closure-preview',
  status:'ALL_VERIFIED_CLOSURE_PREVIEW',boardId,
  approvedPlanSha256:approvedSha,checkpointSha256:cpSha,
  sourceFingerprint:approvedPlan.sourceFingerprint,
  pilotTaskId:'101',pilotResultSha256:pilotSha,
  ledgerEvidenceSha256:ledgerSha,verifiedBatchTaskCount:11,
  changedTaskCount:12,remainingTaskCount:0,
  boardFingerprint:fingerprintSha,inspectedAt,
  readOnly:true,mutationAllowed:false,mondayWritesPerformed:0,
  automaticallyResume:false,closureReceiptStored:false,finalized:false};
 let body=null,mutationCount=0,readCount=0;
 const filename=finalReceiptName(approvedSha);
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const metadata=()=>({id:'final-file-id',name:filename,
  size:body.byteLength,file:{mimeType:'application/json'},eTag:'etag-final',
  parentReference:{driveId}});
 const fetcher=async(url,opts={})=>{
  const u=String(url),method=opts.method||'GET';
  if(u.startsWith(root+'/root:/')&&u.includes(encodeURIComponent(filename))&&
     method==='GET'){
   if(!body)return new Response('',{status:existing?200:404});
   return ok(metadata());
  }
  if(u.startsWith(root+'/root:/')&&u.includes('Sync-Status')&&method==='GET')
   return ok({id:'sync-folder',name:'Sync-Status',folder:{},
    parentReference:{driveId}});
  if(u.includes('/createUploadSession')&&method==='POST')
   return ok({uploadUrl:'https://uploads.tenant.sharepoint.com/up',
    expirationDateTime:new Date(Date.now()+600000).toISOString()});
  if(u.startsWith('https://uploads.tenant.sharepoint.com/')&&method==='PUT'){
   mutationCount++;
   body=new Uint8Array(opts.body);
   if(uploadError)throw Error('network failed after write');
   return new Response(JSON.stringify(metadata()),{status:201,
    headers:{'Content-Type':'application/json'}});
  }
  if(u.startsWith(root+'/items/final-file-id')&&method==='GET')
   return ok({...metadata(),
    '@microsoft.graph.downloadUrl':'https://dl.tenant.sharepoint.com/final'});
  if(u.startsWith('https://dl.tenant.sharepoint.com/')&&method==='GET'){
   readCount++;
   const output=corrupt?new Uint8Array([1,2,3]):body;
   return new Response(output,{status:200});
  }
  throw Error('Unexpected Graph request: '+method+' '+u);
 };
 const args={boardId,driveId,approvedReceipt,checkpointReceipt,pilotReport,
  tenantId,accountTenantId:tenantId,getAccessToken:async()=> 'test-token',
  requestLiveClosure:async()=>closure,assertCurrent:()=>true,
  inspectBatch:async()=>ledger,
  identityCheck:async()=>({identity:{objectId:userId}}),fetcher};
 return {args,ledger,closure,filename,
  stats:()=>({mutationCount,readCount,body})};
};

test('final receipt uses one immutable Graph create, full SHA-256 readback and no Monday API',async()=>{
 const f=fixture(),proof=await saveFinalSyncReceipt(f.args);
 assert.equal(proof.status,'SYNC_FINAL_RECEIPT_STORED');
 assert.equal(proof.name,'sync-final-'+approvedSha.slice(0,24)+'.json');
 assert.equal(proof.mondayWrites,0);
 assert.match(proof.sha256,/^[a-f0-9]{64}$/);
 assert.equal(proof.verification,'content-sha256-and-etag');
 assert.deepEqual(f.stats().mutationCount,1);
 assert.equal(f.stats().readCount,1);
 const value=JSON.parse(new TextDecoder().decode(f.stats().body));
 assert.equal(value.status,'SYNC_FINALIZED_TEST');
 assert.equal(value.ledgerEvidenceSha256,ledgerSha);
 assert.equal(value.boardFingerprint,fingerprintSha);
 assert.equal(value.mondayWritesByFinalization,0);
});
test('existing final receipt blocks write even when content could match',async()=>{
 const f=fixture({existing:true});
 await assert.rejects(saveFinalSyncReceipt(f.args),/mar van tartos zaronugta/);
 assert.equal(f.stats().mutationCount,0);
});
test('a fake or incomplete ledger cannot trigger a final receipt',async()=>{
 for(const alter of [
  x=>x.status='NEXT_BATCH_READY',
  x=>x.evidenceSha256='bad',
  x=>x.remainingTaskCount=1,
  x=>x.canPrepareNextBatch=true,
  x=>x.totalPendingBatchTasks=12
 ]){
  const f=fixture();alter(f.ledger);
  await assert.rejects(saveFinalSyncReceipt(f.args));
  assert.equal(f.stats().mutationCount,0);
 }
});
test('stale or forged Monday full-board proof blocks upload',async()=>{
 for(const alter of [
  x=>x.boardFingerprint='bad',
  x=>x.ledgerEvidenceSha256='0'.repeat(64),
  x=>x.changedTaskCount=11,
  x=>x.finalized=true,
  x=>x.inspectedAt='2020-01-01T00:00:00.000Z',
  x=>x.mondayWritesPerformed=1
 ]){
  const f=fixture();alter(f.closure);
  await assert.rejects(saveFinalSyncReceipt(f.args));
  assert.equal(f.stats().mutationCount,0);
 }
});
test('Entra approver mismatch or changed session blocks SharePoint upload',async()=>{
 const f=fixture();
 await assert.rejects(saveFinalSyncReceipt({...f.args,
  identityCheck:async()=>({identity:{objectId:'00000000-0000-4000-8000-000000000000'}})}));
 assert.equal(f.stats().mutationCount,0);
 await assert.rejects(saveFinalSyncReceipt({...f.args,assertCurrent:()=>false}));
 assert.equal(f.stats().mutationCount,0);
});
test('upload timeout does not silently retry an uncertain new file',async()=>{
 const f=fixture({uploadError:true});
 await assert.rejects(saveFinalSyncReceipt(f.args),/NINCS automatikus ismetles/);
 assert.equal(f.stats().mutationCount,1);
});
test('corrupted Graph content readback never claims a verified receipt',async()=>{
 const f=fixture({corrupt:true});
 await assert.rejects(saveFinalSyncReceipt(f.args),/SHA-256 egyezese nem igazolt/);
 assert.equal(f.stats().mutationCount,1);
});
