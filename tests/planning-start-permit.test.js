import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanningStartPermit} from '../planning-start-permit.js';
const sha='a'.repeat(64), now0=Date.parse('2026-11-26T12:00:00Z');
const args={editorId:'96423073',createdBy:'account',executionId:'55555555-5555-4555-8555-555555555555',boardFingerprint:'board',expectedPredecessorSha256:sha,mondayConfirmed:true};
const state={action:'START_NEXT',planVersion:3,boardMatches:true,predecessorCompletionSha256:sha,readOnly:true,mondayWrites:0};
function setup(){let now=now0,current=true;const permit=createPlanningStartPermit({now:()=>now,randomUUID:()=> '44444444-4444-4444-8444-444444444444'});return {permit,setNow:v=>now=v,disconnect:()=>current=false,issue:(confirmed=true)=>permit.issue({state,args,confirmed,isCurrent:()=>current})};}
test('explicit consent creates only a single-use permit; fresh board consumes it',()=>{
 const x=setup(),proof=x.issue();
 assert.equal(proof.status,'START_CONFIRMED_AWAITING_BOARD');
 assert.equal(proof.readOnly,true);assert.equal(proof.mondayWrites,0);
 x.setNow(now0+1000);
 const input={...args,permitId:proof.permitId,boardSnapshot:{id:'5107075373'},boardVerifiedAt:new Date(now0+1000).toISOString()};
 assert.equal(x.permit.consume(input).uploaderConfirmed,true);
 assert.throws(()=>x.permit.consume(input));
});
test('no consent, old board, identity drift, expired permit and disconnect fail closed',()=>{
 assert.throws(()=>setup().issue(false));
 for(const mode of ['old','editor','account','execution','fingerprint','predecessor','expired','disconnect']){
  const x=setup(),proof=x.issue();x.setNow(now0+1000);
  const input={...args,permitId:proof.permitId,boardSnapshot:{id:'5107075373'},boardVerifiedAt:new Date(now0+1000).toISOString()};
  if(mode==='old')input.boardVerifiedAt=new Date(now0-60000).toISOString();
  if(mode==='editor')input.editorId='other';
  if(mode==='account')input.createdBy='other';
  if(mode==='execution')input.executionId='66666666-6666-4666-8666-666666666666';
  if(mode==='fingerprint')input.boardFingerprint='different';
  if(mode==='predecessor')input.expectedPredecessorSha256='b'.repeat(64);
  if(mode==='expired')x.setNow(now0+121000);
  if(mode==='disconnect')x.disconnect();
  assert.throws(()=>x.permit.consume(input),undefined,mode);
  assert.throws(()=>x.permit.consume({...input,...args}));
 }
});

test('V4 and V5 permits are bound to an explicit plan version and cannot be reused',()=>{
 for(const v of [4,5]){
  const x=setup(),s={...state,planVersion:v},a={...args,expectedPlanVersion:v};
  assert.throws(()=>x.permit.issue({state:s,args,confirmed:true,isCurrent:()=>true}));
  const p=x.permit.issue({state:s,args:a,confirmed:true,isCurrent:()=>true});
  assert.equal(p.planVersion,v);
  const input={...a,permitId:p.permitId,boardSnapshot:{id:'5107075373'},boardVerifiedAt:new Date(now0).toISOString()};
  assert.throws(()=>x.permit.consume({...input,expectedPlanVersion:v+1}));
  assert.throws(()=>x.permit.consume(input));
  const fresh=x.permit.issue({state:s,args:a,confirmed:true,isCurrent:()=>true});
  assert.equal(x.permit.consume({...input,permitId:fresh.permitId}).state.planVersion,v);
 }
});
