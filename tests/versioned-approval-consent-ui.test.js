import test from 'node:test';
import assert from 'node:assert/strict';
import {requestVersionedApprovalConsent} from '../versioned-approval-consent-ui.js';

const hash='a'.repeat(64);
function fixture(){
 const nodes={};
 const doc={createElement:tag=>{
  const elem={tag,id:'',textContent:'',events:{},children:[],removed:false,
   append(...children){this.children.push(...children);},
   addEventListener(name,callback){this.events[name]=callback;},
   setAttribute(){},remove(){this.removed=true;},focus(){},scrollIntoView(){}};
  (nodes[tag]??=[]).push(elem);
  return elem;
 }};
 const host={ownerDocument:doc,children:[],append(node){this.children.push(node);}};
 let close;
 const win={setInterval:()=>42,clearInterval:()=>{},addEventListener:(key,fn)=>{if(key==='pagehide')close=fn;},
  removeEventListener:()=>{}};
 const summary={planVersion:3,revision:2,status:'DRAFT_READY',
  changedTaskCount:3,fieldChangeCount:4,sourceDraftSha256:hash,
  generationSha256:hash};
 return {host,summary,win,nodes,approve:()=>nodes.button[0].events.click(),
  cancel:()=>nodes.button[1].events.click(),close:()=>close()};
}
test('V3 Uploader approval needs explicit second click and never grants board writes',async()=>{
 const x=fixture();
 const pending=requestVersionedApprovalConsent({
  host:x.host,summary:x.summary,isCurrent:()=>true,win:x.win});
 assert.equal(x.host.children.length,1);
 assert.match(x.nodes.p[1].textContent,/Monday-feladat iras: 0/);
 x.approve();assert.equal(await pending,true);
 assert.equal(x.host.children[0].removed,true);
});
test('V3 approval cancellation, window close or changed identity never consents',async()=>{
 const x=fixture();
 const pending=requestVersionedApprovalConsent({host:x.host,summary:x.summary,
  isCurrent:()=>true,win:x.win});
 x.cancel();assert.equal(await pending,false);
 const y=fixture();
 const waiting=requestVersionedApprovalConsent({host:y.host,summary:y.summary,
  isCurrent:()=>true,win:y.win});
 y.close();await assert.rejects(waiting,/bezarult/);
 const z=fixture();let current=true;
 const p=requestVersionedApprovalConsent({host:z.host,summary:z.summary,
  isCurrent:()=>current,win:z.win});
 current=false;z.approve();await assert.rejects(p,/megvaltozott/);
});
test('unverified revision, SHA or source cannot open approval UI',async()=>{
 for(const override of [{status:'APPROVAL_INCOMPLETE'},
   {sourceDraftSha256:'bad'},{planVersion:2},{changedTaskCount:-1}]){
  const x=fixture();
  await assert.rejects(requestVersionedApprovalConsent({
   host:x.host,summary:{...x.summary,...override},
   isCurrent:()=>true,win:x.win}));
  assert.equal(x.host.children.length,0);
 }
});
