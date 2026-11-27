import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersionedStoreFactory} from '../versioned-store-factory.js';

function setup(){
 let current=true;const calls=[];
 const factory=createVersionedStoreFactory({
  graphForVersion:v=>{calls.push(['graph',v]);return {
   read:async()=>{throw Error('unexpected read');},
   list:async()=>{throw Error('unexpected list');},
   create:async()=>{throw Error('unexpected create');},
   ensureFolders:async()=>{throw Error('unexpected folder create');}
  };},
  inspectLegacyV2:async()=>{throw Error('unexpected legacy read');},
  inspectCatalog:async()=>{calls.push(['catalog']);return {complete:false};},
  check:()=>{if(!current)throw Error('connection changed');}
 });
 return {factory,calls,disconnect:()=>{current=false;}};
}
test('Vn factory keeps one store instance per version and never allocates files',()=>{
 const {factory,calls}=setup();
 const a=factory.forVersion(3),b=factory.forVersion(4),c=factory.forVersion(5);
 assert.equal(a,factory.forVersion(3));assert.equal(b,factory.forVersion(4));
 assert.notEqual(a.draft,b.draft);assert.notEqual(b.approval,c.approval);
 assert.notEqual(a.sync,c.sync);
 assert.deepEqual([a.version,b.version,c.version],[3,4,5]);
 assert.deepEqual(calls,[['graph',3],['graph',4],['graph',5]]);
 assert.throws(()=>factory.forVersion(2),/Invalid Vn/);
 assert.throws(()=>factory.forVersion(10000),/Invalid Vn/);
 assert.throws(()=>factory.forVersion('4'),/Invalid Vn/);
});
test('disconnected factory cannot return a cached or new mutation store',()=>{
 const {factory,calls,disconnect}=setup();
 factory.forVersion(3);disconnect();
 assert.throws(()=>factory.forVersion(3),/connection changed/);
 assert.throws(()=>factory.forVersion(4),/connection changed/);
 assert.deepEqual(calls,[['graph',3]]);
});
test('read-only project discovery rejects an incomplete catalog before opening a graph adapter',async()=>{
 const {factory,calls}=setup();
 await assert.rejects(factory.inspectCurrent({createdBy:'x',editorId:'1',boardFingerprint:'board'}),/complete, contiguous/);
 assert.deepEqual(calls,[['catalog']]);
});
