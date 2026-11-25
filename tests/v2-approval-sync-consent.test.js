import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestV2FlowConsent} from '../v2-approval-sync-consent.js';
function fixture(){
 const doc={title:'Original',createElement(tag){return new Element(tag);}};
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.handlers={};this.disabled=false;this.style={};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  setAttribute(){} addEventListener(name,fn){this.handlers[name]=fn;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  scrollIntoView(){} focus(){doc.focused=this;} click(){this.handlers.click?.();}
 }
 const events={},timers=new Map();let serial=0;
 const win={setInterval(fn){timers.set(++serial,fn);return serial;},clearInterval(id){timers.delete(id);},
  addEventListener(k,f){events[k]=f;},removeEventListener(k,f){if(events[k]===f)delete events[k];},
  confirm(){throw Error('Native confirmation must never be used.');}};
 const host=doc.createElement('section');let current=true;
 const report={status:'READY_TO_SYNC',verifiedTaskCount:1,remainingTaskCount:49,changedTaskCount:50,ledgerSha256:'a'.repeat(64)};
 const state={status:'DRAFT_READY',verifiedTaskCount:0,remainingTaskCount:1,model:{revision:1,changedTaskCount:1,fieldCount:1,targets:[{taskName:'Task <test>',taskId:'101',fields:{note:{before:'',after:'A'}}}]}};
 const args={host,win,state,isCurrent:()=>current};
 const buttons=()=>{const p=host.children[0];return {approve:p.children[3],cancel:p.children[4]};};
 return {args,doc,host,events,timers,buttons,invalidate:()=>{current=false;}};
}

test('V2 approval and sync consent waits, focuses heading and accepts once with exact preview',async()=>{
 const f=fixture();let completed=0;
 const p=requestV2FlowConsent(f.args).then(x=>{completed++;return x;});await Promise.resolve();
 assert.equal(completed,0);assert.equal(f.doc.focused.tagName,'h3');
 assert.match(f.host.children[0].children[2].textContent,/Task <test> \(#101\)/);
 const b=f.buttons();b.approve.click();b.approve.click();assert.equal(await p,true);assert.equal(completed,1);
 assert.equal(f.timers.size,0);assert.equal(f.host.children.length,0);
});
test('V2 approval consent cancellation never authorizes',async()=>{
 const f=fixture(),p=requestV2FlowConsent(f.args);f.buttons().cancel.click();assert.equal(await p,false);
});
for(const mode of ['before','poll','click','close'])test('V2 approval consent blocks '+mode+' context loss',async()=>{
 const f=fixture();if(mode==='before')f.invalidate();const p=requestV2FlowConsent(f.args);
 if(mode==='close')f.events.pagehide();
 else if(mode!=='before'){f.invalidate();if(mode==='poll')[...f.timers.values()][0]();else f.buttons().approve.click();}
 await assert.rejects(p);assert.equal(f.timers.size,0);assert.equal(f.host.children.length,0);
});
test('V2 approval timeout is checked even if a tab timer was suspended',async()=>{
 const f=fixture(),p=requestV2FlowConsent({...f.args,timeoutMs:1});await new Promise(r=>setTimeout(r,5));
 f.buttons().approve.click();await assert.rejects(p,/lejart/);
});
test('V2 approval cannot replace a pending panel',async()=>{
 const f=fixture(),p=requestV2FlowConsent(f.args);await assert.rejects(requestV2FlowConsent(f.args));
 f.buttons().cancel.click();assert.equal(await p,false);
});
for(const bad of [{timeoutMs:0},{timeoutMs:300001},{state:{status:'V2_SYNC_COMPLETED'}},
 {state:{status:'MANUAL_REVIEW_REQUIRED'}},{state:{status:'READY_TO_SYNC',model:{changedTaskCount:1},verifiedTaskCount:0,remainingTaskCount:2}}])
 test('V2 approval rejects malformed or ineligible summary '+JSON.stringify(bad),async()=>{
  const f=fixture();await assert.rejects(requestV2FlowConsent({...f.args,...bad}));assert.equal(f.host.children.length,0);
 });
test('V2 no-change closure requires explicit consent too',async()=>{
 const f=fixture();f.args.state.remainingTaskCount=0;f.args.state.model.changedTaskCount=0;f.args.state.model.targets=[];
 const p=requestV2FlowConsent(f.args);f.buttons().approve.click();assert.equal(await p,true);
});
test('V2 consent module has no network, HTML injection or native confirm',()=>{
 const src=readFileSync(new URL('../v2-approval-sync-consent.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|\.confirm\s*\(|\.innerHTML\s*=|\.open\s*\(/);
});
