import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStoredBatchProgress} from '../sync-batch-recovery-inspect.js';
const boardId='5107075373',driveId='b!synthetic-batch',
 approvedSha='a'.repeat(64),cpSha='b'.repeat(64);
const text=x=>new TextEncoder().encode(JSON.stringify(x,null,2)+'\n');
async function fixture({forbidList=false,forbidRead=false,conflict=false}={}){
 const base=Array.from({length:13},(_,i)=>({id:String(i+101),name:'Task '+i,note:'old'}));
 const working=base.map(t=>({...t,note:'new'}));
 const approvedPlan={schemaVersion:1,format:'flow-lps-approved-plan',
  status:'APPROVED',isApprovedPlan:true,mondaySyncAllowed:false,boardId,
  sourceFingerprint:'source-snapshot',plan:{base:{tasks:base},working}};
 const approvedReceipt={status:'APPROVED_PLAN_STORED',boardId,
  sha256:approvedSha,approvedPlan};
 const checkpointReceipt={status:'CHECKPOINT_PREPARED',boardId,
  sha256:cpSha,approvedPlanSha256:approvedSha};
 const pilotReport={status:'RESULT_VERIFIED',boardId,
  approvedPlanSha256:approvedSha,checkpointSha256:cpSha,
  result:{status:'ITEM_READBACK_VERIFIED',taskId:'101',
   readbackMatches:true,sha256:'c'.repeat(64)}};
 const map=new Map();
 for(let i=1;i<=10;i++){
  const taskId=String(101+i),batchNumber=1,step=i,
   name=kind=>'sync-batch-'+approvedSha.slice(0,24)+'-step-'+
    String(step).padStart(4,'0')+'-'+kind+'.json';
  const ahead={schemaVersion:1,format:'flow-lps-batch-task-ahead',
   status:'BATCH_WRITE_AHEAD',boardId,taskId,step,batchNumber,
   approvedSha256:approvedSha,checkpointSha256:cpSha,
   sourceFingerprint:'source-snapshot',fieldNames:['note'],
   checkedAt:'2026-11-24T09:00:00Z',
   maximumMondayWrites:1,actualMondayWrites:0};
  const aheadBytes=text(ahead),aheadHash=Array.from(new Uint8Array(
   await crypto.subtle.digest('SHA-256',aheadBytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const result={schemaVersion:1,format:'flow-lps-batch-task-result',
   status:'BATCH_ITEM_READBACK_VERIFIED',boardId,taskId,step,batchNumber,
   approvedSha256:approvedSha,checkpointSha256:cpSha,
   writeAheadSha256:aheadHash,mondayWritesAttempted:1,
   readbackMatches:true,error:null};
  for(const [kind,value] of [['ahead',ahead],['result',result]]){
   const n=name(kind),bytes=text(value);
   map.set(n,{name:n,id:'id-'+n,eTag:'etag-'+n,size:bytes.byteLength,
    file:{},parentReference:{driveId},bytes});
  }
 }
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const result=(v,status=200)=>({status,ok:status>=200&&status<300,json:async()=>v});
 const calls=[];
 const fetcher=async(uri,opts)=>{
  calls.push({uri,opts});
  assert.equal(opts.method,'GET','no Graph write during batch recovery');
  if(uri.startsWith('https://hanoplan.sharepoint.com/')){
   const name=decodeURIComponent(uri.split('/').at(-1));
   const item=map.get(name);
   return item?{status:200,ok:true,arrayBuffer:async()=>item.bytes.buffer.slice(
    item.bytes.byteOffset,item.bytes.byteOffset+item.bytes.byteLength)}:
    result({},404);
  }
  if(uri.includes(':/children?')){
   if(forbidList)return result({},403);
   return result({value:[...map.values()].map(({bytes,...data})=>data)});
  }
  if(uri.startsWith(root+'/items/')){
   const name=decodeURIComponent(uri.slice((root+'/items/id-').length));
   const item=map.get(name);
   if(!item)return result({},404);
   const {bytes,...meta}=item;
   return result({...meta,'@microsoft.graph.downloadUrl':
    'https://hanoplan.sharepoint.com/_api/'+encodeURIComponent(name)});
  }
  if(uri.startsWith(root+'/root:/')){
   const name=decodeURIComponent(uri.split('?')[0].split('/').at(-1));
   if(forbidRead&&name.endsWith('step-0002-result.json'))return result({},403);
   const item=map.get(name);
   if(!item)return result({},404);
   const {bytes,...meta}=item;
   return result(meta);
  }
  throw Error('Unexpected URL '+uri);
 };
 const inspect=()=>inspectStoredBatchProgress({boardId,driveId,
  approvedReceipt,checkpointReceipt,getAccessToken:async()=> 'token',
  inspectPilot:async()=>pilotReport,fetcher});
 if(conflict){
  const key=[...map.keys()].find(k=>k.endsWith('step-0001-result.json'));
  map.get(key).eTag='modified-during-read';
 }
 return {inspect,calls,map};
}
test('Graph verifies complete first ten step pairs before allowing second group',async()=>{
 const f=await fixture(),result=await f.inspect();
 assert.equal(result.status,'NEXT_BATCH_READY');
 assert.equal(result.nextBatchNumber,2);
 assert.equal(result.nextStep,11);
 assert.deepEqual(result.nextTaskIds,['112','113']);
 assert.equal(result.verifiedBatchCount,10);
 assert.equal(result.inspectedWithWrites,0);
 assert.equal(f.calls.every(c=>c.opts.method==='GET'),true);
 assert.equal(f.calls.filter(c=>c.uri.startsWith('https://hanoplan.sharepoint.com/')).length,20);
});
test('403 during Graph list or file read never masquerades as an absent journal',async()=>{
 for(const opts of [{forbidList:true},{forbidRead:true}]){
  const f=await fixture(opts);
  await assert.rejects(()=>f.inspect(),/HTTP 403/);
 }
});
test('missing result file yields manual stop with no continuing batch',async()=>{
 const f=await fixture();
 const name=[...f.map.keys()].find(x=>x.endsWith('step-0010-result.json'));
 f.map.delete(name);
 const x=await f.inspect();
 assert.equal(x.status,'MANUAL_RECONCILIATION_REQUIRED');
 assert.equal(x.verifiedBatchCount,9);
 assert.equal(x.stopReason,'MISSING_RESULT');
 assert.equal(x.canPrepareNextBatch,false);
});
