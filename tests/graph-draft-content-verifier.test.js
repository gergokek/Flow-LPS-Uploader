import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGraphDraftContent} from '../graph-draft-content-verifier.js';
import {validateEditedDraft} from '../edited-draft-validator.js';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
const boardId='5107075373',driveId='b!testdrive',fileName='draft-v2-mw0gh0xt-befdfc56-ad4.json';
async function fixture(){
 const base={id:boardId,tasks:[{id:'101',name:'Example'}]};
 const draft={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId,base,
 source:stable({id:boardId,workspaceId:undefined,columns:undefined,groups:undefined,tasks:base.tasks}),
 working:[{id:'101',name:'Example',forecast:{from:'2026-11-30',to:'2026-11-30'}}],
 version:2,history:[{revision:1,type:'edit'},{revision:2,type:'edit'}]};
 const text=JSON.stringify(draft),validated=await validateEditedDraft(text,boardId);
 return {text,requestText:JSON.stringify({schemaVersion:1,format:'flow-lps-draft-review-request',status:'REVIEW_REQUEST',
 isApprovedPlan:false,approvalDecision:null,mondaySyncAllowed:false,draft:{...validated}})};
}
function transport(text,{etag='v1',content=text,metadataSize=new TextEncoder().encode(text).length,throwContent=false}={}){
 let metadataReads=0;
 return {fetcher:async(url,options)=>{
  if(url.includes('/content')){
   if(throwContent)throw Error('CORS blocked');
   return {ok:true,headers:{get:()=>String(new TextEncoder().encode(content).length)},arrayBuffer:async()=>new TextEncoder().encode(content).buffer};
  }
  metadataReads++;
  return {ok:true,json:async()=>({id:'item-123',name:fileName,size:metadataSize,file:{mimeType:'application/json'},
   eTag:typeof etag==='function'?etag(metadataReads):etag,parentReference:{driveId}})};
 },reads:()=>metadataReads};
}
test('direct Graph file bytes matching the REVIEW REQUEST yield evidence but not approval',async()=>{
 const f=await fixture(),t=transport(f.text);
 const result=await verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,getAccessToken:async()=> 'token',fetcher:t.fetcher});
 assert.equal(result.checks.graphFileContent,'passed');
 assert.equal(result.checks.downloadProvenance,'graph-authenticated-response');
 assert.equal(result.checks.approverIdentity,'not-verified');
 assert.equal(result.eligibleForApproval,false);
 assert.equal(result.mondaySyncAllowed,false);
 assert.equal(t.reads(),2);
});
test('fails closed when bytes differ or browser blocks Graph content read',async()=>{
 const f=await fixture();
 await assert.rejects(()=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,getAccessToken:async()=> 'token',
  fetcher:transport(f.text,{content:f.text+' '}).fetcher}),/size mismatch/);
 await assert.rejects(()=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,getAccessToken:async()=> 'token',
  fetcher:transport(f.text,{throwContent:true}).fetcher}),/CORS/);
});
test('rejects SharePoint version change and wrong filename or board',async()=>{
 const f=await fixture(),t=transport(f.text,{etag:n=>n===1?'v1':'v2'});
 await assert.rejects(()=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,getAccessToken:async()=> 'token',
  fetcher:t.fetcher}),/changed during/);
 await assert.rejects(()=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName:'draft-v1-abcdef123456.json',
  getAccessToken:async()=> 'token',fetcher:transport(f.text).fetcher}),/filename/);
});
