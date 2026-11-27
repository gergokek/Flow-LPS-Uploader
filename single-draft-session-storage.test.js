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
  if(['https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName',
      'https://graph.microsoft.com/v1.0/me?$select=id'].includes(url)&&
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
 let uuidCount=0;
 const store=createSingleDraftSessionStore({boardId,driveId,fetcher,
  getAccessToken:async()=> 'token',randomUUID:()=>uuidCount++?crypto.randomUUID():sessionId});
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
 const homeAccountId='22222222-2222-4222-8222-222222222222.816099a1-2aff-441c-b4ef-9c3a405ac2fa';
 const g=fakeGraph(),v1=await g.store.start({createdBy:homeAccountId});
 const edit=structuredClone(v1.draft);edit.version=1;
 edit.history.push({revision:1,type:'edit',at:'2026-11-25T09:30:00.000Z'});
 edit.working[0].note='approved change';
 const saved=await g.store.append({updatedDraft:JSON.parse(stable(edit)),
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const args={expectedSessionId:sessionId,expectedRevision:1,
  expectedSha256:saved.receipt.sha256,createdBy:homeAccountId,editorId:'96423073'};
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
 const homeAccountId='22222222-2222-4222-8222-222222222222.816099a1-2aff-441c-b4ef-9c3a405ac2fa';
 const g=fakeGraph(),v1=await g.store.start({createdBy:homeAccountId});
 const edit=structuredClone(v1.draft);edit.version=1;
 edit.history.push({revision:1,type:'edit',at:'2026-11-25T09:31:00.000Z'});
 edit.working[0].note='changed';
 const saved=await g.store.append({updatedDraft:edit,
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const args={expectedSessionId:sessionId,expectedRevision:1,
  expectedSha256:saved.receipt.sha256,createdBy:homeAccountId,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),
  boardFingerprintSha256:await sha256(new TextEncoder().encode(
   fingerprint(g.v0.plan.base)))};
 await assert.rejects(g.store.approve({...args,
  boardVerifiedAt:'2026-01-01T00:00:00.000Z'}),/Friss/);
 await assert.rejects(g.store.approve({...args,
  expectedRevision:2}),/megváltozott/);
 await assert.rejects(g.store.approve({...args,
  createdBy:'another-user'}),/eltér/);
 assert.equal(g.files.has('Draft-Plans/session-v1-freeze.json'),false);
 assert.equal(g.files.has('Approved-Plans/approved-v1.json'),false);
});

test('frozen V1.1 supports independent Approved V1 sync inspection and a single zero-write checkpoint',async()=>{
 const home='22222222-2222-4222-8222-222222222222.816099a1-2aff-441c-b4ef-9c3a405ac2fa';
 const g=fakeGraph(),v1=await g.store.start({createdBy:home});
 const edited=structuredClone(v1.draft);edited.version=1;
 edited.history.push({revision:1,type:'edit',at:new Date().toISOString()});
 edited.working[0].note='changed for sync';
 const saved=await g.store.append({updatedDraft:edited,
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const boardFingerprintSha256=await sha256(new TextEncoder().encode(
  fingerprint(g.v0.plan.base)));
 const approved=await g.store.approve({expectedSessionId:sessionId,
  expectedRevision:1,expectedSha256:saved.receipt.sha256,
  createdBy:home,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256});
 await assert.rejects(g.store.resume(),/zárolva/);
 const countBefore=g.counters.uploads;
 const inspected=await g.store.inspectApprovedSync({createdBy:home});
 assert.equal(g.counters.uploads,countBefore);
 assert.equal(inspected.status,'APPROVED_V1_VERIFIED');
 assert.equal(inspected.sourceDraftSha256,saved.receipt.sha256);
 assert.equal(inspected.receipt.sha256,approved.approvedPlan.sha256);
 assert.equal(inspected.approvedPlan.plan.working[0].note,'changed for sync');
 await assert.rejects(g.store.inspectApprovedSync({
  createdBy:'33333333-3333-4333-8333-333333333333.816099a1-2aff-441c-b4ef-9c3a405ac2fa'}),/felhasználó/);
 assert.equal(g.counters.uploads,countBefore);
 const receipt=await g.store.prepareApprovedSync({
  expectedApprovedSha256:inspected.receipt.sha256,
  createdBy:home,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256});
 assert.equal(receipt.status,'PREPARED_NO_WRITES');
 assert.equal(receipt.mondayWrites,0);
 assert.equal(receipt.mutationAttempts,0);
 assert.equal(receipt.writeAuthorization,'NOT_GRANTED');
 assert.equal(receipt.checkpoint.name,'sync-v1-prepared.json');
 assert.equal(receipt.checkpoint.verification,'content-sha256-and-etag');
 assert.equal(g.counters.uploads,countBefore+1);
 const value=JSON.parse(new TextDecoder().decode(
  g.files.get('Sync-Status/sync-v1-prepared.json').content));
 assert.equal(value.status,'PREPARED_NO_WRITES');
 assert.equal(value.mondayWrites,0);
 assert.equal(value.writeAuthorization,'NOT_GRANTED');
 assert.equal(value.approvedSha256,approved.approvedPlan.sha256);
 await assert.rejects(g.store.prepareApprovedSync({
  expectedApprovedSha256:inspected.receipt.sha256,
  createdBy:home,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256}),
  /Már létezik/);
 assert.equal(g.counters.uploads,countBefore+1);
});
test('Approved V1 sync checkpoint rejects stale board source before Graph write',async()=>{
 const home='22222222-2222-4222-8222-222222222222.816099a1-2aff-441c-b4ef-9c3a405ac2fa';
 const g=fakeGraph(),v1=await g.store.start({createdBy:home});
 const edited=structuredClone(v1.draft);edited.version=1;
 edited.history.push({revision:1,type:'edit',at:new Date().toISOString()});
 edited.working[0].note='changed';
 const saved=await g.store.append({updatedDraft:edited,
  expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const correct=await sha256(new TextEncoder().encode(fingerprint(g.v0.plan.base)));
 await g.store.approve({expectedSessionId:sessionId,expectedRevision:1,
  expectedSha256:saved.receipt.sha256,createdBy:home,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256:correct});
 const v=await g.store.inspectApprovedSync({createdBy:home});
 const before=g.counters.uploads;
 await assert.rejects(g.store.prepareApprovedSync({
  expectedApprovedSha256:v.receipt.sha256,
  createdBy:home,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),
  boardFingerprintSha256:'f'.repeat(64)}),/V0 forrás/);
 await assert.rejects(g.store.prepareApprovedSync({
  expectedApprovedSha256:'f'.repeat(64),
  createdBy:home,editorId:'96423073',
  boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256:correct}),
  /időközben/);
 assert.equal(g.counters.uploads,before);
 assert.equal(g.files.has('Sync-Status/sync-v1-prepared.json'),false);
});

test('V1 pilot uses real store readback chain and immutable journal create paths',async()=>{
 const {pilotSha,pilotStable,pilotTask,pilotTarget}=await import('./single-v1-pilot-contract.js');
 const createdBy='22222222-2222-4222-8222-222222222222.816099a1-2aff-441c-b4ef-9c3a405ac2fa',editorId='96423073';
 const g=fakeGraph(),v1=await g.store.start({createdBy});
 const edit=structuredClone(v1.draft);edit.version=1;
 edit.history.push({revision:1,type:'edit',at:new Date().toISOString()});edit.working[0].note='Pilot change';
 const saved=await g.store.append({updatedDraft:edit,expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const boardFingerprintSha256=await pilotSha(fingerprint(g.v0.plan.base));
 const approved=await g.store.approve({expectedSessionId:sessionId,expectedRevision:1,
  expectedSha256:saved.receipt.sha256,createdBy,editorId,boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256});
 await g.store.prepareApprovedSync({expectedApprovedSha256:approved.approvedPlan.sha256,
  createdBy,editorId,boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256});
 const uploadCount=g.counters.uploads;
 const initial=await g.store.inspectV1Pilot({createdBy,editorId});
 assert.equal(initial.status,'READY_FOR_PILOT');assert.equal(g.counters.uploads,uploadCount);
 const t=await pilotTarget(initial.evidence,editorId);
 const ahead=await g.store.writeV1PilotAhead({createdBy,editorId,userConfirmed:true,taskId:t.taskId,
  expectedApprovedSha256:t.approvedSha256,expectedCheckpointSha256:t.checkpointSha256,
  expectedSessionId:t.sessionId,expectedRevision:t.revision,requestId:'44444444-4444-4444-8444-444444444444',
  mutationValuesSha256:'b'.repeat(64),boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256});
 assert.equal(ahead.receipt.verification,'content-sha256-and-etag');
 const result={schemaVersion:1,format:'mflow-v1-pilot-result',status:'ITEM_READBACK_VERIFIED',
  boardId,planVersion:1,sessionId,revision:1,taskId:t.taskId,editorId,microsoftEntraObjectId:t.microsoftEntraObjectId,
  approvedSha256:t.approvedSha256,checkpointSha256:t.checkpointSha256,requestId:ahead.document.requestId,
  writeAheadSha256:ahead.receipt.sha256,mutationValuesSha256:ahead.document.mutationValuesSha256,
  mutationAttempts:1,replyConfirmed:true,itemReadbackMatches:true,fullBoardReadbackMatches:true,
  itemReadbackSha256:await pilotSha(pilotStable(pilotTask(t.after))),boardReadbackSha256:await pilotSha(t.expectedFingerprint),
  error:null,checkedAt:new Date().toISOString(),automaticallyRetryable:false};
 const proof=await g.store.saveV1PilotResult({createdBy,result});
 assert.equal(proof.receipt.verification,'content-sha256-and-etag');
 assert.equal(g.counters.uploads,uploadCount+2);
 assert.equal((await g.store.inspectV1Pilot({createdBy,editorId})).status,'PILOT_RECORDED');
});


test('real Graph adapter: V2 start edit resume approval full journal closure preserves V1',async()=>{
 const {pilotSha,pilotStable,pilotTask,pilotTarget}=await import('./v1-pilot-contract.js');
 const {inspectFullSyncEvidence}=await import('./v1-full-sync-contract.js');
 const createdBy='22222222-2222-4222-8222-222222222222.816099a1-2aff-441c-b4ef-9c3a405ac2fa',editorId='96423073';
 const g=fakeGraph(),v1=await g.store.start({createdBy}),edit=structuredClone(v1.draft);
 edit.version=1;edit.history=[{revision:1,type:'edit',at:new Date().toISOString()}];edit.working[0].note='Approved final';
 const saved=await g.store.append({updatedDraft:edit,expectedSessionId:sessionId,expectedParentSha256:v1.receipt.sha256});
 const sourceHash=await pilotSha(fingerprint(g.v0.plan.base));
 const approved=await g.store.approve({expectedSessionId:sessionId,expectedRevision:1,expectedSha256:saved.receipt.sha256,
  createdBy,editorId,boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256:sourceHash});
 await g.store.prepareApprovedSync({expectedApprovedSha256:approved.approvedPlan.sha256,
  createdBy,editorId,boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256:sourceHash});
 const inspected=await g.store.inspectV1Pilot({createdBy,editorId}),t=await pilotTarget(inspected.evidence,editorId);
 const ahead=await g.store.writeV1PilotAhead({createdBy,editorId,userConfirmed:true,taskId:t.taskId,
  expectedApprovedSha256:t.approvedSha256,expectedCheckpointSha256:t.checkpointSha256,
  expectedSessionId:t.sessionId,expectedRevision:t.revision,requestId:crypto.randomUUID(),
  mutationValuesSha256:'b'.repeat(64),boardVerifiedAt:new Date().toISOString(),boardFingerprintSha256:sourceHash});
 await g.store.saveV1PilotResult({createdBy,result:{schemaVersion:1,format:'mflow-v1-pilot-result',status:'ITEM_READBACK_VERIFIED',
  boardId,planVersion:1,sessionId,revision:1,taskId:t.taskId,editorId,microsoftEntraObjectId:t.microsoftEntraObjectId,
  approvedSha256:t.approvedSha256,checkpointSha256:t.checkpointSha256,requestId:ahead.document.requestId,
  writeAheadSha256:ahead.receipt.sha256,mutationValuesSha256:ahead.document.mutationValuesSha256,
  mutationAttempts:1,replyConfirmed:true,itemReadbackMatches:true,fullBoardReadbackMatches:true,
  itemReadbackSha256:await pilotSha(pilotStable(pilotTask(t.after))),boardReadbackSha256:await pilotSha(t.expectedFingerprint),
  error:null,checkedAt:new Date().toISOString(),automaticallyRetryable:false}});
 const full=g.store.fullSync,initial=await full.inspect({createdBy,editorId});
 const state=await inspectFullSyncEvidence(initial.evidence,editorId);
 const params={createdBy,editorId,executionId:crypto.randomUUID(),expectedApprovedSha256:t.approvedSha256,
  expectedCheckpointSha256:t.checkpointSha256,ledgerSha256:state.ledgerSha256,
  boardFingerprintSha256:state.expectedBoardSha256,boardVerifiedAt:new Date().toISOString()};
 await full.begin({...params,userConfirmed:true});await full.inspect({createdBy,editorId});await full.finish(params);
 const oldContents=new Map([...g.files].map(([path,f])=>[path,new TextDecoder().decode(f.content)]));
 const writes=g.counters.uploads,next=g.store.nextSession,report=await next.inspect({createdBy,editorId});
 assert.equal(report.status,'V2_READY_TO_START');assert.equal(g.counters.uploads,writes);
 const v2args={createdBy,editorId,executionId:crypto.randomUUID(),generationSha256:report.generationSha256,
  expectedApprovedSha256:t.approvedSha256,completionSha256:report.evidence.final.receipt.sha256,
  boardFingerprintSha256:report.evidence.final.document.boardReadbackSha256,boardVerifiedAt:new Date().toISOString()};
 await next.begin({...v2args,userConfirmed:true});assert.equal(g.counters.uploads,writes);
 const opened=await next.open(v2args);assert.equal(opened.status,'V2_ACTIVE');assert.equal(g.counters.uploads,writes+3);
 const draft=structuredClone(opened.baseline.document);assert.equal(draft.working[0].note,'Approved final');
 assert.notEqual(draft.session.sessionId,sessionId);draft.version=1;draft.history=[{revision:1,type:'edit',at:new Date().toISOString()}];
 draft.working[0].note='New V2 edit';
 await next.append({updatedDraft:draft,expectedSessionId:draft.session.sessionId,expectedParentSha256:opened.baseline.receipt.sha256});
 assert.equal(g.counters.uploads,writes+4);
 const resumed=await next.inspect({createdBy,editorId});
 assert.equal(resumed.revision,1);assert.equal(resumed.claim.document.sessionId,draft.session.sessionId);
 await next.open({...v2args,generationSha256:resumed.generationSha256,boardVerifiedAt:new Date().toISOString()});
 assert.equal(g.counters.uploads,writes+4);
 for(const [path,content] of oldContents)assert.equal(new TextDecoder().decode(g.files.get(path).content),content,path);
 await assert.rejects(g.store.resume(),/z.arolva|zárolva/);
 const {inspectV2Cycle,v2SyncCommon,V2_FINAL}=await import('./v2-approval-sync-contract.js');
 const flow=g.store.v2Flow;let cycle=await flow.inspect({editorId,createdBy});
 let cs=await inspectV2Cycle(cycle,editorId,createdBy);
 const executionId=crypto.randomUUID();
 const proof=()=>({editorId,createdBy,executionId,expectedV2SessionId:cs.model.sessionId,
  expectedV2Revision:cs.model.revision,expectedDraftSha256:cs.model.sourceDraftSha256,
  generationSha256:cs.generationSha256,boardFingerprintSha256:cs.expectedBoardSha256,
  boardVerifiedAt:new Date().toISOString()});
 assert.equal(cs.status,'DRAFT_READY');assert.equal(cs.remainingTaskCount,1);
 await flow.begin({...proof(),userConfirmed:true});assert.equal(g.counters.uploads,writes+4);
 cycle=await flow.approve(proof());cs=await inspectV2Cycle(cycle,editorId,createdBy);
 assert.equal(cs.status,'READY_TO_SYNC');assert.equal(g.counters.uploads,writes+7);
 const target=cs.next,requestId=crypto.randomUUID();
 const newAhead=await flow.ahead({...proof(),requestId,step:target.step,taskId:target.taskId,mutationValuesSha256:'b'.repeat(64)});
 const newResult={...v2SyncCommon(cs.model,cycle),format:'mflow-v2-sync-result',status:'ITEM_READBACK_VERIFIED',
  step:target.step,taskId:target.taskId,executionId,requestId,writeAheadSha256:newAhead.receipt.sha256,
  mutationValuesSha256:'b'.repeat(64),mutationAttempts:1,replyConfirmed:true,itemReadbackMatches:true,
  fullBoardReadbackMatches:true,itemReadbackSha256:target.expectedItemSha256,
  boardReadbackSha256:target.expectedBoardSha256,error:null,checkedAt:new Date().toISOString(),automaticallyRetryable:false};
 await flow.result({createdBy,editorId,executionId,result:newResult});
 cycle=await flow.inspect({createdBy,editorId});cs=await inspectV2Cycle(cycle,editorId,createdBy);
 assert.equal(cs.status,'READY_TO_CLOSE');const final=await flow.finish(proof());assert.equal(final.receipt.name,V2_FINAL);
 assert.equal(g.counters.uploads,writes+10);
 const reopenedCycle=await flow.inspect({createdBy,editorId});
 assert.equal((await inspectV2Cycle(reopenedCycle,editorId,createdBy)).status,'V2_SYNC_COMPLETED');
 assert.equal(g.counters.uploads,writes+10);
 await assert.rejects(next.open({...v2args,generationSha256:resumed.generationSha256,boardVerifiedAt:new Date().toISOString()}),/zarolt/);
 await assert.rejects(next.append({updatedDraft:draft}),/zarolt|uj visszaellenorzes/);
 for(const [path,content] of oldContents)assert.equal(new TextDecoder().decode(g.files.get(path).content),content,path);
});
