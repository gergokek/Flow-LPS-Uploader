import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSingleDraftSessionBridge} from './single-draft-session-bridge.js';

const boardId='5107075373',
 nonce='11111111-1111-4111-8111-111111111111',
 sessionId='22222222-2222-4222-8222-222222222222',
 protocol='mflow-single-draft-session-v1';
const ready=()=>{
 let handler,revCalls=0;
 const sent=[];
 const opener={postMessage:(payload,origin)=>sent.push({payload,origin})};
 const win={opener,location:{hash:'#mflow-session='+nonce+'&board='+boardId},
  addEventListener:(e,fn)=>handler=fn,removeEventListener:()=>{}};
 const bridge=attachSingleDraftSessionBridge({win,
  onSaveRevision:async({draft})=>{
   revCalls++;
   return {status:'SAVED',sessionId,revision:draft.version,
    receipt:{name:'draft-v1-r000001.json',sha256:'f'.repeat(64),
     eTag:'etag',verification:'content-sha256-and-etag'}};
  }});
 const emit=(kind,extras={},origin='https://monday-test.example')=>
  handler({source:opener,origin,data:{protocol,nonce,boardId,kind,...extras}});
 const selected={status:'ACTIVE',boardId,sessionId,revision:0,
  versionLabel:'V1',draft:{boardId,version:0,
   session:{sessionId,planVersion:1,revision:0}},
  receipt:{sha256:'a'.repeat(64),eTag:'origin',
   verification:'content-sha256-and-etag'}};
 return {bridge,emit,sent,selected,calls:()=>revCalls};
};
test('refuses to send DRAFT before origin-bound hello',()=>{
 const a=ready();
 assert.equal(a.bridge.selected(a.selected),false);
 assert.equal(a.bridge.ready(),false);
 a.emit('hello',{},'http://unsafe.example');
 assert.equal(a.bridge.ready(),false);
 a.emit('hello');
 assert.equal(a.bridge.ready(),true);
 assert.equal(a.bridge.selected(a.selected),true);
 assert.ok(a.sent.some(x=>x.payload.kind==='session-selected'&&
  x.origin==='https://monday-test.example'));
 a.bridge.close();
});
test('only the next revision from selected session is persisted',async()=>{
 const a=ready();a.emit('hello');assert.equal(a.bridge.selected(a.selected),true);
 await a.emit('save-revision',{requestId:'44444444-4444-4444-8444-444444444444',
  draft:{boardId,version:2,session:{sessionId}}});
 assert.equal(a.calls(),0);
 await a.emit('save-revision',{requestId:'44444444-4444-4444-8444-444444444444',
  draft:{boardId,version:1,session:{sessionId}}});
 assert.equal(a.calls(),1);
 assert.ok(a.sent.some(x=>x.payload.kind==='revision-saved'&&
  x.payload.revision===1));
 await a.emit('save-revision',{requestId:'55555555-5555-4555-8555-555555555555',
  draft:{boardId,version:1,session:{sessionId}}});
 assert.equal(a.calls(),1);
 a.bridge.close();
});
