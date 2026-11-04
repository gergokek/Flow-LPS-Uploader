import test from 'node:test';
import assert from 'node:assert/strict';
import {saveSyncPreparationCheckpoint} from '../sync-checkpoint-save.js';

const boardId='5107075373',driveId='b!testdrive';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const objectId='e4c642e2-d5c5-40f7-b32c-af82bc281002';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
 x=>x.toString(16).padStart(2,'0')).join('');
const bytes=v=>new TextEncoder().encode(JSON.stringify(v,null,2)+'\n');
async function fixture(){
 const plan={schemaVersion:1,format:'flow-lps-approved-plan',
  status:'APPROVED',isApprovedPlan:true,mondaySyncAllowed:false,
  syncStatus:'NOT_STARTED',boardId,draftVersion:8,
  sourceFingerprint:'{"id":"5107075373","tasks":[{"id":"101"},{"id":"102"}]}',
  sourceDraft:{sha256:'a'.repeat(64)},
  finalization:{mondayEditorIdClaim:'96423073',microsoftEntraObjectId:objectId},
  plan:{base:{id:boardId,tasks:[{id:'101'},{id:'102'}]},
   working:[{id:'101',forecast:{from:'2026-11-04'}},
    {id:'102',forecast:{from:'2026-11-05'}}]}
 };
 const approvedSha=await sha(bytes(plan));
 const name='approved-v8-'+plan.sourceDraft.sha256.slice(0,24)+'.json';
 const approved={status:'APPROVED_PLAN_STORED',boardId,version:8,
  sourceDraftSha256:plan.sourceDraft.sha256,sha256:approvedSha,
  name,path:'Projects/'+boardId+'/Approved-Plans/'+name,
  id:'approved-item',eTag:'approved-etag',mondaySyncAllowed:false,
  verification:'content-sha256-and-etag',approvedPlan:plan};
 const report={schemaVersion:1,format:'flow-lps-sync-preparation-report',
  status:'BOARD_PRECHECK_ONLY',boardId,draftVersion:8,
  approvedFile:name,sourceDraftSha256:plan.sourceDraft.sha256,
  approvedPlanSha256:approvedSha,approvedETag:'approved-etag',
  sourceFingerprint:plan.sourceFingerprint,editorId:'96423073',
  totalTasks:2,changedTasks:2,fieldChanges:3,
  fieldCounts:[{field:'forecast',tasks:2},{field:'endWeek',tasks:1}],
  checkedAt:new Date().toISOString(),
  checks:{currentMondaySnapshot:'matched',columnEncoding:'passed'},
  mondaySyncAllowed:false,mondayWritten:false,mutationCount:0};
 return {approved,report,boardId,driveId,tenantId,accountTenantId:tenantId,
  getAccessToken:async()=> 'test-token'};
}
function mock(approved,{existing=false,wrongIdentity=false,tamperPlan=false,
 wrongUploadHost=false,writeStatus=201,tamperCheckpoint=false}={}){
 const calls=[],approvalUrl='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=approval',
  checkpointUrl='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=checkpoint',
  uploadUrl='https://hanoplan.sharepoint.com/_api/v2.0/upload/checkpoint-token';
 const approvedBytes=tamperPlan?new TextEncoder().encode('tampered'):bytes(approved.approvedPlan);
 let checkpointBytes=null,postCount=0;
 const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const savedName='sync-prepared-v8-'+approved.sha256.slice(0,24)+'.json';
 async function fetcher(url,options={}){
  calls.push({url,options});
  const raw=(buf)=>({ok:true,status:200,
   headers:{get:()=>String(buf.byteLength)},
   arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)});
  if(url===approvalUrl)return raw(approvedBytes);
  if(url===checkpointUrl)return raw(tamperCheckpoint?new TextEncoder().encode('bad'):checkpointBytes);
  if(url===uploadUrl){
   checkpointBytes=options.body;
   return {ok:writeStatus===201,status:writeStatus,json:async()=>({
    id:'checkpoint-item',name:savedName,size:checkpointBytes.byteLength,file:{}
   })};
  }
  if(url==='https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName')
   return {ok:true,status:200,json:async()=>({
    id:wrongIdentity?'11111111-1111-4111-8111-111111111111':objectId,
    displayName:'Tester',userPrincipalName:'tester@example.com'
   })};
  if(!url.startsWith(base))throw Error('Unexpected fetch '+url);
  if(url.includes('Approved-Plans/')&&url.includes('?$select=id,name,size,file,parentReference,eTag'))
   return {ok:true,status:200,json:async()=>({
    id:'approved-item',name:approved.name,size:bytes(approved.approvedPlan).byteLength,
    file:{},parentReference:{driveId},eTag:'approved-etag'
   })};
  if(url.endsWith('/items/approved-item'))
   return {ok:true,status:200,json:async()=>({
    id:'approved-item',name:approved.name,size:bytes(approved.approvedPlan).byteLength,
    file:{},parentReference:{driveId},eTag:'approved-etag',
    '@microsoft.graph.downloadUrl':approvalUrl
   })};
  if(url.includes('/Sync-Status?'))
   return {ok:true,status:200,json:async()=>({
    id:'sync-folder',name:'Sync-Status',folder:{},parentReference:{driveId}
   })};
  if(url.includes('/Sync-Status/')&&url.endsWith('?$select=id,name')){
   return {ok:existing,status:existing?200:404,json:async()=>existing?
    {id:'existing-checkpoint',name:savedName}:{}};
  }
  if(url.includes('/createUploadSession')){
   postCount++;
   assert.equal(options.method,'POST');
   assert.deepEqual(JSON.parse(options.body).item,{
    '@microsoft.graph.conflictBehavior':'fail',name:savedName
   });
   return {ok:true,status:200,json:async()=>({
    uploadUrl:wrongUploadHost?'https://attacker.example.net/put':uploadUrl,
    expirationDateTime:new Date(Date.now()+3600000).toISOString()
   })};
  }
  if(url.includes('/Sync-Status/')&&url.includes('?$select=id,name,size,file,parentReference,eTag'))
   return {ok:true,status:200,json:async()=>({
    id:'checkpoint-item',name:savedName,size:checkpointBytes.byteLength,
    file:{},parentReference:{driveId},eTag:'checkpoint-etag'
   })};
  if(url.endsWith('/items/checkpoint-item'))
   return {ok:true,status:200,json:async()=>({
    id:'checkpoint-item',name:savedName,size:checkpointBytes.byteLength,
    file:{},parentReference:{driveId},eTag:'checkpoint-etag',
    '@microsoft.graph.downloadUrl':checkpointUrl
   })};
  throw Error('Unrecognized Graph request: '+url);
 }
 return {fetcher,calls,getCheckpoint:()=>checkpointBytes,postCount:()=>postCount};
}
test('checkpoint creates one immutable, verified file and never writes Monday',async()=>{
 const f=await fixture(),m=mock(f.approved);
 const res=await saveSyncPreparationCheckpoint({...f,fetcher:m.fetcher});
 assert.equal(res.status,'CHECKPOINT_PREPARED');
 assert.equal(res.mondayWrites,0);
 assert.equal(res.mondaySyncAllowed,false);
 assert.equal(res.verification,'content-sha256-and-etag');
 assert.equal(res.name,'sync-prepared-v8-'+f.approved.sha256.slice(0,24)+'.json');
 const cp=JSON.parse(new TextDecoder().decode(m.getCheckpoint()));
 assert.equal(cp.status,'PREPARED_NO_WRITES');
 assert.equal(cp.progress.cursor,0);
 assert.deepEqual(cp.progress.verifiedTaskIds,[]);
 assert.equal(cp.progress.inFlight,null);
 assert.equal(cp.progress.mondayWrites,0);
 assert.equal(cp.writeAuthorization,'NOT_GRANTED');
 assert.equal(cp.mondaySyncAllowed,false);
 assert.equal(cp.approvedPlan.sha256,f.approved.sha256);
 assert.equal(cp.mondaySourceFingerprint,f.report.sourceFingerprint);
 assert.equal(cp.mondayPreflight.changedTasks,2);
 assert.equal(m.calls.filter(c=>c.options.method==='PUT').length,1);
 assert.equal(m.calls.filter(c=>c.options.method==='POST').length,1);
 assert.ok(m.calls.every(c=>!c.url.includes('monday.com')));
 for(const u of [m.calls.find(c=>c.url.includes('token=approval')),
  m.calls.find(c=>c.url.includes('token=checkpoint'))]){
  assert.equal(u.options.headers?.Authorization,undefined);
  assert.equal(u.options.credentials,'omit');
 }
});
test('duplicate, stale report and forgery cannot initiate writes',async()=>{
 const f=await fixture();
 for(const alteration of [
  r=>r.approvedPlanSha256='b'.repeat(64),
  r=>r.status='READY_TO_SYNC',
  r=>r.mondaySyncAllowed=true,
  r=>r.mondayWritten=true,
  r=>r.mutationCount=1,
  r=>r.editorId='123',
  r=>r.checkedAt='2020-01-01T00:00:00Z',
  r=>r.sourceFingerprint='corrupt',
  r=>r.fieldCounts[0].tasks=3
 ]){
  const r=structuredClone(f.report);alteration(r);
  const m=mock(f.approved);
  await assert.rejects(()=>saveSyncPreparationCheckpoint({...f,report:r,fetcher:m.fetcher}));
  assert.equal(m.calls.length,0);
 }
 const d=mock(f.approved,{existing:true});
 await assert.rejects(()=>saveSyncPreparationCheckpoint({...f,fetcher:d.fetcher}),/mar van elokeszito checkpoint/);
 assert.equal(d.calls.some(c=>c.options.method==='PUT'||c.options.method==='POST'),false);
});
test('changed approved content or different Entra account blocks checkpoint write',async()=>{
 const f=await fixture();
 for(const scenario of [{tamperPlan:true},{wrongIdentity:true}]){
  const m=mock(f.approved,scenario);
  await assert.rejects(()=>saveSyncPreparationCheckpoint({...f,fetcher:m.fetcher}));
  assert.equal(m.calls.some(c=>c.options.method==='PUT'||c.options.method==='POST'),false);
 }
});
test('blocked upload host, uncertain write, changed checkpoint bytes fail closed',async()=>{
 const f=await fixture();
 for(const scenario of [{wrongUploadHost:true},{writeStatus:200},{tamperCheckpoint:true}]){
  const m=mock(f.approved,scenario);
  await assert.rejects(()=>saveSyncPreparationCheckpoint({...f,fetcher:m.fetcher}));
  assert.ok(m.calls.filter(c=>c.options.method==='PUT').length<=1);
 }
});
test('session or DRAFT change immediately before PUT blocks checkpoint creation',async()=>{
 const f=await fixture(),m=mock(f.approved);
 let checks=0;
 await assert.rejects(()=>saveSyncPreparationCheckpoint({...f,fetcher:m.fetcher,
  assertCurrent:()=>++checks<4}),/megvaltozott/);
 assert.ok(checks>=4);
 assert.equal(m.calls.some(c=>c.options.method==='PUT'),false);
});
