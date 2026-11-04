import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSavedDraftReview} from '../review-preflight-ui.js';
const hash='a'.repeat(64),boardId='5107075373';
const proof={boardId,version:7,sha256:hash,bytes:1234,name:'draft-v7-abcdefgh-12345678.json',
 id:'item',eTag:'etag',verification:'content-sha256-and-etag'};
const approvedResult={version:7,sha256:hash,identity:{userPrincipalName:'user@example.com',objectId:'oid'},
 eligibleForApproval:false,mondaySyncAllowed:false};
function ui(customInspect=async()=>approvedResult){
 const handlers={};const button={disabled:true,addEventListener:(name,fn)=>{handlers[name]=fn;}};
 const output={textContent:''};
 const current={boardId,account:{tenantId:'t',homeAccountId:'h'},content:'draft-content',
  validated:{version:7,sha256:hash,bytes:1234}};
 const control=mountSavedDraftReview({button,output,getCurrent:()=>current,
  getAccessToken:async()=> 'token',tenantId:'t',driveId:'b!drive',inspect:customInspect});
 return {button,output,current,control,click:()=>handlers.click()};
}
test('preflight stays disabled without an exact verified saved version',async()=>{
 const f=ui();
 assert.equal(f.button.disabled,true);
 assert.equal(f.control.record({...proof,sha256:'b'.repeat(64)},7,hash,f.current.content),false);
 assert.equal(f.button.disabled,true);
 assert.equal(f.control.record(proof,7,hash,f.current.content),true);
 assert.equal(f.button.disabled,false);
 await f.click();
 assert.match(f.output.textContent,/SIKERES/);
 assert.match(f.output.textContent,/Jóváhagyás: TILTVA/);
 assert.match(f.output.textContent,/Monday-szinkron: TILTVA/);
});
test('a revision during verification invalidates the pending result',async()=>{
 let resolve;
 const inspect=()=>new Promise(r=>{resolve=r;});
 const f=ui(inspect);
 f.control.record(proof,7,hash,f.current.content);
 const checking=f.click();
 f.current.content='another revision';
 f.current.validated={version:8,sha256:'b'.repeat(64),bytes:1250};
 f.control.clear();
 resolve(approvedResult);
 await checking;
 assert.doesNotMatch(f.output.textContent,/SIKERES/);
 assert.equal(f.button.disabled,true);
});
test('Graph or Entra failure is always displayed as blocked',async()=>{
 const f=ui(async()=>{throw Error('Graph HTTP 403');});
 f.control.record(proof,7,hash,f.current.content);
 await f.click();
 assert.match(f.output.textContent,/Graph HTTP 403/);
 assert.match(f.output.textContent,/továbbra is tiltva/);
});
test('switching Microsoft account during verification does not claim success',async()=>{
 let resolve;const f=ui(()=>new Promise(r=>{resolve=r;}));
 f.control.record(proof,7,hash,f.current.content);
 const checking=f.click();
 f.current.account={tenantId:'t',homeAccountId:'other-user'};
 resolve(approvedResult);
 await checking;
 assert.doesNotMatch(f.output.textContent,/SIKERES/);
});
