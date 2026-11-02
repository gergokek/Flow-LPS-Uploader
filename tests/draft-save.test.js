import test from 'node:test';
import assert from 'node:assert/strict';
import {saveDraftTransfer} from '../draft-save.js';
async function transfer(){
 const task={id:'101'};
 const payload=JSON.stringify({schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',version:0,history:[],base:{id:'5107075373',tasks:[task]},working:[task]});
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
 const sha256=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
 return JSON.stringify({schemaVersion:1,format:'flow-lps-draft-transfer',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',sha256,payload});
}
test('versioned save writes only Draft-Plans and verifies file metadata',async()=>{
 const folders=new Map([['',{id:'root',folder:{}}],['Projects',{id:'projects',folder:{}}]]);
 const calls=[];let stored=null;
 const fetcher=async(url,opt={})=>{
  calls.push({url,method:opt.method||'GET'});
  if(opt.method==='POST'){
   const parentId=url.match(/\/items\/([^/]+)\/children/)[1],parent=[...folders].find(([,v])=>v.id===parentId)?.[0];
   const name=JSON.parse(opt.body).name,path=parent?parent+'/'+name:name;
   const item={id:'folder-'+folders.size,folder:{}};folders.set(path,item);return {ok:true,json:async()=>item};
  }
  if(opt.method==='PUT'){stored={id:'item-1',name:'draft-v12345678.json',size:opt.body.length,file:{}};return {ok:true,json:async()=>stored};}
  if(url.includes('/items/item-1?'))return {ok:true,json:async()=>stored};
  const path=url.includes('/root?')?'':decodeURIComponent(url.split('/root:/')[1]||'');
  const item=folders.get(path);return item?{ok:true,json:async()=>item}:{ok:false,status:404};
 };
 const result=await saveDraftTransfer({transferText:await transfer(),boardId:'5107075373',driveId:'b!example',getAccessToken:async()=> 'test-token',fetcher,versionId:'v12345678'});
 assert.equal(result.verification,'metadata-only');
 assert.equal(calls.filter(c=>c.method==='PUT').length,1);
 assert.match(calls.find(c=>c.method==='PUT').url,/\/Draft-Plans\/draft-v12345678\.json:/);
 assert.equal(calls.some(c=>c.url.includes('Approved-Plans')),false);
});
test('rejects foreign board before any write',async()=>{
 const transferText=await transfer();
 await assert.rejects(()=>saveDraftTransfer({transferText,boardId:'5105949528',driveId:'b!example',getAccessToken:async()=> 'test',fetcher:async()=>{throw Error('network called');},versionId:'v12345678'}),/board/);
});
