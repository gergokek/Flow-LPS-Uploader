import test from 'node:test';
import assert from 'node:assert/strict';
import {requestPlanningStartConsent} from '../planning-start-consent.js';
function view(){
 const callbacks={},nodes={};
 const doc={createElement:tag=>{
  const e={tag,id:'',textContent:'',children:[],removed:false,events:{},
   ownerDocument:doc,append(...x){this.children.push(...x);},
   addEventListener(type,cb){this.events[type]=cb;},
   setAttribute(){},remove(){this.removed=true;},focus(){},
   scrollIntoView(){}};
  nodes[tag]=(nodes[tag]||[]).concat(e);return e;
 }};
 const host={ownerDocument:doc,children:[],append(n){this.children.push(n);},
  querySelector:()=>null};
 const win={setInterval:()=>2,clearInterval:()=>{},onClose:null,
  addEventListener(type,fn){if(type==='pagehide')this.onClose=fn;},
  removeEventListener(){this.onClose=null;}};
 const state={action:'START_NEXT',planVersion:3,boardMatches:true};
 return {nodes,host,win,state,
  approve:()=>nodes.button[0].events.click(),
  cancel:()=>nodes.button[1].events.click()};
}
test('independent uploader confirmation is explicit and the panel is removed after approval',async()=>{
 const x=view();
 const pending=requestPlanningStartConsent({host:x.host,state:x.state,
  isCurrent:()=>true,win:x.win});
 assert.equal(x.host.children.length,1);
 assert.match(x.nodes.p[0].textContent,/Monday/);
 x.approve();assert.equal(await pending,true);
 assert.equal(x.host.children[0].removed,true);
});
test('cancellation returns false and does not grant authorization',async()=>{
 const x=view();
 const pending=requestPlanningStartConsent({host:x.host,state:x.state,
  isCurrent:()=>true,win:x.win});
 x.cancel();assert.equal(await pending,false);
});
test('changed connection blocks approval and closes dialog',async()=>{
 const x=view();let current=true;
 const pending=requestPlanningStartConsent({host:x.host,state:x.state,
  isCurrent:()=>current,win:x.win});
 current=false;x.approve();await assert.rejects(pending,/megvaltozott/);
});
test('unverified board or non-start state cannot display consent',async()=>{
 for(const state of [{action:'START_NEXT',planVersion:3,boardMatches:false},
  {action:'RESUME_DRAFT',planVersion:3,boardMatches:true},
  {action:'START_NEXT',planVersion:0,boardMatches:true}]){
  const x=view();await assert.rejects(requestPlanningStartConsent({
   host:x.host,state,isCurrent:()=>true,win:x.win}));
  assert.equal(x.host.children.length,0);
 }
});
