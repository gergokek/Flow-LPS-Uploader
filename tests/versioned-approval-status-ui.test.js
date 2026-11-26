import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeVersionedApprovalInventory,versionedApprovalInventoryMessage}
 from '../versioned-approval-status-ui.js';
const boardId='5107075373',planVersion=3;
const file=name=>({name,id:'id-'+name,eTag:'etag-'+name});
const data=()=>({boardId,planVersion,sessionFiles:[],draftFiles:[],
 approvedFiles:[],syncFiles:[]});
test('V3 inventory panel is read-only and never approves based on a filename',()=>{
 const args=data(),empty=summarizeVersionedApprovalInventory(args);
 assert.equal(empty.status,'NO_SESSION');
 assert.equal(empty.mondayWrites,0);
 args.sessionFiles.push(file('version-info.json'),file('active-session-v3.json'),
  file('session-v3-freeze.json'),file('session-v3-approved.json'));
 args.draftFiles.push(file('draft-v3.json'),file('draft-v3-r000001.json'));
 args.approvedFiles.push(file('approved-v3.json'));
 const approved=summarizeVersionedApprovalInventory(args);
 assert.equal(approved.status,'APPROVAL_FILES_REQUIRE_VERIFICATION');
 assert.equal(approved.approvalVerified,false);
 assert.equal(approved.syncVerified,false);
 assert.match(versionedApprovalInventoryMessage(approved),/nem igazolt/);
 args.syncFiles.push(file('sync-v3-completed.json'));
 assert.equal(summarizeVersionedApprovalInventory(args).status,
  'SYNC_FILES_REQUIRE_VERIFICATION');
});
test('unknown Sync files or mixed projects are rejected fail-closed',()=>{
 assert.throws(()=>summarizeVersionedApprovalInventory({
  ...data(),syncFiles:[file('legacy-v2.json')]}));
 assert.throws(()=>summarizeVersionedApprovalInventory({
  ...data(),boardId:'5107075374'}));
 assert.throws(()=>summarizeVersionedApprovalInventory({
  ...data(),sessionFiles:[file('version-info.json'),file('version-info.json')]}));
 assert.throws(()=>summarizeVersionedApprovalInventory({
  ...data(),draftFiles:[file('draft-v2.json')]}));
});
test('V3 incomplete session is not treated as active',()=>{
 const r=summarizeVersionedApprovalInventory({
  ...data(),sessionFiles:[file('version-info.json')]});
 assert.equal(r.status,'INCOMPLETE_REQUIRES_REVIEW');
 assert.equal(r.readOnly,true);
});
