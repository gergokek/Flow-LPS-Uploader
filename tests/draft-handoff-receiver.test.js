import test from 'node:test';
import assert from 'node:assert/strict';
import {attachDraftHandoff} from '../draft-handoff-receiver.js';
const nonce='11111111-2222-4333-8444-555555555555';
const protocol='flow-lps-draft-handoff-v1';
const boardId='5107075373',hash='a'.repeat(64),bytes=1234;
function fixture(hashUrl='#draft-handoff='+nonce){
 const listeners=new Map(),posts=[],opener={postMessage:(data,origin)=>posts.push({data,origin})};
 const win={location:{hash:hashUrl},opener,addEventListener:(n,h)=>listeners.set(n,h),
  removeEventListener:(n,h)=>{if(listeners.get(n)===h)listeners.delete(n);}};
 return {win,opener,posts,send:async event=>listeners.get('message')?.(event),active:()=>listeners.has('message')};
}
const valid=()=>({boardId,version:5,sha256:hash,bytes});
const save=extra=>({boardId,version:5,sha256:hash,bytes,verification:'content-sha256-and-etag',
 name:'draft-v5-abcdefgh-12345678.json',itemId:'sp-id',eTag:'etag-v1',...extra});
const transferred=(f,source=f.opener,origin='https://monday.example.com')=>({
 source,origin,data:{protocol,kind:'draft',nonce,boardId,content:'some DRAFT json'}
});
test('receiver acknowledges validated DRAFT, later sends verified receipt to opener origin',async()=>{
 const f=fixture(),received=[];
 const receiver=attachDraftHandoff({win:f.win,onDraft:async x=>{received.push(x);return valid();}});
 assert.equal(receiver.active,true);
 assert.deepEqual(f.posts[0],{data:{protocol,kind:'ready',nonce},origin:'*'});
 await f.send(transferred(f,{}));
 assert.equal(received.length,0);
 await f.send({...transferred(f),data:{protocol,kind:'draft',nonce:'wrong',boardId,content:'test'}});
 assert.equal(received.length,0);
 await f.send(transferred(f));
 assert.deepEqual(received,[{content:'some DRAFT json',boardId,sourceOrigin:'https://monday.example.com'}]);
 assert.equal(f.posts.at(-1).data.kind,'received');
 assert.equal(receiver.publishVerifiedReceipt(save()),true);
 assert.equal(f.posts.at(-1).data.kind,'verified');
 assert.equal(f.posts.at(-1).origin,'https://monday.example.com');
 assert.deepEqual(f.posts.at(-1).data.receipt,{...save(),isApprovedPlan:false,mondaySyncAllowed:false});
 assert.equal(receiver.publishVerifiedReceipt(save()),false);
 assert.equal(f.active(),false);
});
test('receipt refused for wrong board, revision, hash, bytes or unverified upload',async()=>{
 for(const override of [{boardId:'2'},{version:4},{sha256:'0'.repeat(64)},{bytes:1235},
  {verification:'metadata-only'},{name:'draft-v4-abcdefgh-12345678.json'},{eTag:''},{itemId:''}]){
  const f=fixture(),receiver=attachDraftHandoff({win:f.win,onDraft:async()=>valid()});
  await f.send(transferred(f));
  assert.equal(receiver.publishVerifiedReceipt(save(override)),false,JSON.stringify(override));
  assert.equal(f.posts.filter(p=>p.data.kind==='verified').length,0);
  receiver.close();
 }
});
test('invalid source or DRAFT validation failure never sends ACK or receipt',async()=>{
 const f=fixture(),receiver=attachDraftHandoff({win:f.win,onDraft:async()=>{throw Error('bad draft');}});
 await f.send(transferred(f));
 assert.equal(f.posts.length,1);
 assert.equal(receiver.publishVerifiedReceipt(save()),false);
 const absent=fixture('#draft-handoff=wrong');
 assert.equal(attachDraftHandoff({win:absent.win,onDraft:async()=>valid()}).active,false);
});
