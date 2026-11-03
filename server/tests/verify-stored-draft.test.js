import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyStoredDraft} from '../src/verify-stored-draft.js';

const boardId='5107075373',driveId='b!testdrive',fileName='draft-v2-mw0gh0xt-befdfc56-ad4.json';
const payload=Buffer.from(JSON.stringify({status:'DRAFT',version:2,working:[{id:'101'}]}));
const sha256=createHash('sha256').update(payload).digest('hex');
const request=()=>({boardId,fileName,reviewRequest:{
 schemaVersion:1,format:'flow-lps-draft-review-request',status:'REVIEW_REQUEST',
 isApprovedPlan:false,approvalDecision:null,mondaySyncAllowed:false,
 draft:{boardId,version:2,bytes:payload.length,taskCount:1,sha256}
}});
function fakeFetch({content=payload,eTags=['"v1"','"v1"'],redirect='https://tenant.sharepoint.com/download/abc',wrongSize=false}={}){
 const calls=[];let reads=0;
 return {calls,fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url.includes('?$select=')){
   const eTag=eTags[Math.min(reads++,eTags.length-1)];
   return {status:200,json:async()=>({id:'item-10',name:fileName,size:wrongSize?4:payload.length,
    file:{mimeType:'application/json'},parentReference:{driveId},eTag})};
  }
  if(url.endsWith('/content'))return {status:302,headers:{get:k=>k==='location'?redirect:null}};
  return {status:200,headers:{get:k=>k==='content-length'?String(content.length):null},arrayBuffer:async()=>content};
 }};
}
const verify=(body,transport)=>verifyStoredDraft({body,allowedBoardId:boardId,driveId,
 getGraphToken:async()=> 'graph-token',fetcher:transport.fetcher});
test('server reads exact bytes and follows redirect WITHOUT Graph Authorization',async()=>{
 const t=fakeFetch(),result=await verify(request(),t);
 assert.equal(result.checks.graphContent,'passed');
 assert.equal(result.sha256,sha256);
 assert.equal(result.mondaySyncAllowed,false);
 assert.equal(result.eligibleForApproval,false);
 assert.equal(t.calls.length,4);
 assert.equal(t.calls[2].options.headers.Authorization,undefined);
 assert.equal(t.calls[2].url,'https://tenant.sharepoint.com/download/abc');
 assert.equal(t.calls[1].options.headers.Authorization,'Bearer graph-token');
});
test('rejects changed content, different metadata, or changing eTag',async()=>{
 const tamper=fakeFetch({content:Buffer.from(payload.toString().replace('DRAFT','OTHER'))});
 await assert.rejects(()=>verify(request(),tamper),/SHA-256 differs/);
 await assert.rejects(()=>verify(request(),fakeFetch({wrongSize:true})),/metadata mismatch/);
 await assert.rejects(()=>verify(request(),fakeFetch({eTags:['v1','v2']})),/changed during/);
});
test('rejects unauthorized board, approved REVIEW REQUEST, wrong version and unsafe redirect',async()=>{
 await assert.rejects(()=>verify({...request(),boardId:'999'},fakeFetch()),/authorized/);
 const approved=request();approved.reviewRequest.isApprovedPlan=true;
 await assert.rejects(()=>verify(approved,fakeFetch()),/Invalid non-approved/);
 const wrong=request();wrong.fileName='draft-v1-abcdef12345678.json';
 await assert.rejects(()=>verify(wrong,fakeFetch()),/version mismatch/);
 await assert.rejects(()=>verify(request(),fakeFetch({redirect:'http://127.0.0.1/internal'})),/Untrusted/);
});
