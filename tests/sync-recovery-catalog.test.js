import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoredSyncRecovery} from '../sync-recovery-catalog.js';

const boardId='5107075373',driveId='b!driveTest',sourceSha='a'.repeat(64);
const encode=x=>new TextEncoder().encode(JSON.stringify(x,null,2)+'\n');
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),
 n=>n.toString(16).padStart(2,'0')).join('');
async function scenario(changed=''){
 const approvedName='approved-v8-'+sourceSha.slice(0,24)+'.json';
 const plan={schemaVersion:1,format:'flow-lps-approved-plan',
  status:'APPROVED',isApprovedPlan:true,mondaySyncAllowed:false,
  syncStatus:'NOT_STARTED',boardId,draftVersion:8,
  sourceDraft:{sha256:sourceSha},sourceFingerprint:'source-fingerprint',
  plan:{base:{tasks:[{id:'101'}]},working:[{id:'101',note:'changed'}]}
 };
 const approvedBytes=encode(plan),approvedSha=await sha(approvedBytes);
 const cpName='sync-prepared-v8-'+approvedSha.slice(0,24)+'.json';
 const cp={schemaVersion:1,format:'flow-lps-sync-checkpoint',
  status:'PREPARED_NO_WRITES',boardId,
  approvedPlan:{name:approvedName,sha256:approvedSha,id:'id-'+approvedName,
   eTag:'etag-'+approvedName,draftVersion:8,
   sourceDraftSha256:sourceSha,driveId},
  mondaySourceFingerprint:'source-fingerprint',
  writeAuthorization:'NOT_GRANTED',mondayWritten:false,mondaySyncAllowed:false,
  progress:{cursor:0,mondayWrites:0,inFlight:null,verifiedTaskIds:[]}
 };
 const files=new Map([[approvedName,approvedBytes],[cpName,encode(cp)]]);
 const calls=[],base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
 const fetcher=async(uri,opts)=>{
  calls.push({uri,opts});assert.equal(opts.method,'GET');
  if(uri.includes(':/children?')){
   return response({value:[{name:cpName,id:'id-'+cpName,eTag:'etag-'+cpName,
    file:{},lastModifiedDateTime:'2026-11-24T10:00:00Z'},
    {name:'unrelated.json',id:'other',eTag:'etag',file:{}}]});
  }
  if(uri.startsWith('https://hanoplan.sharepoint.com/_api/')){
   const name=decodeURIComponent(uri.split('/').at(-1)),b=files.get(name);
   return {ok:!!b,status:b?200:404,
    arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
  }
  if(uri.startsWith(base+'/items/')){
   const name=decodeURIComponent(uri.slice((base+'/items/id-').length));
   const b=files.get(name);
   return b?response({id:'id-'+name,name,
    size:b.byteLength,eTag:'etag-'+name,file:{},parentReference:{driveId},
    '@microsoft.graph.downloadUrl':'https://hanoplan.sharepoint.com/_api/download/'+encodeURIComponent(name)}):
    response({},404);
  }
  const name=decodeURIComponent(uri.split('?')[0].split('/').at(-1));
  const b=files.get(name);
  if(!b)return response({},404);
  return response({id:'id-'+name,name,size:b.byteLength,
   eTag:'etag-'+name,file:{},parentReference:{driveId}});
 };
 const inspections=[];
 const service=createStoredSyncRecovery({boardId,driveId,
  getAccessToken:async()=> 'token',fetcher,
  inspect:async args=>{inspections.push(args);return {status:'WRITE_AHEAD_ONLY',
   boardId,automaticallyResume:false};}});
 if(changed==='tamper')files.set(approvedName,encode({...plan,sourceFingerprint:'wrong'}));
 if(changed==='mismatch')files.set(cpName,encode({...cp,approvedPlan:{...cp.approvedPlan,sha256:'0'.repeat(64)}}));
 return {service,files,inspections,calls,cpName,approvedName,approvedSha};
}
test('after closed browser: list historical TEST checkpoints, re-read both files and produce recovery',async()=>{
 const f=await scenario();
 const records=await f.service.list();
 assert.equal(records.length,1);
 assert.equal(records[0].name,f.cpName);
 const inspected=await f.service.inspectNamed(f.cpName);
 assert.equal(inspected.report.status,'WRITE_AHEAD_ONLY');
 assert.equal(inspected.approvedReceipt.sha256,f.approvedSha);
 assert.equal(inspected.checkpointReceipt.name,f.cpName);
 assert.equal(f.inspections.length,1);
 assert.equal(f.calls.some(c=>c.opts.method!=='GET'),false);
 assert.equal(f.calls.filter(c=>c.uri.includes('hanoplan.sharepoint.com')).length,2);
});
test('historical recovery refuses altered Approved Plan, invalid checkpoint or foreign path',async()=>{
 for(const type of ['tamper','mismatch']){
  const f=await scenario(type);
  await assert.rejects(()=>f.service.inspectNamed(f.cpName));
  assert.equal(f.inspections.length,0);
 }
 const f=await scenario();
 await assert.rejects(()=>f.service.inspectNamed('../../production.json'));
});
