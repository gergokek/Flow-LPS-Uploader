import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSingleTaskRecovery} from '../sync-recovery-inspect.js';

const boardId='5107075373',driveId='b!syntheticDrive',
 approvedSha='a'.repeat(64),sourceSha='b'.repeat(64),
 identity='e4c642e2-d5c5-40f7-b32c-af82bc281002';
const jsonBytes=o=>new TextEncoder().encode(JSON.stringify(o,null,2)+'\n');
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),
 n=>n.toString(16).padStart(2,'0')).join('');
async function scenario(mode='NO_JOURNAL',options={}){
 const name='sync-prepared-v8-'+approvedSha.slice(0,24)+'.json';
 const cp={schemaVersion:1,format:'flow-lps-sync-checkpoint',
  status:'PREPARED_NO_WRITES',boardId,
  approvedPlan:{sha256:approvedSha},
  mondaySourceFingerprint:'known-source-fingerprint',
  mondayPreflight:{editorIdClaim:'96423073'},
  preparedByEntraObjectId:identity,
  writeAuthorization:'NOT_GRANTED',mondayWritten:false,mondaySyncAllowed:false,
  progress:{cursor:0,mondayWrites:0,inFlight:null,verifiedTaskIds:[]}
 };
 const cpBytes=jsonBytes(cp),cpSha=await hash(cpBytes);
 const aheadName='sync-one-'+approvedSha.slice(0,24)+'-ahead.json';
 const ahead={schemaVersion:1,format:'flow-lps-single-task-write-ahead',
  status:'WRITE_AHEAD',boardId,taskId:'101',
  approvedSha256:approvedSha,checkpointSha256:cpSha,
  sourceFingerprint:cp.mondaySourceFingerprint,
  fieldNames:['note'],maximumMondayWrites:1,actualMondayWrites:0};
 const aheadBytes=jsonBytes(ahead),aheadSha=await hash(aheadBytes);
 const resultName='sync-one-'+approvedSha.slice(0,24)+'-result.json';
 const result={schemaVersion:1,format:'flow-lps-single-task-result',
  status:mode==='RESULT_UNCERTAIN'?'ITEM_UNCERTAIN':'ITEM_READBACK_VERIFIED',
  boardId,taskId:'101',approvedSha256:approvedSha,
  checkpointSha256:cpSha,writeAheadSha256:aheadSha,
  mondayWritesAttempted:1,readbackMatches:mode!=='RESULT_UNCERTAIN',
  error:mode==='RESULT_UNCERTAIN'?'timeout':null};
 const files=new Map();
 function add(fileName,bytes){files.set(fileName,{
  id:'id-'+fileName,eTag:'etag-'+fileName,name:fileName,
  size:bytes.byteLength,file:{},parentReference:{driveId},bytes});}
 add(name,cpBytes);
 if(mode!=='NO_JOURNAL'&&mode!=='ORPHAN_RESULT')add(aheadName,aheadBytes);
 if(['RESULT_VERIFIED','RESULT_UNCERTAIN','ORPHAN_RESULT'].includes(mode))
  add(resultName,jsonBytes(result));
 const approvedReceipt={status:'APPROVED_PLAN_STORED',boardId,
  version:8,sha256:approvedSha,sourceDraftSha256:sourceSha};
 const checkpointReceipt={status:'CHECKPOINT_PREPARED',boardId,
  draftVersion:8,approvedPlanSha256:approvedSha,
  name,path:'Projects/'+boardId+'/Sync-Status/'+name,
  sha256:cpSha,id:'id-'+name,eTag:'etag-'+name,
  verification:'content-sha256-and-etag',mondayWrites:0,mondaySyncAllowed:false};
 const calls=[],base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const res=(data,status=200)=>({status,ok:status>=200&&status<300,json:async()=>data});
 const fetcher=async(uri,opts={})=>{
  calls.push({uri,opts});
  if(opts.method!=='GET')throw Error('Recovery may only read Graph.');
  if(uri==='https://graph.microsoft.com/v1.0/me?$select=id')
   return res({id:options.wrongUser?'11111111-1111-4111-8111-111111111111':identity});
  if(uri.startsWith('https://hanoplan.sharepoint.com/_layouts/15/')){
   const name=decodeURIComponent(uri.split('/').at(-1));
   const bytes=files.get(name)?.bytes;
   return {status:bytes?200:404,ok:!!bytes,
    arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }
  if(uri.startsWith(base+'/items/')){
   const id=decodeURIComponent(uri.split('/').at(-1));
   const item=[...files.values()].find(x=>x.id===id);
   if(!item)return res({},404);
   const {bytes,...fields}=item;
   return res({...fields,'@microsoft.graph.downloadUrl':
    'https://hanoplan.sharepoint.com/_layouts/15/'+encodeURIComponent(item.name)});
  }
  if(uri.startsWith(base+'/root:/')){
   const name=decodeURIComponent(uri.split('?')[0].split('/').at(-1));
   const item=files.get(name);
   if(name===aheadName&&options.forbidAhead)return res({},403);
   if(!item)return res({},404);
   const {bytes,...fields}=item;
   return res(fields);
  }
  throw Error('Unexpected Graph URI '+uri);
 };
 const inspect=()=>inspectSingleTaskRecovery({boardId,driveId,
  approvedReceipt,checkpointReceipt,getAccessToken:async()=> 'synthetic-token',
  fetcher});
 return {inspect,calls,files,cp,checkpointReceipt,approvedReceipt,
  names:{name,aheadName,resultName}};
}
test('no prior journal: inspect all source metadata without a write',async()=>{
 const f=await scenario(),r=await f.inspect();
 assert.equal(r.status,'NO_JOURNAL');
 assert.equal(r.ahead,null);assert.equal(r.result,null);
 assert.equal(r.automaticallyResume,false);
 assert.equal(r.mondayWritesPerformedByThisInspection,0);
 assert.equal(r.claimedMondayEditorId,'96423073');
 assert.equal(f.calls.filter(x=>x.opts.method!=='GET').length,0);
});
test('confirmed write-ahead but missing result is ambiguous, never resumable',async()=>{
 const f=await scenario('WRITE_AHEAD_ONLY'),r=await f.inspect();
 assert.equal(r.status,'WRITE_AHEAD_ONLY');
 assert.equal(r.ahead.taskId,'101');
 assert.equal(r.result,null);
 assert.equal(r.action,'MANUAL_RECONCILIATION_REQUIRED');
});
test('verified one-task result is recognized only when linked to exact ahead bytes',async()=>{
 const f=await scenario('RESULT_VERIFIED'),r=await f.inspect();
 assert.equal(r.status,'RESULT_VERIFIED');
 assert.equal(r.result.taskId,'101');
 assert.equal(r.result.readbackMatches,true);
 assert.equal(r.ahead.name,f.names.aheadName);
 assert.equal(r.automaticallyResume,false);
});
test('uncertain post-write result stays manual-only even if a file exists',async()=>{
 const f=await scenario('RESULT_UNCERTAIN'),r=await f.inspect();
 assert.equal(r.status,'RESULT_UNCERTAIN');
 assert.equal(r.result.status,'ITEM_UNCERTAIN');
 assert.equal(r.action,'MANUAL_RECONCILIATION_REQUIRED');
});
test('orphan result, forbidden Graph read or wrong user fail closed',async()=>{
 for(const [mode,opts] of [
  ['ORPHAN_RESULT',{}],['NO_JOURNAL',{forbidAhead:true}],
  ['NO_JOURNAL',{wrongUser:true}]
 ]){
  const f=await scenario(mode,opts);
  await assert.rejects(()=>f.inspect());
 }
});
test('altered immutable checkpoint SHA and forged result chain are rejected',async()=>{
 const first=await scenario('RESULT_VERIFIED');
 const file=first.files.get(first.names.name);
 file.bytes=jsonBytes({...first.cp,status:'MUTATED'});
 file.size=file.bytes.byteLength;
 await assert.rejects(()=>first.inspect(),/SHA-256/);
 const second=await scenario('RESULT_VERIFIED');
 const obj=JSON.parse(new TextDecoder().decode(second.files.get(second.names.resultName).bytes));
 obj.writeAheadSha256='0'.repeat(64);
 const altered=second.files.get(second.names.resultName);
 altered.bytes=jsonBytes(obj);altered.size=altered.bytes.byteLength;
 await assert.rejects(()=>second.inspect(),/eltero/);
});
