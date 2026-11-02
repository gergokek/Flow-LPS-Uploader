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
