import test from 'node:test';
import assert from 'node:assert/strict';
import {listStoredDraftVersions,loadStoredDraftVersion} from '../sharepoint-version-picker.js';
import {validateEditedDraft} from '../edited-draft-validator.js';

const boardId='5107075373',driveId='b!testDrive',fileName='draft-v2-mw0gh0xt-befdfc56-ad4.json';
const temp='https://hanoplan.sharepoint.com/_layouts/15/download.aspx?token=short';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
async function fixture(){
 const base={id:boardId,tasks:[{id:'101',name:'Sample'}]};
 const draft={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId,base,
 source:stable({id:boardId,workspaceId:undefined,columns:undefined,groups:undefined,tasks:base.tasks}),
 working:[{id:'101',name:'Sample',forecast:{from:'2026-11-30',to:'2026-11-30'}}],
 version:2,history:[{revision:1,type:'edit'},{revision:2,type:'edit'}]};
 const content=JSON.stringify(draft);
 await validateEditedDraft(content,boardId);
 return {content,size:new TextEncoder().encode(content).length};
}
const auth=async()=> 'test-access-token';
function mock({content,size,versionChanged=false,malicious=false}){
 let reads=0;
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url===temp){return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(content).buffer};}
  if(url.includes('/root:/'))return {ok:true,json:async()=>({id:'folder',folder:{}})};
  if(url.includes('/children'))return {ok:true,json:async()=>({value:[
   {id:'item',name:fileName,size,file:{},eTag:'etag-1',lastModifiedDateTime:'2026-11-03T08:57:39Z'},
   {id:'ignore',name:'notes.txt',size:5,file:{},eTag:'x'}]})};
  if(url.endsWith('/items/item')){
   reads++;
   return {ok:true,json:async()=>({id:'item',name:fileName,size,file:{},
    eTag:versionChanged&&reads>1?'etag-2':'etag-1',
    parentReference:{driveId},'@microsoft.graph.downloadUrl':malicious?'https://example.com/test':temp})};
  }
  throw Error('Unexpected '+url);
 };
 return {fetcher,calls};
}
test('list filters unrelated files and sorts versions, without mutations',async()=>{
 const f=await fixture(),m=mock(f);
 const rows=await listStoredDraftVersions({boardId,driveId,getAccessToken:auth,fetcher:m.fetcher});
 assert.equal(rows.length,1);
 assert.equal(rows[0].name,fileName);
 assert.equal(rows[0].version,2);
 assert.ok(m.calls.every(c=>c.options.method==='GET'));
 assert.ok(m.calls.every(c=>c.options.headers.Authorization==='Bearer test-access-token'));
});
test('load retrieves SHA-256-checked original DRAFT with no token on download',async()=>{
 const f=await fixture(),m=mock(f);
 const [selected]=await listStoredDraftVersions({boardId,driveId,getAccessToken:auth,fetcher:m.fetcher});
 const v=await loadStoredDraftVersion({boardId,driveId,selected,getAccessToken:auth,fetcher:m.fetcher});
 assert.equal(v.content,f.content);
 assert.equal(v.version,2);
 assert.equal(v.taskCount,1);
 assert.equal(v.status,'VERIFIED_DRAFT_ONLY');
 assert.equal(v.mondaySyncAllowed,false);
 assert.equal(m.calls.filter(c=>c.url.includes('/items/item')).length,2);
 const download=m.calls.find(c=>c.url===temp);
 assert.equal(download.options.credentials,'omit');
 assert.equal(download.options.headers,undefined);
 assert.ok(m.calls.every(c=>c.options.method==='GET'));
});
test('changed eTag and untrusted URL fail without returning content',async()=>{
 const f=await fixture();
 for(const opt of [{versionChanged:true},{malicious:true},{content:f.content+' ',size:f.size}]){
  const m=mock({...f,...opt}),selected={id:'item',name:fileName,version:2,size:f.size,eTag:'etag-1'};
  await assert.rejects(()=>loadStoredDraftVersion({boardId,driveId,selected,
   getAccessToken:auth,fetcher:m.fetcher}));
 }
});
