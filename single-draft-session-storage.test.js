import test from 'node:test';
import assert from 'node:assert/strict';
import {createSingleDraftSessionStore} from './single-draft-session-storage.js';
import {fingerprint,stable,sha256} from './single-draft-session-core.js';

const boardId='5107075373',driveId='b!testdrive',
 sessionId='11111111-1111-4111-8111-111111111111';
function fakeGraph({writeStatus=null}={}){
 const base={id:boardId,workspaceId:'7145773',name:'Board',
  columns:[],groups:[],tasks:[{id:'101',name:'A',note:'',
   updatedAt:'2026-11-01T00:00:00Z'}]};
 const v0={schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',
  isApprovedPlan:true,syncStatus:'NOT_STARTED',mondaySyncAllowed:false,
  draftVersion:0,boardId,sourceFingerprint:fingerprint(base),
  plan:{base,working:structuredClone(base.tasks)}};
 const files=new Map(),counters={uploads:0,downloads:0};
 function add(dir,name,value){
  const content=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
  const id='item-'+files.size;
  const f={name,id,eTag:'etag-'+id,content,file:{mimeType:'application/json'},
   size:content.length,parentReference:{driveId}};
  files.set(dir+'/'+name,f);
  return f;
 }
 add('Approved-Plans','approved-v0.json',v0);
 let pending=null;
 function response(value,status=200){return new Response(JSON.stringify(value),
  {status,headers:{'content-type':'application/json'}});}
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const fetcher=async(input,options={})=>{
  const url=String(input),method=options.method||'GET',uri=new URL(url);
  if(uri.hostname==='uploads.tenant.sharepoint.com'&&method==='PUT'){
   counters.uploads++;
   const filename=pending.name,dir=pending.dir;
   if(files.has(dir+'/'+filename))return response({error:'collision'},409);
   const content=new Uint8Array(options.body);
   const value=JSON.parse(new TextDecoder().decode(content));
   const f=add(dir,filename,value);f.content=content;f.size=content.length;
   return response({...f,content:undefined},201);
  }
  if(uri.hostname==='dl.tenant.sharepoint.com'&&method==='GET'){
   counters.downloads++;
   const key=decodeURIComponent(uri.pathname.slice(1));
   const found=files.get(key);
   if(!found)return new Response('',{status:404});
   return new Response(found.content,{status:200});
  }
  if(url==='https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName'&&
     method==='GET')
   return response({id:'22222222-2222-4222-8222-222222222222',
    userPrincipalName:'test-approver@example.org'});
  if(!url.startsWith(root))throw Error('Unknown Graph origin '+url);
  const path=decodeURIComponent(uri.pathname.slice(new URL(root).pathname.length));
  if(path.startsWith('/root:/')){
   const partial=path.slice('/root:/'.length).split('/');
   const dir=partial[2];
   const name=partial.slice(3).join('/').replace(/:\/content$/,'');
   if(!name){
    if(method==='GET')return response({id:'folder-'+dir,name:dir,folder:{},
     parentReference:{driveId}});
   }
   const f=files.get(dir+'/'+name);
   if(method==='PUT'){
    if(uri.searchParams.get('@microsoft.graph.conflictBehavior')!=='fail')
     throw Error('TEST attempted unsafe Graph overwrite');
    if(writeStatus!==null)return response({error:{code:'accessDenied'}},writeStatus);
    if(f)return response({error:{code:'nameAlreadyExists'}},409);
    counters.uploads++;
    const content=new Uint8Array(options.body);
    const saved=add(dir,name,JSON.parse(new TextDecoder().decode(content)));
    saved.content=content;saved.size=content.length;
    return response({...saved,content:undefined},201);
   }
   if(method==='GET')return f?response({...f,content:undefined}):
    new Response('',{status:404});
  }
  const match=/^\/items\/([^/:?]+):\/([^/]+):\/createUploadSession$/.exec(path);
  if(match&&method==='POST'){
   const dir=match[1].replace('folder-',''),name=match[2];
   const request=JSON.parse(options.body);
   if(request.item['@microsoft.graph.conflictBehavior']!=='fail')
    throw Error('Overwrite attempt');
   pending={dir,name};
   return response({uploadUrl:'https://uploads.tenant.sharepoint.com/upload',
    expirationDateTime:new Date(Date.now()+3600000).toISOString()});
  }
  if(path.startsWith('/items/')&&path.includes('/children')&&method==='GET'){
   const dir=path.split('/')[2].replace('folder-','');
   return response({value:[...files.values()].filter(f=>files.get(dir+'/'+f.name)===f)
    .map(f=>({...f,content:undefined}))});
  }
  if(path.startsWith('/items/')&&method==='GET'){
   const id=path.split('/')[2],f=[...files.values()].find(f=>f.id===id);
   if(!f)return new Response('',{status:404});
   const dir=[...files].find(([,value])=>value===f)[0].split('/')[0];
   return response({...f,content:undefined,
    '@microsoft.graph.downloadUrl':'https://dl.tenant.sharepoint.com/'+
     encodeURIComponent(dir+'/'+f.name)});
  }
  throw Error('Unknown Graph API '+method+' '+url);
 };
 const store=createSingleDraftSessionStore({boardId,driveId,fetcher,
  getAccessToken:async()=> 'token',randomUUID:()=>sessionId});
 return {store,files,counters,v0};
}
test('V0 creates one active claim and immutable V1 baseline; second start denied',async()=>{
 const g=fakeGraph(),first=await g.store.start({createdBy:'entra-user'});
 assert.equal(first.revision,0);
 assert.equal(first.versionLabel,'V1');
 assert.equal(g.counters.uploads,2);
 assert.ok(g.files.has('Draft-Plans/active-session.json'));
 assert.ok(g.files.has('Draft-Plans/draft-v1.json'));
 await assert.rejects(g.store.start({createdBy:'entra-user'}),/már tartozik aktív/);
 assert.equal(g.counters.uploads,2);
});
test('resume independently re-reads all versions and append writes only V1.1',async()=>{
 const g=fakeGraph(),first=await g.store.start({createdBy:'entra-user'});
 const prepared=structuredClone(first.draft);
 prepared.version=1;
 prepared.history.push({revision:1,type:'edit',at:'2026-11-24T00:00:00Z'});
 prepared.working[0].note='Updated';
 // Monday serializes drafts canonically, reordering JSON object properties.
 // The recovered revision must be compared by content, NOT property order.
 const saved=await g.store.append({updatedDraft:JSON.parse(stable(prepared)),
  expectedSessionId:sessionId,expectedParentSha256:first.receipt.sha256});
 assert.equal(saved.versionLabel,'V1.1');
 assert.equal(saved.revision,1);
 assert.ok(g.files.has('Draft-Plans/draft-v1-r000001.json'));
 const reopened=await g.store.resume();
 assert.equal(reopened.versionLabel,'V1.1');
 assert.equal(reopened.draft.working[0].note,'Updated');
 assert.equal(g.counters.uploads,3);
 const second=structuredClone(reopened.draft);
 second.version=2;
 second.history.push({revision:2,type:'edit'});
 await assert.rejects(g.store.append({updatedDraft:second,
  expectedSessionId:sessionId,expectedParentSha256:first.receipt.sha256}),/másik módosítás/);
 assert.equal(g.counters.uploads,3);
});
test('tampered parent chain never silently recovers as latest draft',async()=>{
 const g=fakeGraph(),first=await g.store.start({createdBy:'entra-user'});
 const prepared=structuredClone(first.draft);
 prepared.version=1;prepared.history.push({revision:1,type:'edit',at:'2026-11-24T12:00:00.000Z'});
 await g.store.append({updatedDraft:prepared,
  expectedSessionId:sessionId,expectedParentSha256:first.receipt.sha256});
 const f=g.files.get('Draft-Plans/draft-v1-r000001.json');
 const changed=JSON.parse(new TextDecoder().decode(f.content));
 changed.session.parentSha256='f'.repeat(64);
 f.content=new TextEncoder().encode(JSON.stringify(changed));
 f.size=f.content.length;
 await assert.rejects(g.store.resume(),/SHA-256 kapcsolata/);
});
test('partial start cannot create a second session after immutable claim',async()=>{
 const g=fakeGraph();
 const first=await g.store.start({createdBy:'entra-user'});
 g.files.delete('Draft-Plans/draft-v1.json');
 await assert.rejects(g.store.resume(),/kiinduló fájlja hiányzik/);
 await assert.rejects(g.store.start({createdBy:'entra-user'}),/aktív munkamenet/);
 assert.equal(g.counters.uploads,2);
});

test('read-only Entra/Graph token fails explicitly without creating claim',async()=>{
 const g=fakeGraph({writeStatus:403});
 await assert.rejects(g.store.start({createdBy:'entra-user'}),
  /HTTP 403 \/ accessDenied.*írási engedélyt/);
 assert.equal(g.files.has('Draft-Plans/active-session.json'),false);
 assert.equal(g.files.has('Draft-Plans/draft-v1.json'),false);
 assert.equal(g.counters.uploads,0);
});
test('ambiguous Graph 500 does not automatically retry immutable claim',async()=>{
 const g=fakeGraph({writeStatus:500});
 await assert.rejects(g.store.start({createdBy:'entra-user'}),/HTTP 500/);
 assert.equal(g.files.has('Draft-Plans/active-session.json'),false);
 assert.equal(g.counters.uploads,0);
});
test('duplicate immutable filename is never overwritten even after concurrent preflight',async()=>{
 const g=fakeGraph(),first=await g.store.start({createdBy:'entra-user'});
 const prior=g.files.get('Draft-Plans/active-session.json').content;
 await assert.rejects(g.store.start({createdBy:'entra-user'}),/már tartozik aktív/);
 assert.deepEqual(g.files.get('Draft-Plans/active-session.json').content,prior);
 assert.equal(first.claimReceipt.verification,'content-sha256-and-etag');
});

test('a real Monday-serialized V1.1 can be resumed and appended to V1.2',async()=>{
 const g=fakeGraph(),v1=await g.store.start({createdBy:'entra-user'});
 const first=structuredClone(v1.draft);first.version=1;
 first.history.push({revision:1,type:'edit',at:'2026-11-25T09:17:48.180Z'});
 first.working[0].note='First change';
 const saved1=await g.store.append({
  updatedDraft:JSON.parse(stable(first)),
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 assert.equal(saved1.revision,1);
 const resumed=await g.store.resume();
 assert.equal(resumed.revision,1);
 assert.equal(resumed.draft.working[0].note,'First change');
 assert.notDeepEqual(Object.keys(resumed.draft.base),Object.keys(v1.draft.base));
 const candidate=structuredClone(resumed.draft);
 candidate.version=2;
 candidate.history.push({revision:2,type:'weekly',at:'2026-11-25T09:20:00.000Z'});
 candidate.working[0].status='Candidate';
 candidate.working[0].week='2026-W48';
 candidate.working[0].ledger=[{week:'2026-W48',status:'candidate',
  updatedAt:'2026-11-25T09:20:00.000Z'}];
 const saved2=await g.store.append({
  updatedDraft:JSON.parse(stable(candidate)),
  expectedSessionId:sessionId,expectedParentSha256:saved1.receipt.sha256});
 assert.equal(saved2.versionLabel,'V1.2');
 const recovered=await g.store.resume();
 assert.equal(recovered.versionLabel,'V1.2');
 assert.equal(recovered.draft.working[0].status,'Candidate');
 assert.equal(recovered.draft.history.length,2);
 assert.equal(g.counters.uploads,4);
});
test('an actually changed base field still blocks V1.2, regardless of key ordering',async()=>{
 const g=fakeGraph(),v1=await g.store.start({createdBy:'entra-user'});
 const first=structuredClone(v1.draft);first.version=1;
 first.history.push({revision:1,type:'edit',at:'2026-11-25T09:17:48.180Z'});
 first.working[0].note='First change';
 const saved=await g.store.append({updatedDraft:JSON.parse(stable(first)),
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const edited=structuredClone(saved.draft);
 edited.version=2;edited.history.push({revision:2,type:'weekly',at:'2026-11-25T09:22:00.000Z'});
 edited.base.tasks[0].note='tampered source';
 await assert.rejects(g.store.append({updatedDraft:JSON.parse(stable(edited)),
  expectedSessionId:sessionId,expectedParentSha256:saved.receipt.sha256}),
  /kiinduló állapotát/);
 assert.equal(g.counters.uploads,3);
});

test('V1.1 review is read-only; Approve creates immutable Approved Plan V1 with verified receipt',async()=>{
 const g=fakeGraph(),v1=await g.store.start({createdBy:'entra-user'});
 const edit=structuredClone(v1.draft);edit.version=1;
 edit.history.push({revision:1,type:'edit',at:'2026-11-25T09:30:00.000Z'});
 edit.working[0].note='approved change';
 const saved=await g.store.append({updatedDraft:JSON.parse(stable(edit)),
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const args={expectedSessionId:sessionId,expectedRevision:1,
  expectedSha256:saved.receipt.sha256,createdBy:'entra-user',editorId:'96423073'};
 const before=g.counters.uploads;
 const review=await g.store.reviewApproval(args);
 assert.equal(review.status,'V1_APPROVAL_REVIEWED');
 assert.equal(review.changedTaskCount,1);
 assert.equal(g.counters.uploads,before);
 const approval=await g.store.approve({...args,
  boardVerifiedAt:new Date().toISOString(),
  boardFingerprintSha256:await sha256(
   new TextEncoder().encode(fingerprint(g.v0.plan.base)))});
 assert.equal(approval.status,'APPROVED_PLAN_V1_STORED');
 assert.equal(approval.mondayWrites,0);
 assert.equal(approval.mondaySyncAllowed,false);
 assert.equal(approval.revision,1);
 assert.equal(approval.approvedPlan.name,'approved-v1.json');
 assert.equal(approval.approvedPlan.verification,'content-sha256-and-etag');
 assert.ok(g.files.has('Draft-Plans/session-v1-freeze.json'));
 assert.ok(g.files.has('Draft-Plans/session-v1-approved.json'));
 assert.ok(g.files.has('Approved-Plans/approved-v1.json'));
 const plan=JSON.parse(new TextDecoder().decode(
  g.files.get('Approved-Plans/approved-v1.json').content));
 assert.equal(plan.plan.working[0].note,'approved change');
 assert.equal(plan.planVersion,1);
 assert.equal(plan.draftVersion,1);
 assert.equal(plan.sourceDraft.sha256,saved.receipt.sha256);
 assert.equal(plan.finalization.microsoftEntraObjectId,
  '22222222-2222-4222-8222-222222222222');
 assert.equal(plan.mondaySyncAllowed,false);
 assert.equal(g.counters.uploads,before+3);
 await assert.rejects(g.store.resume(),/zárolva/);
 await assert.rejects(g.store.append({updatedDraft:edit,
  expectedSessionId:sessionId,expectedParentSha256:saved.receipt.sha256}),
  /zárolva/);
 await assert.rejects(g.store.approve({...args,
  boardVerifiedAt:new Date().toISOString(),
  boardFingerprintSha256:await sha256(
   new TextEncoder().encode(fingerprint(g.v0.plan.base)))}),/zárolva/);
 assert.equal(g.counters.uploads,before+3);
});
test('approval rejects old board proof, stale revision, changed identity with no freeze',async()=>{
 const g=fakeGraph(),v1=await g.store.start({createdBy:'entra-user'});
 const edit=structuredClone(v1.draft);edit.version=1;
 edit.history.push({revision:1,type:'edit',at:'2026-11-25T09:31:00.000Z'});
 edit.working[0].note='changed';
 const saved=await g.store.append({updatedDraft:edit,
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const args={expectedSessionId:sessionId,expectedRevision:1,
  expectedSha256:saved.receipt.sha256,createdBy:'entra-user',editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),
  boardFingerprintSha256:await sha256(new TextEncoder().encode(
   fingerprint(g.v0.plan.base)))};
 await assert.rejects(g.store.approve({...args,
  boardVerifiedAt:'2026-01-01T00:00:00.000Z'}),/friss/);
 await assert.rejects(g.store.approve({...args,
  expectedRevision:2}),/megváltozott/);
 await assert.rejects(g.store.approve({...args,
  createdBy:'another-user'}),/eltér/);
 assert.equal(g.files.has('Draft-Plans/session-v1-freeze.json'),false);
 assert.equal(g.files.has('Approved-Plans/approved-v1.json'),false);
});
