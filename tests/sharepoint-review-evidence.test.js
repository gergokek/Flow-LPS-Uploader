import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEditedDraft} from '../edited-draft-validator.js';
import {prepareSharePointReviewEvidence} from '../sharepoint-review-evidence.js';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
const boardId='5107075373',driveId='b!testdrive';
async function fixture(){
 const base={id:boardId,tasks:[{id:'101',name:'First'}]};
 const d={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,
 boardId,base,source:stable({id:base.id,workspaceId:base.workspaceId,columns:base.columns,groups:base.groups,tasks:base.tasks}),
 working:[{id:'101',name:'First',forecast:{from:'2026-11-30',to:'2026-11-30'}}],
 version:2,history:[{revision:1,type:'edit'},{revision:2,type:'edit'}]};
 const text=JSON.stringify(d),bytes=new TextEncoder().encode(text),valid=await validateEditedDraft(text,boardId);
 const request={schemaVersion:1,format:'flow-lps-draft-review-request',status:'REVIEW_REQUEST',
 isApprovedPlan:false,approvalDecision:null,mondaySyncAllowed:false,
 draft:{boardId,version:2,taskCount:valid.taskCount,bytes:valid.bytes,sha256:valid.sha256}};
 return {requestText:JSON.stringify(request),draftBytes:bytes,boardId,driveId,
 fileName:'draft-v2-mw0gh0xt-befdfc56-ad4.json',getAccessToken:async()=> 'test'};
}
test('evidence requires digest match plus Graph metadata and never approves',async()=>{
 const f=await fixture();
 const evidence=await prepareSharePointReviewEvidence({...f,fetcher:async(url,options)=>{
  assert.match(url,/Draft-Plans/);assert.equal(options.method,'GET');
  return {ok:true,json:async()=>({id:'item-1',name:f.fileName,size:f.draftBytes.length,file:{mimeType:'application/json'},parentReference:{driveId}})};
 }});
 assert.equal(evidence.checks.reviewRequestMatch,'passed');
 assert.equal(evidence.checks.graphFileContent,'not-verified');
 assert.equal(evidence.eligibleForApproval,false);
 assert.equal(evidence.mondaySyncAllowed,false);
});
test('rejects mismatched local bytes and foreign Graph item',async()=>{
 const f=await fixture();
 await assert.rejects(()=>prepareSharePointReviewEvidence({...f,draftBytes:new TextEncoder().encode('tampered')}));
 await assert.rejects(()=>prepareSharePointReviewEvidence({...f,fetcher:async()=>({ok:true,json:async()=>({id:'x',name:f.fileName,size:1,file:{},parentReference:{driveId}})})}),/metadata differs/);
});
