import test from 'node:test';
import assert from 'node:assert/strict';
import {saveDraftTransfer} from '../draft-save.js';
import {validateEditedDraft} from '../edited-draft-validator.js';

const boardId='5107075373',driveId='b!example',versionId='v4-abcdefgh-12345678';
const filename='draft-'+versionId+'.json';
const downloadUrl='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=preauth';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
async function fixture(){
 const base={id:boardId,tasks:[{id:'101',name:'Sample'}]};
 const edited={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId,base,
  source:stable({id:boardId,workspaceId:undefined,columns:undefined,groups:undefined,tasks:base.tasks}),
  working:[{id:'101',name:'Sample',forecast:{from:'2026-11-30',to:'2026-11-30'}}],
  version:4,history:Array.from({length:4},(_,i)=>({revision:i+1,type:'edit'}))};
 const content=JSON.stringify(edited),validated=await validateEditedDraft(content,boardId);
 return {content,validated,bytes:new TextEncoder().encode(content)};
}
function mock(content,{corrupt=false,etagChange=false,cors=false,wrongId=false}={}){
 const calls=[],folders=new Map([['',{id:'root',folder:{}}],['Projects',{id:'projects',folder:{}}]]);
 const fileId='item-v4';
 let checks=0;
 const payload=new TextEncoder().encode(corrupt?content+' ':content);
 const goodSize=new TextEncoder().encode(content).byteLength;
 const metadata=()=>({id:wrongId?'other-item':fileId,name:filename,size:goodSize,file:{},
  eTag:etagChange&&checks++>=2?'etag-2':'etag-1',
  parentReference:{driveId},'@microsoft.graph.downloadUrl':downloadUrl});
 const fetcher=async(url,opt={})=>{
  calls.push({url,opt});
  if(url===downloadUrl){
   if(cors)throw Error('CORS');
   return {ok:true,headers:{get:()=>String(payload.byteLength)},arrayBuffer:async()=>payload.buffer};
  }
  if(opt.method==='POST'){
   const parentId=url.match(/\/items\/([^/]+)\/children/)[1];
   const parent=[...folders].find(([,v])=>v.id===parentId)?.[0];
   const name=JSON.parse(opt.body).name,path=parent?parent+'/'+name:name;
   const item={id:'folder-'+folders.size,folder:{}};
   folders.set(path,item);
   return {ok:true,json:async()=>item};
  }
  if(opt.method==='PUT')return {ok:true,json:async()=>({id:fileId,name:filename,size:goodSize,file:{}})};
  if(url.includes('/items/'+fileId+'?$select='))return {ok:true,json:async()=>({id:fileId,name:filename,size:goodSize,file:{}})};
  if(url.includes('/root:/Projects/'+boardId+'/Draft-Plans/'+filename))
   return {ok:true,json:async()=>metadata()};
  if(url.endsWith('/items/'+fileId))return {ok:true,json:async()=>metadata()};
  const path=url.includes('/root?')?'':decodeURIComponent(url.split('/root:/')[1]||'');
  const item=folders.get(path);
  return item?{ok:true,json:async()=>item}:{ok:false,status:404};
 };
 return {fetcher,calls};
}
test('edited DRAFT save reports verified only after Graph authenticated readback, SHA-256 and stable eTag',async()=>{
 const f=await fixture(),t=mock(f.content);
 const result=await saveDraftTransfer({editedDraftText:f.content,boardId,driveId,versionId,
  getAccessToken:async()=> 'test-token',fetcher:t.fetcher});
 assert.equal(result.verification,'content-sha256-and-etag');
 assert.equal(result.eTag,'etag-1');
 assert.equal(result.sha256,f.validated.sha256);
 assert.equal(result.bytes,f.bytes.byteLength);
 assert.equal(result.isApprovedPlan,false);
 assert.equal(result.mondaySyncAllowed,false);
 assert.equal(t.calls.filter(x=>x.opt.method==='PUT').length,1);
 assert.equal(t.calls.filter(x=>x.url===downloadUrl).length,1);
 const download=t.calls.find(x=>x.url===downloadUrl);
 assert.equal(download.opt.headers,undefined);
 assert.equal(download.opt.credentials,'omit');
 assert.ok(t.calls.filter(x=>x.opt.method==='PUT').every(x=>x.url.includes('/Draft-Plans/')));
});
test('uploaded-but-unverified DRAFT is never reported as successfully checked',async()=>{
 const f=await fixture();
 for(const scenario of [{corrupt:true},{etagChange:true},{cors:true},{wrongId:true}]){
  const t=mock(f.content,scenario);
  let error=null;
  try{await saveDraftTransfer({editedDraftText:f.content,boardId,driveId,versionId,
   getAccessToken:async()=> 'test-token',fetcher:t.fetcher});}
  catch(e){error=e;}
  assert.ok(error,JSON.stringify(scenario));
  assert.match(error.message,/nem sikerult/);
  assert.equal(error.uploaded.name,filename);
  assert.equal(t.calls.filter(x=>x.opt.method==='PUT').length,1);
 }
});
