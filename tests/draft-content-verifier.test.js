import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDownloadedDraft} from '../draft-content-verifier.js';
async function fixture(){
 const task={id:'101'};
 const payload=JSON.stringify({schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',version:0,history:[],base:{id:'5107075373',tasks:[task]},working:[task]});
 const bytes=new TextEncoder().encode(payload);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const transferText=JSON.stringify({schemaVersion:1,format:'flow-lps-draft-transfer',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',sha256,payload});
 return {transferText,bytes};
}
test('verifies full downloaded DRAFT bytes',async()=>{
 const f=await fixture();
 const result=await verifyDownloadedDraft({transferText:f.transferText,downloadedBytes:f.bytes,boardId:'5107075373'});
 assert.equal(result.verification,'full-content-sha256');assert.equal(result.taskCount,1);
});
test('rejects tampering and wrong project',async()=>{
 const f=await fixture();const changed=new Uint8Array([...f.bytes,32]);
 await assert.rejects(()=>verifyDownloadedDraft({transferText:f.transferText,downloadedBytes:changed,boardId:'5107075373'}),/nem egyezik/);
 await assert.rejects(()=>verifyDownloadedDraft({transferText:f.transferText,downloadedBytes:f.bytes,boardId:'5105949528'}),/board/);
});
