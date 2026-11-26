import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersionedGraphFiles} from '../versioned-graph-files.js';
const drive='b!example';
function fixture(){
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(drive);
 const folder='Projects/5107075373/Versions/V0003/Drafts';
 const files=new Map(),requests=[],url='https://files.sharepoint.com/v3-draft';
 const response=(status,value)=>({status,ok:status>=200&&status<300,
  json:async()=>value, arrayBuffer:async()=>new TextEncoder().encode(value).buffer});
 const fetcher=async(raw,opts={})=>{
  requests.push({url:raw,method:opts.method||'GET'});
  if(raw===url){
   const file=[...files.values()][0];
   return response(file?200:404,file?.raw||'');
  }
  assert.ok(raw.startsWith(root));
  const rest=raw.slice(root.length);
  if(rest==='/root?'+rest.split('?')[1])return response(200,{id:'root',folder:{}});
  if(rest.includes(':/content?')){
   assert.equal(opts.method,'PUT');
   assert.ok(rest.includes('conflictBehavior=fail'));
   const path=decodeURIComponent(rest.slice('/root:/'.length).split(':/content')[0]);
   if(files.has(path))return response(409,{error:{code:'nameAlreadyExists'}});
   const bytes=opts.body;const rawText=new TextDecoder().decode(bytes);
   files.set(path,{path,raw:rawText,name:path.split('/').at(-1)});
   return response(201,{id:'file-1',name:path.split('/').at(-1),
    size:bytes.byteLength,file:{}});
  }
  if(rest.startsWith('/items/file-1')){
   const file=[...files.values()][0];
   return response(200,{id:'file-1',name:file.name,size:new TextEncoder().encode(file.raw).length,
    file:{},eTag:'etag-file',parentReference:{driveId:drive},
    '@microsoft.graph.downloadUrl':url});
  }
  if(rest.startsWith('/items/folder-1/children')){
   return response(200,{value:[...files.values()].map((f)=>({id:'file-1',
    name:f.name,eTag:'etag-file',size:new TextEncoder().encode(f.raw).length,file:{}}))});
  }
  if(rest.startsWith('/root:/')){
   const path=decodeURIComponent(rest.slice('/root:/'.length).split('?')[0]);
   if(path===folder)return response(200,{id:'folder-1',name:'Drafts',folder:{},
    parentReference:{driveId:drive}});
   const file=files.get(path);
   if(!file)return response(404,{});
   return response(200,{id:'file-1',name:file.name,size:new TextEncoder().encode(file.raw).length,
    eTag:'etag-file',file:{},parentReference:{driveId:drive}});
  }
  throw Error('Unexpected Graph route: '+rest);
 };
 const api=createVersionedGraphFiles({boardId:'5107075373',version:3,driveId:drive,
  getAccessToken:async()=> 'token',fetcher});
 return {api,files,requests,folder};
}
test('V3 versioned Graph create returns content-verified receipt and list/read',async()=>{
 const f=fixture(),path=f.folder+'/draft-v3.json';
 assert.equal(await f.api.read(path),null);
 const d={schemaVersion:1,format:'flow-lps-draft',boardId:'5107075373',version:0,
  session:{planVersion:3}};
 const p=await f.api.create(path,d);
 assert.equal(p.path,path);assert.equal(p.name,'draft-v3.json');
 assert.equal((await f.api.read(path)).value.format,'flow-lps-draft');
 assert.equal((await f.api.list(f.folder)).length,1);
 assert.deepEqual((await f.api.list(f.folder))[0].name,'draft-v3.json');
 assert.equal(f.requests.filter(x=>x.method==='PUT').length,1);
 await assert.rejects(f.api.create(path,d),/letezik/);
 assert.equal(f.requests.filter(x=>x.method==='PUT').length,1);
});
test('Graph adapter rejects old V1 path, invalid user-supplied name and unrelated project',async()=>{
 const f=fixture();
 await assert.rejects(f.api.read('Projects/5107075373/Draft-Plans/draft-v1.json'));
 await assert.rejects(f.api.read(f.folder+'/../../approved-v2.json'));
 await assert.rejects(f.api.create(f.folder+'/nested/draft.json',{}));
 await assert.rejects(f.api.list('Projects/5107075373/Approved-Plans'));
 assert.equal(f.requests.length,0);
});
test('Graph adapter never claims a successful write without 201 Created and SHA readback',async()=>{
 const f=fixture();
 const p=f.folder+'/draft-v3-r000001.json';
 await assert.rejects(f.api.create(p,null));
 assert.equal(f.files.size,0);
});

test('V3 approval Graph adapter refuses Sync writes and cross-folder document types',async()=>{
 const f=fixture(),base='Projects/5107075373/Versions/V0003';
 const freeze={schemaVersion:1,boardId:'5107075373',planVersion:3,
  status:'APPROVAL_FROZEN',format:'mflow-versioned-approval-freeze',
  mondayWrites:0,userConfirmed:true};
 await assert.rejects(f.api.create(base+'/Sync/sync-v3-step-000001-ahead.json',
  {...freeze,format:'mflow-v3-sync-ahead'}),/fajlnev/);
 await assert.rejects(f.api.create(base+'/Approved/session-v3-freeze.json',freeze),/fajlnev/);
 await assert.rejects(f.api.create(base+'/Session/session-v3-freeze.json',
  {...freeze,userConfirmed:false}),/fajlnev/);
 await assert.rejects(f.api.create(base+'/Approved/approved-v3.json',
  {...freeze,format:'flow-lps-approved-plan',status:'DRAFT'}),/fajlnev/);
 assert.equal(f.requests.length,0,'Rejected requests must never reach Graph');
});
