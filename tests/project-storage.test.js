import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectStorage,PROJECT_FOLDERS} from '../project-storage.js';
test('creates missing board folders and leaves existing folders unchanged',async()=>{
 const folders=new Map([['',{id:'root',folder:{}}],['Projects',{id:'projects',folder:{}}]]);
 const posts=[];
 const fetcher=async(url,options={})=>{
  if(options.method==='POST'){
   const parentId=url.match(/\/items\/([^/]+)\/children/)[1];
   const parent=[...folders].find(([,v])=>v.id===parentId)?.[0];
   const name=JSON.parse(options.body).name, path=parent?parent+'/'+name:name;
   posts.push(path);const item={id:'new'+posts.length,folder:{}};folders.set(path,item);
   return {ok:true,json:async()=>item};
  }
  const path=url.includes('/root?')?'':decodeURIComponent(url.split('/root:/')[1]||'');
  const item=folders.get(path);
  return item?{ok:true,json:async()=>item}:{ok:false,status:404};
 };
 const service=createProjectStorage({driveId:'b!example',getAccessToken:async()=> 'mock',fetcher});
 const result=await service.ensure('5107075373');
 assert.equal(result.path,'Projects/5107075373');
 assert.deepEqual(result.folders,PROJECT_FOLDERS);
 assert.equal(posts.length,6);
 await service.ensure('5107075373');
 assert.equal(posts.length,6);
});
test('rejects invalid board identifiers without Graph requests',async()=>{
 const service=createProjectStorage({driveId:'b!example',getAccessToken:async()=> 'mock',fetcher:async()=>{throw Error('unexpected network');}});
 await assert.rejects(()=>service.ensure('../../5105949528'),/Board ID/);
});

test('V3 provisioning creates only nested empty folders, never copies or overwrites files',async()=>{
 const folders=new Map([['',{id:'root',folder:{}}],['Projects',{id:'projects',folder:{}}]]);
 const calls=[];
 const fetcher=async(url,options={})=>{
  if(options.method==='POST'){
   const parentId=decodeURIComponent(url.split('/items/')[1].split('/children')[0]);
   const parent=[...folders].find(([,v])=>v.id===parentId)?.[0];
   const data=JSON.parse(options.body);
   assert.equal(data['@microsoft.graph.conflictBehavior'],'fail');
   assert.deepEqual(data.folder,{});
   const name=data.name,path=parent?parent+'/'+name:name;
   if(folders.has(path))return {ok:false,status:409};
   const item={id:'item'+folders.size,name,folder:{}};
   calls.push({method:'POST',path});folders.set(path,item);
   return {ok:true,json:async()=>item};
  }
  assert.equal(options.method===undefined||options.method==='GET',true);
  const p=url.includes('/root?')?'':decodeURIComponent(url.split('/root:/')[1]||'');
  return folders.has(p)?{ok:true,json:async()=>folders.get(p)}:{ok:false,status:404};
 };
 const store=createProjectStorage({driveId:'b!example',getAccessToken:async()=>'token',fetcher});
 const first=await store.ensureVersion('5107075373',3);
 assert.equal(first.path,'Projects/5107075373/Versions/V0003');
 assert.deepEqual(first.folders,['Session','Drafts','Approved','Sync']);
 assert.equal(first.filesCreated,0);assert.equal(first.mondayWrites,0);
 assert.equal(calls.filter(x=>x.method==='POST').length,12);
 await store.ensureVersion('5107075373',3);
 assert.equal(calls.length,12,'A second provisioning must be entirely idempotent.');
 const next=await store.ensureVersion('5107075373',4);
 assert.equal(next.path,'Projects/5107075373/Versions/V0004');
 assert.equal(calls.length,17,'Only the new version folder and its children are created.');
 assert.equal(folders.has(first.manifest),false,'No manifest without verified session creation.');
});
test('invalid version cannot create any SharePoint folder',async()=>{
 let calls=0;
 const s=createProjectStorage({driveId:'b!example',getAccessToken:async()=>'token',fetcher:async()=>{calls++;throw Error('network');}});
 await assert.rejects(()=>s.ensureVersion('5107075373',0),/version/);
 await assert.rejects(()=>s.ensureVersion('../board',3));
 assert.equal(calls,0);
});
