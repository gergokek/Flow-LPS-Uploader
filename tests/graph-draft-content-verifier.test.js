import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGraphDraftContent} from '../graph-draft-content-verifier.js';
import {validateEditedDraft} from '../edited-draft-validator.js';

const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
const boardId='5107075373',driveId='b!testdrive',fileName='draft-v2-mw0gh0xt-befdfc56-ad4.json';
const temporaryUrl='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=preauth';
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
function transport(text,{etag='v1',content=text,metadataSize=new TextEncoder().encode(text).length,downloadUrl=temporaryUrl,throwDownload=false}={}){
 let metadataReads=0;
 const calls=[];
 return {fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url===temporaryUrl || url===downloadUrl){
   if(throwDownload)throw Error('CORS blocked');
   return {ok:true,headers:{get:()=>String(new TextEncoder().encode(content).length)},
    arrayBuffer:async()=>new TextEncoder().encode(content).buffer};
  }
  if(!url.startsWith('https://graph.microsoft.com/'))throw Error('Unexpected network request');
  if(url.includes('/items/')){
   return {ok:true,json:async()=>({id:'item-123',name:fileName,size:metadataSize,file:{mimeType:'application/json'},
    eTag:typeof etag==='function'?etag(metadataReads):etag,parentReference:{driveId},
    '@microsoft.graph.downloadUrl':downloadUrl})};
  }
  metadataReads++;
  return {ok:true,json:async()=>({id:'item-123',name:fileName,size:metadataSize,file:{mimeType:'application/json'},
   eTag:typeof etag==='function'?etag(metadataReads):etag,parentReference:{driveId},
   '@microsoft.graph.downloadUrl':downloadUrl})};
 },reads:()=>metadataReads,calls};
}
const verify=(f,t)=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,
 getAccessToken:async()=> 'graph-access-token',fetcher:t.fetcher});
test('preauthenticated SharePoint URL is used without Graph Authorization or cookies',async()=>{
 const f=await fixture(),t=transport(f.text);
 const result=await verify(f,t);
 assert.equal(result.checks.graphFileContent,'passed');
 assert.equal(result.checks.downloadProvenance,'graph-authenticated-response');
 assert.equal(result.eligibleForApproval,false);
 assert.equal(result.mondaySyncAllowed,false);
 assert.equal(t.reads(),2);
 assert.equal(t.calls.length,4);
 assert.match(t.calls[0].url,/Draft-Plans/);
 assert.match(t.calls[1].url,/\/items\/item-123$/);
 assert.equal(t.calls[0].options.headers.Authorization,'Bearer graph-access-token');
 assert.equal(t.calls[2].url,temporaryUrl);
 assert.equal(t.calls[2].options.headers,undefined);
 assert.equal(t.calls[2].options.credentials,'omit');
 assert.equal(t.calls[2].options.referrerPolicy,'no-referrer');
 assert.ok(t.calls.every(c=>!c.url.includes('/content')));
});
test('mismatched size or CORS failure cannot generate evidence',async()=>{
 const f=await fixture();
 await assert.rejects(()=>verify(f,transport(f.text,{content:f.text+' '})),/size mismatch/);
 await assert.rejects(()=>verify(f,transport(f.text,{throwDownload:true})),/CORS/);
});
test('rejects changed eTag, wrong version and untrusted preauthenticated host',async()=>{
 const f=await fixture();
 await assert.rejects(()=>verify(f,transport(f.text,{etag:n=>n===1?'v1':'v2'})),/changed during/);
 await assert.rejects(()=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,
  fileName:'draft-v1-abcdef123456.json',getAccessToken:async()=> 'token',
  fetcher:transport(f.text).fetcher}),/filename/);
 await assert.rejects(()=>verify(f,transport(f.text,{downloadUrl:'https://example.org/untrusted'})),/untrusted/);
 await assert.rejects(()=>verify(f,transport(f.text,{downloadUrl:'http://127.0.0.1/internal'})),/untrusted/);
});

test('returns exact SharePoint bytes to TEST importer only after full verification',async()=>{
 const f=await fixture(),t=transport(f.text);
 let content=null;
 const evidence=await verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,
  getAccessToken:async()=> 'graph-access-token',fetcher:t.fetcher,
  onVerifiedDraft:text=>{content=text;}});
 assert.equal(content,f.text);
 assert.equal(evidence.sharePoint.name,fileName);
 assert.equal(evidence.checks.graphFileContent,'passed');
 assert.equal(Object.prototype.hasOwnProperty.call(evidence,'verifiedDraftText'),false);
});
test('never releases DRAFT on corrupted content, eTag conflict or unauthorized host',async()=>{
 const f=await fixture();
 for(const options of [{content:f.text+' '},{etag:n=>n===1?'v1':'v2'},{downloadUrl:'https://attacker.example.com/file'}]){
  let released=false;
  await assert.rejects(()=>verifyGraphDraftContent({requestText:f.requestText,boardId,driveId,fileName,
   getAccessToken:async()=> 'graph-access-token',fetcher:transport(f.text,options).fetcher,
   onVerifiedDraft:()=>{released=true;}}));
  assert.equal(released,false);
 }
});
