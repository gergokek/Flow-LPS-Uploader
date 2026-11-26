import test from 'node:test';
import assert from 'node:assert/strict';
import {versionLayout,versionFilePath,versionFolder,versionIndex,draftFileName,
 lifecycleFileName,makeVersionInfo} from '../version-workspace-layout.js';
test('V1/V2 preserve exact historic paths and never invent a migrated location',()=>{
 const a=versionLayout('5107075373',1),b=versionLayout('5107075373',2);
 assert.equal(a.drafts,'Projects/5107075373/Draft-Plans');
 assert.equal(b.approved,'Projects/5107075373/Approved-Plans');
 assert.equal(b.sync,'Projects/5107075373/Sync-Status');
 assert.equal(a.manifest,null);assert.equal(b.versionRoot,null);
 assert.equal(versionFilePath({boardId:'5107075373',version:2,kind:'drafts',name:'draft-v2-r000001.json'}),'Projects/5107075373/Draft-Plans/draft-v2-r000001.json');
});
test('V3 and future versions route every artifact into one isolated version tree',()=>{
 const b='5107075373',v=3,layout=versionLayout(b,v);
 assert.equal(versionFolder(v),'V0003');
 assert.equal(layout.versionRoot,'Projects/'+b+'/Versions/V0003');
 assert.equal(layout.drafts,layout.versionRoot+'/Drafts');
 assert.equal(layout.session,layout.versionRoot+'/Session');
 assert.equal(layout.sync,layout.versionRoot+'/Sync');
 assert.equal(layout.approved,layout.versionRoot+'/Approved');
 assert.equal(versionFilePath({boardId:b,version:v,kind:'drafts',name:draftFileName(v,1)}),layout.drafts+'/draft-v3-r000001.json');
 assert.equal(versionFilePath({boardId:b,version:v,kind:'approved',name:lifecycleFileName(v,'approved')}),layout.approved+'/approved-v3.json');
 assert.equal(versionFilePath({boardId:b,version:v,kind:'sync',name:lifecycleFileName(v,'ahead',1)}),layout.sync+'/sync-v3-step-000001-ahead.json');
 assert.equal(versionLayout(b,4).versionRoot,'Projects/'+b+'/Versions/V0004');
 const index=versionIndex(b,4);
 assert.equal(index.length,4);assert.deepEqual(index.map(x=>x.legacy),[true,true,false,false]);
});
test('input validation rejects directory traversals, namespacing collisions and invalid revisions',()=>{
 for(const bad of ['../3','abc','0','123 ','123/456'])assert.throws(()=>versionLayout(bad,3));
 for(const bad of [0,-1,1.2,10000,'3',null])assert.throws(()=>versionLayout('5107075373',bad));
 for(const name of ['../active-session-v3.json','hello/part.json','..foo.json','name.json/other','ékezet.json',''])
  assert.throws(()=>versionFilePath({boardId:'5107075373',version:3,kind:'drafts',name}));
 assert.throws(()=>versionFilePath({boardId:'5107075373',version:3,kind:'other',name:'draft.json'}));
 assert.throws(()=>draftFileName(3,1000000));
 assert.throws(()=>lifecycleFileName(3,'ahead',0));
 assert.equal(draftFileName(3,0),'draft-v3.json');
 assert.equal(lifecycleFileName(3,'completion'),'sync-v3-completed.json');
});
test('version index requires a verified predecessor receipt, not just an existing folder',()=>{
 const opts={boardId:'5107075373',version:3,
  sessionId:'11111111-1111-4111-8111-111111111111',
  source:{planVersion:2,completionSha256:'a'.repeat(64)},createdAt:'2026-11-26T10:00:00Z'};
 const manifest=makeVersionInfo(opts);
 assert.equal(manifest.status,'ACTIVE');assert.equal(manifest.sourceCompletionSha256,'a'.repeat(64));
 assert.equal(manifest.paths.drafts,'Projects/5107075373/Versions/V0003/Drafts');
 assert.throws(()=>makeVersionInfo({...opts,source:{planVersion:1,completionSha256:'a'.repeat(64)}}));
 assert.throws(()=>makeVersionInfo({...opts,source:{planVersion:2,completionSha256:'invalid'}}));
 assert.throws(()=>makeVersionInfo({...opts,version:2}));
});

test('new projects start versioned already at V1 and derive V0 SHA as source',()=>{
 const board='5105949528';
 const first=versionLayout(board,1),second=versionLayout(board,2);
 assert.equal(first.legacy,false);
 assert.equal(first.versionRoot,'Projects/'+board+'/Versions/V0001');
 assert.equal(first.drafts,'Projects/'+board+'/Versions/V0001/Drafts');
 assert.equal(second.versionRoot,'Projects/'+board+'/Versions/V0002');
 const info=makeVersionInfo({boardId:board,version:1,
  sessionId:'11111111-1111-4111-8111-111111111111',
  source:{planVersion:0,approvedSha256:'f'.repeat(64)},createdAt:'2026-11-26T10:00:00Z'});
 assert.equal(info.sourceReferenceKind,'APPROVED_V0');
 assert.equal(info.sourceApprovedV0Sha256,'f'.repeat(64));
 assert.equal(info.sourceCompletionSha256,null);
 assert.throws(()=>makeVersionInfo({boardId:board,version:1,
  sessionId:'11111111-1111-4111-8111-111111111111',
  source:{planVersion:0,completionSha256:'f'.repeat(64)},createdAt:'2026-11-26T10:00:00Z'}));
 assert.deepEqual(versionIndex(board,2).map(x=>x.legacy),[false,false]);
});
