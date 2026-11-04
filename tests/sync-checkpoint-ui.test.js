import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSyncCheckpointAction} from '../sync-checkpoint-ui.js';

const boardId='5107075373',source='a'.repeat(64),approvedHash='b'.repeat(64);
const approved={status:'APPROVED_PLAN_STORED',boardId,version:8,
 sourceDraftSha256:source,sha256:approvedHash,
 name:'approved-v8-'+source.slice(0,24)+'.json'};
const report={schemaVersion:1,format:'flow-lps-sync-preparation-report',
 status:'BOARD_PRECHECK_ONLY',boardId,draftVersion:8,
 approvedPlanSha256:approvedHash,
 mondaySyncAllowed:false,mondayWritten:false,mutationCount:0,
 changedTasks:193,fieldChanges:434};
const result={status:'CHECKPOINT_PREPARED',boardId,
 name:'sync-prepared-v8-'+approvedHash.slice(0,24)+'.json',
 path:'Projects/'+boardId+'/Sync-Status/sync-prepared-v8.json',
 sha256:'c'.repeat(64),eTag:'etag-1',
 verification:'content-sha256-and-etag',mondayWrites:0};
function fixture(save=async()=>result,confirm=()=>true){
 const handlers={},button={disabled:true,addEventListener:(event,handler)=>handlers[event]=handler};
 const output={textContent:''},seen=[];
 const current={boardId,approved,
  validated:{version:8,sha256:source},saved:{version:8,sha256:source},
  account:{homeAccountId:'account-A',tenantId:'tenant-A'}};
 const action=mountSyncCheckpointAction({
  button,output,getCurrent:()=>current,confirm,save,
  driveId:'b!drive',tenantId:'tenant-A',
  getAccessToken:async account=>{seen.push(account.homeAccountId);return 'token-A';}
 });
 return {action,button,output,current,seen,click:()=>handlers.click()};
}
test('only explicit confirmation prepares checkpoint, with zero Monday writes',async()=>{
 let count=0;
 const f=fixture(async args=>{
  count++;
  assert.equal(args.approved.sha256,approvedHash);
  assert.equal(args.report.mutationCount,0);
  assert.equal(args.accountTenantId,'tenant-A');
  assert.equal(await args.getAccessToken(),'token-A');
  assert.equal(args.assertCurrent(),true);
  return result;
 });
 assert.equal(f.button.disabled,true);
 assert.equal(f.seen.length,0);
 assert.equal(f.action.receive(approved,report),true);
 assert.equal(f.button.disabled,false);
 assert.equal(count,0);
 await f.click();
 assert.equal(count,1);
 assert.deepEqual(f.seen,['account-A']);
 assert.match(f.output.textContent,/Monday-írás: 0/);
 assert.match(f.output.textContent,/TILTVA/);
 assert.equal(f.button.disabled,true);
 assert.equal(f.action.receive(approved,report),false);
});
test('declined confirmation cannot request tokens or write checkpoint',async()=>{
 let accepted=false,calls=0;
 const f=fixture(async()=>{calls++;return result;},()=>accepted);
 f.action.receive(approved,report);
 await f.click();
 assert.equal(calls,0);
 assert.equal(f.seen.length,0);
 assert.equal(f.button.disabled,false);
 accepted=true;await f.click();
 assert.equal(calls,1);
});
test('stale version, different account, and untrusted report cannot prepare',async()=>{
 const f=fixture();
 assert.equal(f.action.receive(approved,{...report,mondaySyncAllowed:true}),false);
 assert.equal(f.action.receive(approved,{...report,approvedPlanSha256:'c'.repeat(64)}),false);
 assert.equal(f.action.receive(approved,report),true);
 f.current.validated={version:9,sha256:'c'.repeat(64)};
 await f.click();
 assert.equal(f.button.disabled,true);
 assert.equal(f.seen.length,0);
});
test('session invalidation during asynchronous token retrieval forbids save',async()=>{
 let resolveToken,calls=0;
 const pending=()=>new Promise(r=>{resolveToken=r;});
 const handlers={},button={disabled:true,addEventListener:(event,handler)=>handlers[event]=handler};
 const output={textContent:''};
 const current={boardId,approved,
  validated:{version:8,sha256:source},saved:{version:8,sha256:source},
  account:{homeAccountId:'A',tenantId:'T'}};
 const action=mountSyncCheckpointAction({button,output,getCurrent:()=>current,
  getAccessToken:pending,confirm:()=>true,driveId:'b!drive',tenantId:'T',
  save:async()=>{calls++;return result;}});
 action.receive(approved,report);
 const running=handlers.click();
 current.account={homeAccountId:'B',tenantId:'T'};
 action.clear();
 resolveToken('token');
 await running;
 assert.equal(calls,0);
 assert.doesNotMatch(output.textContent,/Sikeres 0-írásos/);
});
test('failed checkpoint write cannot automatically retry same Approved Plan',async()=>{
 let calls=0;
 const f=fixture(async()=>{calls++;throw Error('Graph timeout');});
 f.action.receive(approved,report);
 await f.click();
 assert.equal(calls,1);
 assert.match(f.output.textContent,/nem igazolt/);
 assert.match(f.output.textContent,/Ne próbáld újra/);
 assert.equal(f.action.receive(approved,report),false);
 await f.click();
 assert.equal(calls,1);
});
