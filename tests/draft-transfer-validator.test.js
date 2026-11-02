import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDraftTransfer} from '../draft-transfer-validator.js';
async function example(){
 const task={id:'101'};
 const payload=JSON.stringify({schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',version:0,history:[],base:{id:'5107075373',tasks:[task]},working:[task]});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
 const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {schemaVersion:1,format:'flow-lps-draft-transfer',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',sha256,payload};
}
test('accepts a matching unapproved draft transfer',async()=>{
 const value=await example();
 const checked=await validateDraftTransfer(JSON.stringify(value),{expectedBoardId:'5107075373'});
 assert.equal(checked.taskCount,1);assert.equal(checked.isApprovedPlan,false);
});
test('rejects changed payload and foreign project',async()=>{
 const value=await example();
 await assert.rejects(()=>validateDraftTransfer(JSON.stringify({...value,payload:value.payload+' '}),{expectedBoardId:'5107075373'}),/SHA-256/);
 await assert.rejects(()=>validateDraftTransfer(JSON.stringify(value),{expectedBoardId:'5105949528'}),/board/);
});
