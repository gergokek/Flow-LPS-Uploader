import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestV1FullSyncConsent,beginV1FullSyncWithConsent} from '../full-sync-consent-ui.js';
function fixture(){
 const doc={title:'Original',createElement(tag){return new Element(tag);}};
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.handlers={};this.disabled=false;}
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
 const args={host,win,report,isCurrent:()=>current};
 const buttons=()=>{const p=host.children[0];return {approve:p.children[3],cancel:p.children[4]};};
 return {args,doc,host,events,timers,buttons,invalidate:()=>{current=false;}};
}
test('full V1 waits for explicit inline click; native dialog is not used',async()=>{
 const f=fixture();let completed=0;
 const p=requestV1FullSyncConsent(f.args).then(x=>{completed++;return x;});
 await Promise.resolve();assert.equal(completed,0);assert.equal(f.host.children.length,1);
 assert.equal(f.doc.focused.tagName,'h3');
 const b=f.buttons();b.approve.click();b.approve.click();
 assert.equal(await p,true);assert.equal(completed,1);assert.equal(b.approve.disabled,true);
 assert.equal(f.doc.title,'Original');assert.equal(f.host.children.length,0);assert.equal(f.timers.size,0);
});
test('only explicit cancel returns false',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent(f.args);f.buttons().cancel.click();assert.equal(await p,false);
 assert.equal(f.events.pagehide,undefined);assert.equal(f.timers.size,0);
});
test('changed identity or connection rejects an affirmative click',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent(f.args);f.invalidate();f.buttons().approve.click();
 await assert.rejects(p,/megvaltozott/);assert.equal(f.host.children.length,0);
});
test('context poll invalidates pending approval without a click',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent(f.args);f.invalidate();[...f.timers.values()][0]();
 await assert.rejects(p,/megvaltozott/);
});
test('expired request cannot be accepted after a suspended tab resumes',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent({...f.args,timeoutMs:1});
 await new Promise(resolve=>setTimeout(resolve,5));f.buttons().approve.click();
 await assert.rejects(p,/lejart/);
});
test('page closure never approves, rejects distinctly and cleans up controls',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent(f.args);f.events.pagehide();
 await assert.rejects(p,/bezarult/);assert.equal(f.timers.size,0);
});
test('concurrent requests cannot replace another consent',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent(f.args);
 await assert.rejects(requestV1FullSyncConsent(f.args),/Mar van/);
 f.buttons().approve.click();assert.equal(await p,true);
});
test('invalid report or initial context never offers approval',async()=>{
 const f=fixture();await assert.rejects(requestV1FullSyncConsent({...f.args,
  report:{...f.args.report,remainingTaskCount:48}}),/osszesito/);
 f.invalidate();await assert.rejects(requestV1FullSyncConsent(f.args),/megvaltozott/);
 assert.equal(f.host.children.length,0);
});
test('closure-only consent supports zero remaining tasks',async()=>{
 const f=fixture(),p=requestV1FullSyncConsent({...f.args,report:{status:'READY_TO_CLOSE',
  verifiedTaskCount:50,remainingTaskCount:0,changedTaskCount:50}});
 f.buttons().approve.click();assert.equal(await p,true);
});
for(const status of ['V1_SYNC_COMPLETED','MANUAL_RECONCILIATION_REQUIRED'])test(status+' is not approvable',async()=>{
 const f=fixture();await assert.rejects(requestV1FullSyncConsent({...f.args,report:{...f.args.report,status}}),/osszesito/);
});
function actionFixture(){
 const f=fixture(),output={textContent:''};let begins=0;
 const options={...f.args,args:{ledgerSha256:f.args.report.ledgerSha256},output,
  full:{inspect:async()=>f.args.report,begin:async args=>{assert.equal(args.userConfirmed,true);begins++;return {remainingTaskCount:49};}}};
 return {...f,options,output,begins:()=>begins};
}
test('actual begin wrapper waits and delegates once only after consent',async()=>{
 const f=actionFixture(),p=beginV1FullSyncWithConsent(f.options);await Promise.resolve();
 assert.equal(f.begins(),0);assert.match(f.output.textContent,/jovahagyasra var/);
 f.buttons().approve.click();await p;assert.equal(f.begins(),1);assert.match(f.output.textContent,/engedelyezve/);
});
test('cancel never calls begin and displays distinct user cancellation',async()=>{
 const f=actionFixture(),p=beginV1FullSyncWithConsent(f.options);await Promise.resolve();f.buttons().cancel.click();
 await assert.rejects(p,/Megse gombjaval/);assert.equal(f.begins(),0);assert.match(f.output.textContent,/Megse/);
});
test('ledger change blocks before showing any consent',async()=>{
 const f=actionFixture();f.options.args.ledgerSha256='b'.repeat(64);
 await assert.rejects(beginV1FullSyncWithConsent(f.options),/naplosor megvaltozott/);
 assert.equal(f.host.children.length,0);assert.equal(f.begins(),0);
});
test('context change during inspection blocks before approval',async()=>{
 const f=actionFixture();f.options.full.inspect=async()=>{f.invalidate();return f.args.report;};
 await assert.rejects(beginV1FullSyncWithConsent(f.options),/megvaltozott/);assert.equal(f.begins(),0);
});
test('context change between click and continuation cannot call begin',async()=>{
 const f=actionFixture(),p=beginV1FullSyncWithConsent(f.options);await Promise.resolve();
 f.buttons().approve.click();f.invalidate();await assert.rejects(p,/megvaltozott/);assert.equal(f.begins(),0);
});
test('store errors propagate, do not retry, and cannot claim authorization',async()=>{
 const f=actionFixture();let calls=0;f.options.full.begin=async()=>{calls++;throw Error('Store denied');};
 const p=beginV1FullSyncWithConsent(f.options);await Promise.resolve();f.buttons().approve.click();
 await assert.rejects(p,/Store denied/);assert.equal(calls,1);assert.equal(f.output.textContent,'Store denied');
});
test('UI module has no network, popup or HTML-string execution',()=>{
 const source=readFileSync(new URL('../full-sync-consent-ui.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\.confirm\s*\(|\.innerHTML\s*=|\.open\s*\(|accessToken/);
});

test('reconciliation consent displays exact before/observed strings and never auto-accepts',async()=>{
 const f=fixture();f.args.report={...f.args.report,status:'RECONCILIATION_AVAILABLE',reconciliation:{
  step:2,taskId:'102',taskName:'Synthetic task',approvedNote:'Note ',observedNote:'Note',sha256:'a'.repeat(64)}};
 const p=requestV1FullSyncConsent(f.args);await Promise.resolve();
 const panel=f.host.children[0];assert.ok(panel.children[2].textContent.includes(JSON.stringify('Note ')));
 assert.ok(panel.children[2].textContent.includes(JSON.stringify('Note')));
 assert.match(panel.children[2].textContent,/NEM/);
 assert.match(panel.children[3].textContent,/elteres elfogadasa/);
 f.buttons().cancel.click();assert.equal(await p,false);
});

test('missing recovery description fails before offering consent',async()=>{
 const f=fixture();f.args.report.status='RECONCILIATION_AVAILABLE';
 await assert.rejects(requestV1FullSyncConsent(f.args),/pontos leirasa/);assert.equal(f.host.children.length,0);
});
test('accepted inline recovery binds the exact candidate hash into begin',async()=>{
 const f=actionFixture();f.args.report.status='RECONCILIATION_AVAILABLE';
 f.args.report.reconciliation={step:2,taskId:'102',taskName:'Synthetic',approvedNote:'Note ',observedNote:'Note',sha256:'c'.repeat(64)};
 let bound;f.options.full.begin=async args=>{bound=args;return {remainingTaskCount:49};};
 const p=beginV1FullSyncWithConsent(f.options);await Promise.resolve();f.buttons().approve.click();await p;
 assert.equal(bound.acceptedReconciliationSha256,'c'.repeat(64));assert.equal(bound.userConfirmed,true);
});
