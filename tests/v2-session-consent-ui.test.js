import test from 'node:test';
import assert from 'node:assert/strict';
import {requestV2SessionConsent} from '../v2-session-consent-ui.js';
function fixture(){
 const doc={createElement(tag){return new Element(tag);}};
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.handlers={};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  querySelector(selector){return this.children.find(n=>'#'+n.id===selector)||null;}
  setAttribute(){} addEventListener(n,fn){this.handlers[n]=fn;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  scrollIntoView(){} focus(){doc.focus=this;} click(){this.handlers.click?.();}
 }
 let current=true;const timers=new Set(),events={};
 const win={setInterval(fn){timers.add(fn);return fn;},clearInterval(fn){timers.delete(fn);},
  addEventListener(k,fn){events[k]=fn;},removeEventListener(k,fn){if(events[k]===fn)delete events[k];},
  confirm(){throw Error('No native dialog');}};
 const host=doc.createElement('div'),report={status:'V2_READY_TO_START',taskCount:193,
  evidence:{final:{document:{reconciliations:[{approvedNote:'Sample ',observedNote:'Sample'}]}}}};
 return {args:{host,win,report,isCurrent:()=>current},timers,events,doc,host,
  buttons:()=>({approve:host.children[0].children[2],cancel:host.children[0].children[3]}),
  invalidate:()=>current=false};
}
test('V2 consent waits for click, focuses heading and accepts once without native dialog',async()=>{
 const f=fixture();let resolved=false;const p=requestV2SessionConsent(f.args).then(v=>{resolved=true;return v;});
 await Promise.resolve();assert.equal(resolved,false);assert.equal(f.doc.focus.tagName,'h3');
 const b=f.buttons();b.approve.click();b.approve.click();assert.equal(await p,true);
 assert.equal(f.host.children.length,0);assert.equal(f.timers.size,0);assert.equal(f.events.pagehide,undefined);
});
test('V2 consent cancellation is not approval',async()=>{const f=fixture(),p=requestV2SessionConsent(f.args);
 f.buttons().cancel.click();assert.equal(await p,false);assert.equal(f.timers.size,0);});
for(const mode of ['before','poll','click','close'])test('V2 consent blocks '+mode+' context loss',async()=>{
 const f=fixture();if(mode==='before')f.invalidate();const p=requestV2SessionConsent(f.args);
 if(mode==='poll'){f.invalidate();[...f.timers][0]();}
 if(mode==='click'){f.invalidate();f.buttons().approve.click();}
 if(mode==='close')f.events.pagehide();await assert.rejects(p);assert.equal(f.host.children.length,0);
});
test('V2 consent expiry checks the click even when timer was suspended',async()=>{
 const f=fixture(),p=requestV2SessionConsent({...f.args,timeoutMs:1});await new Promise(r=>setTimeout(r,5));
 f.buttons().approve.click();await assert.rejects(p,/lejart/);});
test('V2 consent cannot replace another pending panel',async()=>{
 const f=fixture(),p=requestV2SessionConsent(f.args);await assert.rejects(requestV2SessionConsent(f.args));
 f.buttons().cancel.click();await p;});
for(const override of [{timeoutMs:0},{timeoutMs:NaN},{timeoutMs:300001},
 {report:{status:'V2_ACTIVE',taskCount:193}},{report:{status:'V2_READY_TO_START',taskCount:0}}])
 test('invalid V2 consent cannot create controls '+JSON.stringify(override),async()=>{
  const f=fixture();await assert.rejects(requestV2SessionConsent({...f.args,...override}));assert.equal(f.host.children.length,0);});
