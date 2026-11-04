import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSavedDraftForReview} from '../review-ready-preflight.js';
import {validateEditedDraft} from '../edited-draft-validator.js';

const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':
 v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
const boardId='5107075373',driveId='b!testdrive',tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const name='draft-v7-abcdefgh-12345678.json';
const temporaryUrl='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=preauth';
const objectId='e4c642e2-d5c5-40f7-b32c-af82bc281002';
async function fixture(){
 const base={id:boardId,tasks:[{id:'101',name:'Sample'}]};
 const draft={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,
  boardId,base,source:stable({id:boardId,workspaceId:undefined,columns:undefined,groups:undefined,tasks:base.tasks}),
  working:[{id:'101',name:'Sample',forecast:{from:'2026-11-30',to:'2026-11-30'}}],
  version:7,history:Array.from({length:7},(_,i)=>({revision:i+1,type:'edit'}))};
 const draftText=JSON.stringify(draft),summary=await validateEditedDraft(draftText,boardId);
 const saved={boardId,version:7,name,id:'item-123',eTag:'etag-1',verification:'content-sha256-and-etag',
  bytes:summary.bytes,sha256:summary.sha256};
 return {draftText,saved,boardId,driveId,tenantId,accountTenantId:tenantId};
}
function transport(text,{changedETag=false,corrupt=false,meStatus=200}={}){
 let metadataReads=0;const calls=[];
 const fetcher=async(url,options={})=>{
  calls.push({url,options});
  if(url===temporaryUrl){
   const bytes=new TextEncoder().encode(corrupt?text+' ':text);
   return {ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer};
  }
  if(url.includes('/me?'))return {ok:meStatus===200,status:meStatus,json:async()=>({
   id:objectId,displayName:'Example User',userPrincipalName:'example@example.com'
  })};
  if(url.includes('/items/')){
   return {ok:true,json:async()=>({
    id:'item-123',name,size:new TextEncoder().encode(text).length,file:{},
    eTag:changedETag?'etag-2':'etag-1',parentReference:{driveId},
    '@microsoft.graph.downloadUrl':temporaryUrl
   })};
  }
  metadataReads++;
  return {ok:true,json:async()=>({
   id:'item-123',name,size:new TextEncoder().encode(text).length,file:{},
   eTag:changedETag?'etag-2':'etag-1',parentReference:{driveId}
  })};
 };
 return {fetcher,calls,metadataReads:()=>metadataReads};
}
test('independent Graph readback and /me produce review-only result',async()=>{
 const f=await fixture(),t=transport(f.draftText);
 const result=await inspectSavedDraftForReview({...f,getAccessToken:async()=> 'test-token',fetcher:t.fetcher});
 assert.equal(result.status,'REVIEW_PREFLIGHT_BLOCKED');
 assert.equal(result.version,7);
 assert.equal(result.identity.objectId,objectId);
 assert.equal(result.checks.graphContent,'verified-sha256-and-etag');
 assert.equal(result.checks.approverGroupMembership,'not-configured');
 assert.equal(result.eligibleForApproval,false);
 assert.equal(result.isApprovedPlan,false);
 assert.equal(result.mondaySyncAllowed,false);
 assert.equal(t.metadataReads(),2);
 assert.equal(t.calls.filter(x=>x.url===temporaryUrl).length,1);
 assert.equal(t.calls.filter(x=>x.url.includes('/me?')).length,1);
 assert.equal(t.calls.find(x=>x.url===temporaryUrl).options.headers,undefined);
 assert.equal(t.calls.find(x=>x.url===temporaryUrl).options.credentials,'omit');
 assert.ok(t.calls.every(x=>x.options.method!=='PUT'));
 assert.ok(t.calls.every(x=>x.options.method!=='POST'));
});
test('stale saves are blocked without issuing any Graph request',async()=>{
 const f=await fixture();
 for(const change of [{version:6},{sha256:'0'.repeat(64)},{bytes:1},
  {boardId:'222'},{verification:'metadata-only'},{name:'draft-v6-abcdefgh-12345678.json'},
  {eTag:''},{id:''}]){
  const t=transport(f.draftText);
  await assert.rejects(()=>inspectSavedDraftForReview({
   ...f,saved:{...f.saved,...change},getAccessToken:async()=> 'token',fetcher:t.fetcher
  }),/Nincs az aktualis DRAFT/);
  assert.equal(t.calls.length,0);
 }
});
test('changed SharePoint eTag, corrupted bytes and Graph /me rejection fail closed',async()=>{
 const f=await fixture();
 for(const variation of [{changedETag:true},{corrupt:true},{meStatus:403}]){
  const t=transport(f.draftText,variation);
  await assert.rejects(()=>inspectSavedDraftForReview({
   ...f,getAccessToken:async()=> 'token',fetcher:t.fetcher
  }));
 }
});
test('unexpected Entra tenant is rejected, regardless of valid SharePoint content',async()=>{
 const f=await fixture(),t=transport(f.draftText);
 await assert.rejects(()=>inspectSavedDraftForReview({...f,
  accountTenantId:'11111111-1111-4111-8111-111111111111',
  getAccessToken:async()=> 'token',fetcher:t.fetcher}),/tenant/);
});
