import test from 'node:test';
import assert from 'node:assert/strict';
import {attachDraftHandoff} from '../draft-handoff-receiver.js';
const nonce='11111111-2222-4333-8444-555555555555';
const protocol='flow-lps-draft-handoff-v1';
function fixture(hash='#draft-handoff='+nonce){
 const listeners=new Map(),posts=[],opener={postMessage:(data,origin)=>posts.push({data,origin})};
 const win={location:{hash},opener,addEventListener:(n,h)=>listeners.set(n,h),
  removeEventListener:(n,h)=>{if(listeners.get(n)===h)listeners.delete(n);}};
 return {win,opener,posts,send:async(event)=>listeners.get('message')?.(event),
  active:()=>listeners.has('message')};
}
test('receiver accepts once from opener, notifies only actual opener origin',async()=>{
 const f=fixture(),received=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async x=>received.push(x)});
 assert.equal(receiver.active,true);
 assert.deepEqual(f.posts[0],{data:{protocol,kind:'ready',nonce},origin:'*'});
 await f.send({source:{},origin:'https://example.com',data:{protocol,kind:'draft',nonce,boardId:'5107075373',content:'test'}});
 assert.equal(received.length,0);
 await f.send({source:f.opener,origin:'https://example.com',data:{protocol,kind:'draft',nonce:'bad',boardId:'5107075373',content:'test'}});
 assert.equal(received.length,0);
 await f.send({source:f.opener,origin:'https://monday.example.com',data:{protocol,kind:'draft',nonce,boardId:'5107075373',content:'test'}});
 assert.deepEqual(received,[{content:'test',boardId:'5107075373',sourceOrigin:'https://monday.example.com'}]);
 assert.equal(f.posts.at(-1).origin,'https://monday.example.com');
 assert.equal(f.posts.at(-1).data.kind,'received');
 assert.equal(f.active(),false);
});
test('invalid or absent handoff never requests a draft',()=>{
 const f=fixture('#draft-handoff=wrong');
 assert.equal(attachDraftHandoff({win:f.win,onDraft:async()=>{}}).active,false);
 assert.equal(f.posts.length,0);
});
test('failed local draft validation never sends ACK or authorizes save',async()=>{
 const f=fixture(),received=[];
 attachDraftHandoff({win:f.win,onDraft:async x=>{received.push(x);throw Error('bad draft');}});
 await f.send({source:f.opener,origin:'https://monday.example.com',data:{protocol,kind:'draft',nonce,boardId:'5107075373',content:'bad'}});
 assert.equal(received.length,1);
 assert.equal(f.posts.length,1);
});
