import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionDraftAutosave} from '../draft-session-autosave.js';

const sha='a'.repeat(64);
function clock(){const tasks=new Map();let seq=0;return {tasks,schedule:f=>{tasks.set(++seq,f);return seq;},
 cancel:key=>tasks.delete(key)};}
const draft=(version)=>({version,sha256:sha,content:JSON.stringify({version})});
test('autosave requires explicit opt-in and coalesces unsaved revisions',async()=>{
 const timer=clock(),saves=[];
 const session=createSessionDraftAutosave({schedule:timer.schedule,cancel:timer.cancel,
  save:async item=>{saves.push(item.version);return {version:item.version,sha256:item.sha256,
   verification:'content-sha256-and-etag'};}});
 assert.equal(session.enqueue(draft(6)),false);
 session.enable();
 assert.equal(session.enqueue(draft(6)),true);
 assert.equal(session.enqueue(draft(7)),true);
 assert.equal(timer.tasks.size,1);
 await session.flush();
 assert.deepEqual(saves,[7]);
 assert.equal(session.state().savedRevision,7);
 assert.equal(session.state().enabled,true);
 session.disable();
 assert.equal(session.enqueue(draft(8)),false);
 session.stop();
});
test('failed Graph verification halts automatic saves without retries',async()=>{
 const timer=clock();let calls=0;
 const session=createSessionDraftAutosave({schedule:timer.schedule,cancel:timer.cancel,
  save:async item=>{calls++;throw Error('CORS/network or unverified upload');}});
 session.enable();session.enqueue(draft(6));
 await session.flush();
 assert.equal(calls,1);
 assert.equal(session.state().enabled,false);
 assert.equal(session.state().pendingRevision,null);
 assert.match(session.state().error,/CORS/);
 assert.equal(timer.tasks.size,0);
 assert.equal(session.enqueue(draft(7)),false);
 session.stop();
});
test('mismatched receipt cannot be treated as verified',async()=>{
 const session=createSessionDraftAutosave({save:async item=>({version:item.version,
  sha256:'b'.repeat(64),verification:'metadata-only'})});
 session.enable();session.enqueue(draft(6));await session.flush();
 assert.equal(session.state().savedRevision,0);
 assert.equal(session.state().enabled,false);
 assert.match(session.state().error,/verification/);
 session.stop();
});
