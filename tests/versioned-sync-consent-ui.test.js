import test from 'node:test';
import assert from 'node:assert/strict';
import {requestVersionedSyncConsent} from '../versioned-sync-consent-ui.js';
function setup(){
 const nodes={};
 const doc={createElement(tag){
  const el={id:'',tag,textContent:'',events:{},children:[],removed:false,
   append(...items){this.children.push(...items);},
   setAttribute(){},addEventListener(name,fn){this.events[name]=fn;},
   remove(){this.removed=true;},focus(){},scrollIntoView(){},style:{}};
  (nodes[tag]??=[]).push(el);return el;
 }};
 const host={ownerDocument:doc,children:[],append(el){this.children.push(el);}};
 let onClose;const win={setInterval:()=>5,clearInterval(){},
  addEventListener(name,fn){if(name==='pagehide')onClose=fn;},
  removeEventListener(){}};
 const state={status:'READY_TO_SYNC',verifiedTaskCount:1,remainingTaskCount:1,
  approvedSha256:'a'.repeat(64),approvalReceiptSha256:'b'.repeat(64),
  generationSha256:'c'.repeat(64),
  model:{boardId:'5107075373',version:3,revision:2,changedTaskCount:2}};
 return {nodes,host,win,state,approve:()=>nodes.button[0].events.click(),
  cancel:()=>nodes.button[1].events.click(),close:()=>onClose()};
}
test('V3 real Monday writes need a separate explicit Uploader click',async()=>{
 const f=setup();
 const pending=requestVersionedSyncConsent({host:f.host,state:f.state,
  isCurrent:()=>true,win:f.win});
 assert.match(f.nodes.p[0].textContent,/VALODI Monday TEST/);
 assert.equal(f.host.children.length,1);
 f.approve();assert.equal(await pending,true);
 assert.equal(f.host.children[0].removed,true);
});
test('V3 sync cancel, expired connection or window close must reject permission',async()=>{
 const f=setup();
 const p=requestVersionedSyncConsent({host:f.host,state:f.state,
  isCurrent:()=>true,win:f.win});
 f.cancel();assert.equal(await p,false);
 const g=setup();let active=true;
 const q=requestVersionedSyncConsent({host:g.host,state:g.state,
  isCurrent:()=>active,win:g.win});
 active=false;g.approve();await assert.rejects(q,/megvaltozott/);
 const z=setup();const last=requestVersionedSyncConsent({
  host:z.host,state:z.state,isCurrent:()=>true,win:z.win});
 z.close();await assert.rejects(last,/bezarult/);
});
test('V3 sync consent cannot authorize incomplete Approved, invalid proof or wrong board',async()=>{
 for(const patch of [
  {status:'MANUAL_REVIEW_REQUIRED'}, {generationSha256:'bad'},
  {model:{boardId:'5107075374',version:3,revision:2,changedTaskCount:2}},
  {remainingTaskCount:2}
 ]){
  const f=setup();
  await assert.rejects(requestVersionedSyncConsent({host:f.host,
   state:{...f.state,...patch},isCurrent:()=>true,win:f.win}));
  assert.equal(f.host.children.length,0);
 }
});
