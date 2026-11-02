import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStoredDraft} from '../draft-workspace.js';
const base={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',version:0,history:[],base:{id:'5107075373',tasks:[{id:'123',name:'Test'}]},working:[{id:'123',name:'Test',forecast:{from:'2026-11-03',to:'2026-11-05'}}]};
test('restores stored draft as read-only task preview',()=>{
 const d=inspectStoredDraft(JSON.stringify(base),'5107075373');
 assert.equal(d.taskCount,1);
 assert.deepEqual(d.tasks[0].forecast,{from:'2026-11-03',to:'2026-11-05'});
});
test('rejects foreign or approved snapshots and duplicate tasks',()=>{
 assert.throws(()=>inspectStoredDraft(JSON.stringify(base),'5105949528'),/projektazonosito/);
 assert.throws(()=>inspectStoredDraft(JSON.stringify({...base,status:'APPROVED'}),'5107075373'),/nem-jovahagyott/);
 assert.throws(()=>inspectStoredDraft(JSON.stringify({...base,working:[{id:'456'}]}),'5107075373'),/feladatlista/);
});
