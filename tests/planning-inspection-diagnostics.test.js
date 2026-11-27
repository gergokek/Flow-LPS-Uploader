import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanningInspectionTrace,safePlanningErrorMessage}
 from '../planning-inspection-diagnostics.js';
test('read-only project inspection reports deterministic V0, V2, catalog and V3 phases',async()=>{
 const observed=[],trace=createPlanningInspectionTrace({onPhase:x=>observed.push(x)});
 const a=await trace.read('V0_APPROVED',async()=>({id:'v0'}));
 const b=await trace.read('V2_SYNC_JOURNAL',async()=>({id:'v2'}));
 const c=await trace.read('VERSION_FOLDER_CATALOG',async()=>({versions:[1,2,3]}));
 assert.equal(a.id,'v0');assert.equal(b.id,'v2');
 assert.deepEqual(c.versions,[1,2,3]);
 assert.deepEqual(observed,['V0_APPROVED','V2_SYNC_JOURNAL','VERSION_FOLDER_CATALOG']);
 assert.equal(trace.phase(),'VERSION_FOLDER_CATALOG');
});
test('failed Graph transport identifies the exact failed read without retry or leaking URLs',async()=>{
 const observed=[];let attempts=0;
 const trace=createPlanningInspectionTrace({onPhase:x=>observed.push(x)});
 await assert.rejects(trace.read('V1_SYNC_JOURNAL',async()=>{
  attempts++;throw new TypeError('Failed to fetch');
 }),/V1_SYNC_JOURNAL.*NETWORK_FETCH_FAILED/);
 assert.equal(attempts,1);
 assert.deepEqual(observed,['V1_SYNC_JOURNAL']);
});
test('diagnostic strips access tokens, Graph URLs and failed reporter exceptions',async()=>{
 assert.doesNotMatch(
  safePlanningErrorMessage(Error('GET https://graph.microsoft.com/path?access_token=topsecret Bearer secret')),
  /topsecret|graph\.microsoft\.com|Bearer secret/);
 const trace=createPlanningInspectionTrace({onPhase:()=>{throw Error('UI unavailable');}});
 assert.equal(await trace.read('V3_SESSION_CHAIN',async()=>false),false);
});
