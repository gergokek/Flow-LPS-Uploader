import test from 'node:test';
import assert from 'node:assert/strict';
import {runPlanningStartFlow} from '../planning-start-flow.js';
const baseline={action:'START_NEXT',planVersion:3,boardMatches:true,
 readOnly:true,mondayWrites:0,predecessorCompletionSha256:'a'.repeat(64)};
const selected={status:'ACTIVE',planVersion:3,revision:0,mondayWrites:0,
 receipt:{sha256:'b'.repeat(64)},versionLabel:'V3'};
const result={action:'START_NEXT',planVersion:3,mondayWrites:0,
 report:{status:'ACTIVE'}};
test('post-consent V3 execution reports all phases and does not check old unselected state after attachment',async()=>{
 const phases=[],writes=[];let current=true;
 const obtained=await runPlanningStartFlow({inspected:baseline,
  isCurrent:()=>current,consent:async()=>true,
  execute:async()=>{writes.push('create');return result;},
  select:async()=>selected,
  attach:async s=>{assert.equal(s,selected);current=false;},
  onPhase:p=>phases.push(p)});
 assert.equal(obtained,selected);
 assert.deepEqual(writes,['create']);
 assert.deepEqual(phases,[
  'WAITING_FOR_UPLOADER_CONFIRMATION','UPLOADER_CONFIRMED',
  'CREATING_OR_VERIFYING_SHAREPOINT','READBACK_OF_V3_RECEIPTS',
  'ACTIVATING_MONDAY_EDITOR','ACTIVE_V3']);
});
test('cancellation or changing account during consent cannot reach a storage writer',async()=>{
 for(const mode of ['cancel','changed']){
  let current=true,attempts=0,phases=[];
  await assert.rejects(runPlanningStartFlow({inspected:baseline,
   isCurrent:()=>current,consent:async()=>{if(mode==='changed')current=false;return mode==='changed';},
   execute:async()=>{attempts++;return result;},select:async()=>selected,
   attach:async()=>{},onPhase:(p,d)=>phases.push({p,d})}),/V3.0 inditas/);
  assert.equal(attempts,0);
  assert.equal(phases.at(-1).p,'FAILED');
  assert.equal(phases.at(-1).d.writeMayHaveStarted,false);
 }
});
test('uncertain write or failed readback must never automatically retry V3 allocation',async()=>{
 for(const phase of ['write','readback','attach']){
  let attempts=0,failed;
  await assert.rejects(runPlanningStartFlow({inspected:baseline,isCurrent:()=>true,
   consent:async()=>true,
   execute:async()=>{attempts++;if(phase==='write')throw Error('Graph response lost');return result;},
   select:async()=>{if(phase==='readback')throw Error('SHA mismatch');return selected;},
   attach:async()=>{if(phase==='attach')throw Error('handoff lost');},
   onPhase:(p,details)=>{if(p==='FAILED')failed=details;}}),
   /Ne inditsd ujra/);
  assert.equal(attempts,1);assert.equal(failed.writeMayHaveStarted,true);
 }
});
test('missing source verification is rejected before any confirmation',async()=>{
 let attempted=false;
 await assert.rejects(runPlanningStartFlow({inspected:{...baseline,boardMatches:false},
  isCurrent:()=>true,consent:async()=>{attempted=true;return true;},
  execute:async()=>result,select:async()=>selected,
  attach:async()=>{}}),/hitelesitett/);
 assert.equal(attempted,false);
});

test('V4/V5 use the same flow and versioned phases; wrong version cannot attach',async()=>{
 for(const v of [4,5]){
  const phases=[],s={...selected,planVersion:v},r={...result,planVersion:v};
  const common={inspected:{...baseline,planVersion:v},isCurrent:()=>true,
   consent:async()=>true,execute:async()=>r,onPhase:p=>phases.push(p)};
  let attachments=0;
  await runPlanningStartFlow({...common,select:async()=>s,attach:async()=>{attachments++;}});
  assert.equal(attachments,1);
  assert.ok(phases.includes('READBACK_OF_V'+v+'_RECEIPTS'));
  assert.equal(phases.at(-1),'ACTIVE_V'+v);
  await assert.rejects(runPlanningStartFlow({...common,select:async()=>selected,
   attach:async()=>{attachments++;}}),/Ne inditsd ujra/);
  assert.equal(attachments,1);
 }
});
