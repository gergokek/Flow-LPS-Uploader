import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEditedDraft} from '../edited-draft-validator.js';
import {verifyEditedDraftDownload} from '../edited-draft-verifier.js';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
function fixture(){
 const base={id:'5107075373',tasks:[{id:'101',name:'Test',updatedAt:'2026-11-02'}]};
 const source=stable({id:base.id,workspaceId:base.workspaceId,columns:base.columns,groups:base.groups,tasks:base.tasks.map(({updatedAt,...t})=>t)});
 return JSON.stringify({schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,boardId:'5107075373',source,version:1,base,working:[{id:'101',name:'Test',forecast:{from:'2026-11-30',to:'2026-11-30'}}],history:[{revision:1,type:'edit',at:'2026-11-02T15:37:31Z'}]});
}
test('downloaded edited DRAFT matches original exact bytes and SHA-256',async()=>{
 const originalText=fixture(),bytes=new TextEncoder().encode(originalText);
 const v=await verifyEditedDraftDownload({originalText,downloadedBytes:bytes,boardId:'5107075373'});
 assert.equal(v.verification,'full-content-sha256');assert.equal(v.version,1);
 assert.equal(v.sha256,(await validateEditedDraft(originalText,'5107075373')).sha256);
});
test('reject changed downloaded file or incorrect board',async()=>{
 const originalText=fixture(),bytes=new TextEncoder().encode(originalText+' ');
 await assert.rejects(()=>verifyEditedDraftDownload({originalText,downloadedBytes:bytes,boardId:'5107075373'}),/differs/);
 await assert.rejects(()=>verifyEditedDraftDownload({originalText,downloadedBytes:new TextEncoder().encode(originalText),boardId:'5105949528'}));
});
