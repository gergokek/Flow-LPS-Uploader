import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersionedApprovalSource} from '../versioned-approval-source.js';
import {versionLayout} from '../version-workspace-layout.js';

const boardId='5107075373',version=3,layout=versionLayout(boardId,3);
function fixture(){
 const files=new Map(),reads=[];
 const deps={
  inspectV2:async()=>({}),read:async path=>{reads.push(path);return files.get(path)||null;},
  list:async dir=>[...files.entries()].filter(([k])=>k.startsWith(dir+'/')&&
   !k.slice(dir.length+1).includes('/')).map(([,v])=>
    ({name:v.name,id:v.id,eTag:v.eTag}))};
 return {files,reads,deps,open:()=>createVersionedApprovalSource(deps)};
}
test('read-only V3 approval source rejects missing signed predecessor, no mutation',async()=>{
 const f=fixture(),src=f.open();
 await assert.rejects(src.inspect({editorId:'96423073',createdBy:'test-account'}));
 assert.equal(f.reads.length,3);
 assert.equal(typeof src.approve,'undefined');
});
test('any unexpected V3 Sync entry rejects before trusting predecessor data',async()=>{
 const f=fixture(),path=layout.sync+'/foreign.json';
 f.files.set(path,{name:'foreign.json',id:'id1',eTag:'etag1'});
 await assert.rejects(f.open().inspect({editorId:'96423073',createdBy:'test-account'}),
  /Nem vart V3 fajl/);
 assert.equal(f.reads.length,0);
});
test('unexpected or duplicate revision names fail closed and do not infer approval',async()=>{
 const f=fixture();
 f.files.set(layout.drafts+'/draft-v3-r000002.json',{
  name:'draft-v3-r000002.json',id:'id2',eTag:'etag2'});
 await assert.rejects(f.open().inspect({editorId:'96423073',createdBy:'test-account'}),
  /Hianyzo V3 DRAFT revizio/);
 assert.equal(f.reads.length,0);
});
test('forged board or identity cannot inspect V3 source',async()=>{
 const f=fixture();
 await assert.rejects(f.open().inspect({editorId:'attacker',createdBy:'test'}));
 await assert.rejects(f.open().inspect({editorId:'96423073',createdBy:''}));
 assert.equal(f.reads.length,0);
});
