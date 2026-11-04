import test from 'node:test';
import assert from 'node:assert/strict';
import {createSingleTaskJournal} from '../sync-single-task-journal.js';

const boardId='5107075373',driveId='b!fake';
const approvedHash='b'.repeat(64),cpHashPlaceholder='c'.repeat(64);
const bytes=x=>new TextEncoder().encode(JSON.stringify(x,null,2)+'\n');
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),
 n=>n.toString(16).padStart(2,'0')).join('');
async function fixture(){
 const cp={
  schemaVersion:1,format:'flow-lps-sync-checkpoint',
  status:'PREPARED_NO_WRITES',boardId,
  approvedPlan:{sha256:approvedHash},
  writeAuthorization:'NOT_GRANTED',
  progress:{cursor:0,mondayWrites:0,inFlight:null,verifiedTaskIds:[]}
 };
 const cpBytes=bytes(cp),cpSha=await sha(cpBytes);
 const approvedReceipt={
  status:'APPROVED_PLAN_STORED',boardId,version:8,sha256:approvedHash,
  verification:'content-sha256-and-etag',mondaySyncAllowed:false
 };
 const cpName='sync-prepared-v8-'+approvedHash.slice(0,24)+'.json';
 const checkpointReceipt={status:'CHECKPOINT_PREPARED',boardId,draftVersion:8,
  name:cpName,path:'Projects/'+boardId+'/Sync-Status/'+cpName,
  sha256:cpSha,id:'cp-item',eTag:'cp-etag',
  approvedPlanSha256:approvedHash,
  verification:'content-sha256-and-etag',
  mondaySyncAllowed:false,mondayWrites:0};
 const entry={schemaVersion:1,format:'flow-lps-single-task-write-ahead',
  status:'WRITE_AHEAD',boardId,taskId:'101',
  approvedSha256:approvedHash,checkpointSha256:cpSha,
  sourceFingerprint:'some-source-fingerprint',fieldNames:['note'],
  checkedAt:new Date().toISOString(),maximumMondayWrites:1,
  actualMondayWrites:0};
 return {cp,cpBytes,checkpointReceipt,approvedReceipt,entry};
}
function mock(f,{unknownDownload=false,duplicateAhead=false,failUpload=false}={}){
 const contents=new Map([[f.checkpointReceipt.name,f.cpBytes]]);
 const metadata=new Map([[f.checkpointReceipt.name,{
  id:'cp-item',name:f.checkpointReceipt.name,eTag:'cp-etag'}]]);
 const calls=[];
 const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const origin='https://hanoplan.sharepoint.com';
 const uploadUrl=origin+'/_api/v2.0/upload/write-ahead';
 const getName=u=>decodeURIComponent(u.slice(u.lastIndexOf('/')+1).split('?')[0].replace(/:$/,''));
 const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
 const bytesRes=raw=>({ok:true,status:200,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)});
 const createItem=(name,raw)=>{
  contents.set(name,raw);
  metadata.set(name,{id:'journal-'+name,name,eTag:'etag-'+name});
 };
 if(duplicateAhead){
  const name='sync-one-'+approvedHash.slice(0,24)+'-task-101-ahead.json';
  createItem(name,bytes(f.entry));
 }
 async function fetcher(uri,options={}){
  calls.push({uri,options});
  if(uri===uploadUrl){
   if(failUpload)return response({},500);
   const name=options.journalName||globalExpectedName;
   createItem(name,options.body);
   return response({id:'journal-'+name,name,size:options.body.byteLength,file:{}},201);
  }
  if(uri.startsWith(origin+'/_layouts/15/download/')){
   if(unknownDownload)return bytesRes(new TextEncoder().encode('tampered'));
   const name=decodeURIComponent(uri.split('/').at(-1).split('?')[0]);
   return bytesRes(contents.get(name));
  }
  if(!uri.startsWith(base))throw Error('Unexpected URL '+uri);
  if(uri.endsWith('/createUploadSession')){
   const name=JSON.parse(options.body).item.name;
   assert.equal(JSON.parse(options.body).item['@microsoft.graph.conflictBehavior'],'fail');
   globalExpectedName=name;
   return response({uploadUrl,expirationDateTime:new Date(Date.now()+3600000).toISOString()});
  }
  if(uri.includes('/items/')&&!uri.includes(':')&&!uri.includes('?')){
   const id=decodeURIComponent(uri.split('/').at(-1));
   const item=[...metadata.values()].find(x=>x.id===id);
   if(!item)throw Error('Unexpected item: '+id);
   return response({...item,size:contents.get(item.name).byteLength,
    file:{},parentReference:{driveId},
    '@microsoft.graph.downloadUrl':origin+'/_layouts/15/download/'+encodeURIComponent(item.name)});
  }
  if(uri.includes('/Sync-Status?'))
   return response({id:'folder',name:'Sync-Status',folder:{},parentReference:{driveId}});
  if(uri.includes('/Sync-Status/')){
   const name=getName(uri.split('?')[0]);
   const item=metadata.get(name);
   if(!item)return response({},404);
   return response({...item,size:contents.get(name).byteLength,
    file:{},parentReference:{driveId}});
  }
  throw Error('Unrecognized Graph call '+uri);
 }
 let globalExpectedName='';
 return {fetcher,calls,contents};
}
test('journal must persist and fully verify ahead before result, with 0 Monday API calls',async()=>{
 const f=await fixture(),m=mock(f),journal=createSingleTaskJournal({
  boardId,driveId,getAccessToken:async()=> 'token',fetcher:m.fetcher});
 const ahead=await journal.recordAhead({entry:f.entry,
  checkpointReceipt:f.checkpointReceipt,approvedReceipt:f.approvedReceipt});
 assert.equal(ahead.status,'WRITE_AHEAD_VERIFIED');
 assert.equal(ahead.mondayWriteLimit,1);
 const resultEntry={schemaVersion:1,format:'flow-lps-single-task-result',
  status:'ITEM_READBACK_VERIFIED',boardId,taskId:'101',
  approvedSha256:approvedHash,checkpointSha256:f.checkpointReceipt.sha256,
  writeAheadSha256:ahead.sha256,mondayWritesAttempted:1,
  readbackMatches:true,checkedAt:new Date().toISOString(),error:null};
 const result=await journal.recordResult({entry:resultEntry,
  aheadReceipt:ahead,checkpointReceipt:f.checkpointReceipt,
  approvedReceipt:f.approvedReceipt});
 assert.equal(result.status,'ITEM_RESULT_VERIFIED');
 assert.equal(m.calls.filter(c=>c.options.method==='PUT').length,2);
 assert.equal(m.calls.filter(c=>c.options.method==='POST').length,2);
 assert.ok(!m.calls.some(c=>c.uri.includes('monday.com')));
 for(const call of m.calls.filter(c=>c.uri.includes('/_layouts/15/download'))){
  assert.equal(call.options.headers?.Authorization,undefined);
  assert.equal(call.options.credentials,'omit');
 }
 const file=JSON.parse(new TextDecoder().decode(m.contents.get(result.name)));
 assert.equal(file.taskId,'101');
 assert.equal(file.mondayWritesAttempted,1);
});
test('a second write-ahead file for same task and Approved Plan is forbidden',async()=>{
 const f=await fixture(),m=mock(f,{duplicateAhead:true});
 const journal=createSingleTaskJournal({boardId,driveId,
  getAccessToken:async()=> 'token',fetcher:m.fetcher});
 await assert.rejects(()=>journal.recordAhead({entry:f.entry,
  checkpointReceipt:f.checkpointReceipt,approvedReceipt:f.approvedReceipt}),/mar letezik/);
 assert.equal(m.calls.filter(c=>c.options.method==='PUT').length,0);
});
test('forged phases and mismatching checkpoint never produce a journal write',async()=>{
 const f=await fixture();
 for(const modify of [
  x=>x.entry.maximumMondayWrites=2,
  x=>x.entry.actualMondayWrites=1,
  x=>x.entry.taskId='wrong',
  x=>x.checkpointReceipt.sha256='a'.repeat(64),
  x=>x.approvedReceipt.sha256='bad',
  x=>x.entry.approvedSha256='d'.repeat(64)
 ]){
  const a=structuredClone(f);modify(a);const m=mock(a);
  const journal=createSingleTaskJournal({boardId,driveId,
   getAccessToken:async()=> 'token',fetcher:m.fetcher});
  await assert.rejects(()=>journal.recordAhead({entry:a.entry,
   checkpointReceipt:a.checkpointReceipt,approvedReceipt:a.approvedReceipt}));
  assert.equal(m.calls.some(c=>c.options.method==='PUT'),false);
 }
});
test('tampered downloaded checkpoint and uncertain upload never yield verified proof',async()=>{
 const f=await fixture();
 for(const options of [{unknownDownload:true},{failUpload:true}]){
  const m=mock(f,options),journal=createSingleTaskJournal({boardId,driveId,
   getAccessToken:async()=> 'token',fetcher:m.fetcher});
  await assert.rejects(()=>journal.recordAhead({entry:f.entry,
   checkpointReceipt:f.checkpointReceipt,approvedReceipt:f.approvedReceipt}));
  assert.ok(m.calls.filter(c=>c.options.method==='PUT').length<=1);
 }
});
test('result without prior durable write-ahead is refused before Graph write',async()=>{
 const f=await fixture(),m=mock(f);
 const journal=createSingleTaskJournal({boardId,driveId,
  getAccessToken:async()=> 'token',fetcher:m.fetcher});
 const ahead={status:'WRITE_AHEAD_VERIFIED',boardId,taskId:'101',
  approvedSha256:approvedHash,checkpointSha256:f.checkpointReceipt.sha256,
  sha256:'f'.repeat(64),id:'fake',eTag:'fake',
  verification:'content-sha256-and-etag'};
 const resultEntry={schemaVersion:1,format:'flow-lps-single-task-result',
  status:'ITEM_UNCERTAIN',boardId,taskId:'101',
  approvedSha256:approvedHash,checkpointSha256:f.checkpointReceipt.sha256,
  writeAheadSha256:ahead.sha256,mondayWritesAttempted:1,
  readbackMatches:false,checkedAt:new Date().toISOString()};
 await assert.rejects(()=>journal.recordResult({entry:resultEntry,
  aheadReceipt:ahead,checkpointReceipt:f.checkpointReceipt,
  approvedReceipt:f.approvedReceipt}));
 assert.equal(m.calls.some(c=>c.options.method==='PUT'),false);
});
