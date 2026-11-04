import test from 'node:test';
import assert from 'node:assert/strict';
import {saveApprovedPlan} from '../approved-plan-save.js';
import {validateEditedDraft} from '../edited-draft-validator.js';

const boardId='5107075373',driveId='b!testdrive';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const objectId='e4c642e2-d5c5-40f7-b32c-af82bc281002';
const downloadUrl='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=approved';
const uploadUrl='https://hanoplan.sharepoint.com/_api/v2.0/upload/temporary-token';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':
 v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
async function fixture(){
 const base={id:boardId,tasks:[{id:'101',name:'Sample'}]};
 const draft={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',
  isApprovedPlan:false,boardId,base,
  source:stable({id:boardId,workspaceId:undefined,columns:undefined,groups:undefined,tasks:base.tasks}),
  working:[{id:'101',name:'Sample',forecast:{from:'2026-11-30',to:'2026-11-30'}}],
  version:7,history:Array.from({length:7},(_,i)=>({revision:i+1,type:'edit'}))};
 const draftText=JSON.stringify(draft),summary=await validateEditedDraft(draftText,boardId);
 const saved={boardId,version:7,name:'draft-v7-abcdefgh-12345678.json',id:'draft-id',
  eTag:'draft-etag',verification:'content-sha256-and-etag',
  sha256:summary.sha256,bytes:summary.bytes};
 const intent={schemaVersion:1,format:'flow-lps-draft-finalization-intent',
  status:'INTENT_ONLY',boardId,version:7,sha256:summary.sha256,bytes:summary.bytes,
  editorId:'96423073',confirmedAt:new Date().toISOString(),
  isApprovedPlan:false,approvalEligible:false,mondaySyncAllowed:false};
 return {draftText,saved,intent,boardId,driveId,tenantId,accountTenantId:tenantId,
  getAccessToken:async()=> 'token'};
}
const report=f=>({boardId,version:7,sha256:f.saved.sha256,bytes:f.saved.bytes,
 file:{id:f.saved.id,eTag:f.saved.eTag},identity:{objectId,userPrincipalName:'example@example.com'},
 checks:{graphContent:'verified-sha256-and-etag',entraIdentity:'verified-graph-me'}});
function network({existing=false,modified=false,wrongHost=false,status=201,badFolder=false}={}){
 const calls=[],base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 let payload=null,fileName=null,id='approved-id',etag='approved-etag-1';
 async function fetcher(url,options={}){
  calls.push({url,options});
  if(url===uploadUrl){
   payload=options.body;
   return {ok:status===201,status,json:async()=>({id,name:fileName,size:payload.byteLength,file:{}})};
  }
  if(url===downloadUrl){
   const result=modified?new TextEncoder().encode('tampered'):payload;
   return {ok:true,status:200,arrayBuffer:async()=>result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength)};
  }
  if(url.startsWith(base)){
   if(url.includes('createUploadSession')){
    assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body).item,{
     '@microsoft.graph.conflictBehavior':'fail',name:fileName
    });
    return {ok:true,status:200,json:async()=>({uploadUrl:wrongHost?'https://attacker.example/upload':uploadUrl,
     expirationDateTime:new Date(Date.now()+3600000).toISOString()})};
   }
   if(url.includes('/Approved-Plans?')&&!url.includes('.json')){
    return {ok:true,status:200,json:async()=>({id:'folder-id',name:'Approved-Plans',
     folder:badFolder?null:{childCount:0},parentReference:{driveId}})};
   }
   if(url.includes('/Approved-Plans/')&&url.includes('?$select=id,name,size')){
    fileName=decodeURIComponent(url.split('/').at(-1).split('?')[0].replace(/:$/,''));
    return {ok:existing,status:existing?200:404,
     json:async()=>existing?{id,name:fileName,size:123}:{}};
   }
   if(url.includes('/Approved-Plans/')&&url.includes('?$select=id,name,size,file')){
    return {ok:true,status:200,json:async()=>({id,name:fileName,size:payload.byteLength,file:{},
     eTag:etag,parentReference:{driveId}})};
   }
   if(url.endsWith('/items/'+encodeURIComponent(id))){
    return {ok:true,status:200,json:async()=>({id,name:fileName,size:payload.byteLength,file:{},
     eTag:etag,parentReference:{driveId},'@microsoft.graph.downloadUrl':downloadUrl})};
   }
   throw Error('Unknown Graph URL: '+url);
  }
  throw Error('Unexpected URL: '+url);
 }
 return {fetcher,calls,getPayload:()=>payload,base};
}
async function run(f,n,inspect=async()=>report(f)){
 return saveApprovedPlan({...f,fetcher:n.fetcher,inspect});
}
test('one explicit confirmation produces immutable-name Approved Plan with no Monday sync',async()=>{
 const f=await fixture(),n=network();
 const res=await run(f,n);
 assert.equal(res.status,'APPROVED_PLAN_STORED');
 assert.equal(res.version,7);
 assert.equal(res.mondaySyncAllowed,false);
 assert.equal(res.checks.approvedPlanGraphReadback,'passed');
 assert.equal(res.path,'Projects/'+boardId+'/Approved-Plans/'+res.name);
 assert.equal(res.name,'approved-v7-'+f.saved.sha256.slice(0,24)+'.json');
 const document=JSON.parse(new TextDecoder().decode(n.getPayload()));
 assert.equal(document.status,'APPROVED');
 assert.equal(document.isApprovedPlan,true);
 assert.equal(document.mondaySyncAllowed,false);
 assert.equal(document.syncStatus,'NOT_STARTED');
 assert.equal(document.finalization.mondayEditorIdClaim,'96423073');
 assert.equal(document.finalization.microsoftEntraObjectId,objectId);
 assert.equal(document.sourceDraft.sha256,f.saved.sha256);
 assert.equal(document.plan.working[0].forecast.from,'2026-11-30');
 assert.equal(n.calls.filter(c=>c.options.method==='POST').length,1);
 assert.equal(n.calls.filter(c=>c.options.method==='PUT').length,1);
 const upload=n.calls.find(c=>c.options.method==='PUT');
 assert.equal(upload.options.credentials,'omit');
 assert.equal(upload.options.headers.Authorization,undefined);
 assert.match(upload.options.headers['Content-Range'],/^bytes 0-\d+\/\d+$/);
 assert.ok(!n.calls.some(c=>c.url.includes('monday.com')));
});
test('invalid intent and mismatched saved DRAFT block all Graph writes',async()=>{
 const f=await fixture();
 for(const intentChange of [
  {version:6},{sha256:'b'.repeat(64)},{bytes:1},
  {status:'APPROVED'},{isApprovedPlan:true},{mondaySyncAllowed:true},
  {confirmedAt:'2020-01-01T00:00:00Z'}
 ]){
  const n=network();
  await assert.rejects(()=>run({...f,intent:{...f.intent,...intentChange}},n));
  assert.equal(n.calls.length,0,JSON.stringify(intentChange));
 }
 const n=network();
 await assert.rejects(()=>run({...f,saved:{...f.saved,eTag:''}},n));
 assert.equal(n.calls.length,0);
});
test('an existing Approved Plan is never overwritten or duplicated',async()=>{
 const f=await fixture(),n=network({existing:true});
 await assert.rejects(()=>run(f,n),/mar letezik/);
 assert.equal(n.calls.filter(c=>c.options.method==='POST'||c.options.method==='PUT').length,0);
});
test('wrong site folder and failed independent Graph DRAFT check block upload',async()=>{
 const f=await fixture(),n=network({badFolder:true});
 await assert.rejects(()=>run(f,n),/Approved-Plans/);
 assert.equal(n.calls.filter(c=>c.options.method==='POST').length,0);
 const fail=network();
 await assert.rejects(()=>run(f,fail,async()=>({...report(f),sha256:'b'.repeat(64)})));
 assert.equal(fail.calls.length,0);
});
test('malicious upload host and ambiguous Graph upload failure fail closed',async()=>{
 const f=await fixture(),n=network({wrongHost:true});
 await assert.rejects(()=>run(f,n),/megbizhato/);
 assert.equal(n.calls.some(c=>c.options.method==='PUT'),false);
 const m=network({status:200});
 await assert.rejects(()=>run(f,m),/bizonytalan/);
 assert.equal(m.calls.filter(c=>c.options.method==='PUT').length,1);
});
test('bytes modified after Graph upload never report verified Approved Plan',async()=>{
 const f=await fixture(),n=network({modified:true});
 await assert.rejects(()=>run(f,n),/SHA-256/);
 assert.equal(n.calls.filter(c=>c.options.method==='PUT').length,1);
});
