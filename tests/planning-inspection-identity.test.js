import test from 'node:test';
import assert from 'node:assert/strict';
import {requirePlanningInspectionIdentity} from '../single-draft-session-storage.js';

test('planning-inspect accepts an actual numeric Monday editor ID',()=>{
 assert.equal(requirePlanningInspectionIdentity({
  createdBy:'msal-home-account-id',editorId:'96423073',
  boardFingerprint:'verified-board-snapshot'}),true);
});
test('planning-inspect refuses empty, malformed and nonnumeric editor IDs',()=>{
 const base={createdBy:'msal-home-account-id',editorId:'96423073',
  boardFingerprint:'verified-board-snapshot'};
 for(const editorId of ['', 'abc','96423x73','-1234',' 96423073','96423073 ']){
  assert.throws(()=>requirePlanningInspectionIdentity({...base,editorId}),
   /szerkeszto/);
 }
 for(const args of [{createdBy:''},{boardFingerprint:''}]){
  assert.throws(()=>requirePlanningInspectionIdentity({...base,...args}),
   /szerkeszto/);
 }
});
