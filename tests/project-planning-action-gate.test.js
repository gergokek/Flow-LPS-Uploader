import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanningActionGate} from '../project-planning-action-gate.js';
const base={readOnly:true,mondayWrites:0,verifiedVersionCount:2,boardMatches:true,
 status:'READY_TO_START',action:'START_NEXT',planVersion:3,revision:null};
const id='11111111-1111-4111-8111-111111111111';
const options={mondayConfirmed:true,uploaderConfirmed:true,executionId:id,
 boardVerifiedAt:new Date().toISOString(),boardSnapshot:{id:'5107075373'}};
const executor=v=>({inspect:async()=>({status:'ACTIVE',planVersion:v,revision:4}),
 begin:async()=>({status:'ACTIVE',planVersion:v,revision:0,mondayWrites:0})});
test('selects V1, V3 and V5 from state, never hardcodes V2->V3',async()=>{
 for(const version of [1,3,5]){
  let selected=0;
  const gate=createPlanningActionGate({inspectCurrent:async()=>({...base,planVersion:version}),
    storeForVersion:async v=>{selected=v;return executor(v)}});
  const r=await gate.execute(options);
  assert.equal(selected,version);assert.equal(r.planVersion,version);
  assert.equal(r.mondayWrites,0);
 }
});
test('resumes active revision without either start confirmation',async()=>{
 let begins=0;
 const gate=createPlanningActionGate({inspectCurrent:async()=>({...base,
  action:'RESUME_DRAFT',planVersion:2,status:'ACTIVE',revision:4}),
  storeForVersion:async()=>({...executor(2),begin:async()=>{begins++;}})});
 const result=await gate.execute();
 assert.equal(result.action,'RESUME_DRAFT');assert.equal(result.revision,4);
 assert.equal(begins,0);
});
test('requires both confirmations, valid execution id and fresh board',async()=>{
 for(const args of [{...options,mondayConfirmed:false},
   {...options,uploaderConfirmed:false},{...options,executionId:'bad'},
   {...options,boardVerifiedAt:'2020-01-01T00:00:00Z'}]){
  let called=0;
  const gate=createPlanningActionGate({inspectCurrent:async()=>base,
   storeForVersion:async()=>{called++;return executor(3)}});
  await assert.rejects(gate.execute(args));
  assert.equal(called,0);
 }
});
test('changing state after consent prevents new session write',async()=>{
 let scanned=0,writes=0;
 const gate=createPlanningActionGate({inspectCurrent:async()=>{
  scanned++;return scanned===1?base:{...base,status:'ACTIVE',action:'RESUME_DRAFT'};
 },storeForVersion:async()=>({...executor(3),begin:async()=>{writes++;}})});
 await assert.rejects(gate.execute(options),/changed/);
 assert.equal(writes,0);
});
test('partial synchronization or unknown V4 engine never falls back to older plan',async()=>{
 const pending=createPlanningActionGate({inspectCurrent:async()=>({...base,
  action:'CONTINUE_FINALIZATION',status:'FINALIZING'}),
  storeForVersion:async()=>{throw Error('should never be called')}});
 await assert.rejects(pending.execute(options)); 
 const unsupported=createPlanningActionGate({inspectCurrent:async()=>({...base,planVersion:4}),
  storeForVersion:async()=>null});
 await assert.rejects(unsupported.execute(options),/No fully verified/);
});
test('ambiguous write response blocks another operation on the same gate instance',async()=>{
 let count=0;
 const gate=createPlanningActionGate({inspectCurrent:async()=>base,
  storeForVersion:async()=>({...executor(3),begin:async()=>{count++;throw Error('lost acknowledgement')}})});
 await assert.rejects(gate.execute(options),/lost acknowledgement/);
 await assert.rejects(gate.execute(options),/Uncertain planning write/);
 assert.equal(count,1);
});
test('verified incomplete cycle can only use recover, never begin()',async()=>{
 let begins=0,recovered=0;
 const gate=createPlanningActionGate({inspectCurrent:async()=>({...base,
  action:'RECOVER_SAME_SESSION',status:'INCOMPLETE'}),
  storeForVersion:async()=>({...executor(3),begin:async()=>{begins++;},
  recover:async()=>{recovered++;return {planVersion:3,status:'ACTIVE'}}})});
 const r=await gate.execute();
 assert.equal(r.action,'RECOVER_SAME_SESSION');assert.equal(recovered,1);
 assert.equal(begins,0);
});

test('Approved V0-only project starts V1 with no existing version count',async()=>{
 let selected;
 const gate=createPlanningActionGate({inspectCurrent:async()=>({...base,
  planVersion:1,verifiedVersionCount:0}),
  storeForVersion:async version=>{selected=version;return executor(version)}});
 const result=await gate.execute(options);
 assert.equal(selected,1);assert.equal(result.planVersion,1);
});
