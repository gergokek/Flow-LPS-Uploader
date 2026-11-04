import test from 'node:test';
import assert from 'node:assert/strict';
import {mountApprovedPlanAction} from '../approved-plan-ui.js';

const boardId='5107075373',hash='a'.repeat(64);
const intent={schemaVersion:1,format:'flow-lps-draft-finalization-intent',
 status:'INTENT_ONLY',boardId,version:7,sha256:hash,bytes:1234,
 editorId:'96423073',confirmedAt:new Date().toISOString(),
 isApprovedPlan:false,mondaySyncAllowed:false,approvalEligible:false};
const proof={boardId,version:7,sha256:hash,bytes:1234,
 id:'file-1',eTag:'etag-1',name:'draft-v7-abcdefgh-12345678.json',
 verification:'content-sha256-and-etag'};
const created={status:'APPROVED_PLAN_STORED',
 path:'Projects/'+boardId+'/Approved-Plans/approved-v7-abc.json',
 name:'approved-v7-abc.json',sha256:'b'.repeat(64),
 sourceDraftSha256:hash,eTag:'etag-approved'};
function fixture(save=async()=>created,ask=()=>true){
 const handlers={},button={disabled:true,addEventListener:(n,fn)=>handlers[n]=fn};
 const output={textContent:''};
 const current={boardId,content:'draft-content',
  validated:{version:7,sha256:hash,bytes:1234},saved:proof,
  account:{homeAccountId:'home-id',tenantId:'tenant-id'}};
 const seen=[];
 const control=mountApprovedPlanAction({button,output,getCurrent:()=>current,
  getAccessToken:async account=>{seen.push(account);return 'token';},
  confirm:ask,driveId:'b!drive',tenantId:'tenant-id',save});
 return {button,output,current,control,click:()=>handlers.click(),seen};
}
test('an explicit click and confirmation is required; no Monday write',async()=>{
 let calls=0;
 const f=fixture(async input=>{
  calls++;assert.equal(input.draftText,'draft-content');
  assert.equal(input.intent.version,7);
  assert.equal(input.saved.id,'file-1');
  assert.equal(input.accountTenantId,'tenant-id');
  return created;
 });
 assert.equal(f.button.disabled,true);
 assert.equal(calls,0);
 assert.equal(f.control.receive(intent),true);
 assert.equal(calls,0);
 assert.equal(f.button.disabled,false);
 await f.click();
 assert.equal(calls,1);
 assert.match(f.output.textContent,/Approved Plan létrehozva/);
 assert.match(f.output.textContent,/NEM INDULT EL/);
 assert.equal(f.button.disabled,true);
 assert.equal(f.control.receive(intent),false);
 await f.click();
 assert.equal(calls,1);
});
test('declined confirmation performs no action and can still be confirmed later',async()=>{
 let yes=false,calls=0;
 const f=fixture(async()=>{calls++;return created;},()=>yes);
 f.control.receive(intent);
 await f.click();
 assert.equal(calls,0);
 assert.equal(f.button.disabled,false);
 yes=true;
 await f.click();
 assert.equal(calls,1);
});
test('stale revision or changed Microsoft account forbids creation',async()=>{
 const f=fixture();
 assert.equal(f.control.receive({...intent,version:6}),false);
 assert.equal(f.control.receive(intent),true);
 f.current.account={homeAccountId:'switched',tenantId:'tenant-id'};
 await f.click();
 assert.equal(f.button.disabled,true);
 assert.doesNotMatch(f.output.textContent,/létrehozva/);
 assert.equal(f.control.hasPending(),false);
});
test('Graph failure disables repeat submission and explains uncertain writes',async()=>{
 let calls=0;
 const f=fixture(async()=>{calls++;throw Error('Graph HTTP 403');});
 f.control.receive(intent);
 await f.click();
 assert.equal(calls,1);
 assert.match(f.output.textContent,/Graph HTTP 403/);
 assert.match(f.output.textContent,/Ne próbáld automatikusan újra/);
 await f.click();
 assert.equal(calls,1);
});
test('a new revision during async upload cannot be shown as current success',async()=>{
 let done;
 const f=fixture(()=>new Promise(resolve=>{done=resolve;}));
 f.control.receive(intent);
 const running=f.click();
 f.current.content='changed draft';
 f.control.clear();
 done(created);
 await running;
 assert.doesNotMatch(f.output.textContent,/Approved Plan létrehozva és/);
 assert.match(f.output.textContent,/Ellenőrizd közvetlenül/);
 assert.equal(f.button.disabled,true);
});
