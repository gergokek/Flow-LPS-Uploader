import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersionFolderCatalog} from '../project-version-folder-catalog.js';
function fixture({folders=[],missing=false,paginate=false,prepared=[]}={}){
 const seen=[],root='https://graph.microsoft.com/v1.0/drives/b!sample';
 const respond=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
 const fetcher=async(url,opts)=>{
  seen.push({url,method:opts.method});
  assert.equal(opts.method,'GET');
  if(url.includes('/root:')){
   if(missing)return respond(404,{});
   const match=url.match(/V(\\d{4})\\/(Session|Drafts|Approved|Sync)/);
   if(match)return respond(200,{id:'sub-'+Number(match[1])+'-'+match[2],
    folder:{},parentReference:{driveId:'b!sample'}});
   return respond(200,{id:'parent',folder:{},parentReference:{driveId:'b!sample'}});
  }
  if(url.includes('/children')){
   if(url.includes('/items/parent/children')){
    const start=url.includes('page=2')?1:0;
    const subset=paginate?folders.slice(start,start+1):folders;
    return respond(200,{value:subset.map((name,i)=>({name,
     id:'folder-'+(start+i),folder:{}})),...(paginate&&start+1<folders.length?
       {'@odata.nextLink':root+'/items/parent/children?page=2'}:{})});
   }
   const parts=/\\/items\\/sub-(\\d+)-(Session|Drafts|Approved|Sync)\\/children/.exec(url);
   assert.ok(parts,'Unexpected version folder listing: '+url);
   return respond(200,{value:prepared.includes(Number(parts[1]))?[]:
    (parts[2]==='Session'?[{id:'evidence-'+parts[1],name:'version-info.json',file:{}}]:[])});
  }
  throw Error('Unexpected Graph URL');
 };
 const catalog=createVersionFolderCatalog({boardId:'5107075373',
  driveId:'b!sample',getAccessToken:async()=> 'token',fetcher});
 return {catalog,seen};
}
test('legacy V1/V2 plus physical V3/V4 selects exact full sequence without file writes',async()=>{
 const f=fixture({folders:['V0004','V0003']});
 const proof=await f.catalog.inspect({legacyVersions:[1,2]});
 assert.deepEqual(proof.versions,[1,2,3,4]);
 assert.equal(proof.paths[0].legacy,true);
 assert.equal(proof.paths[2].versionRoot,'Projects/5107075373/Versions/V0003');
 assert.equal(proof.projectWrites,0);
 assert.ok(f.seen.every(x=>x.method==='GET'));
});
test('missing Versions directory is valid for legacy completed V1/V2 but not an invented V3',async()=>{
 const f=fixture({missing:true});
 assert.deepEqual((await f.catalog.inspect({legacyVersions:[1,2]})).versions,[1,2]);
});
test('a version gap, duplicate, alien folder or legacy overlay blocks',async()=>{
 await assert.rejects(fixture({folders:['V0004']}).catalog.inspect({legacyVersions:[1,2]}));
 await assert.rejects(fixture({folders:['V0003','V0003']}).catalog.inspect({legacyVersions:[1,2]}));
 await assert.rejects(fixture({folders:['misc']}).catalog.inspect({legacyVersions:[1,2]}));
 await assert.rejects(fixture({folders:['V0002']}).catalog.inspect({legacyVersions:[1,2]}));
});
test('handles paginated Graph folder enumeration without skipping',async()=>{
 const x=fixture({folders:['V0003','V0004'],paginate:true});
 const proof=await x.catalog.inspect({legacyVersions:[1,2]});
 assert.deepEqual(proof.versions,[1,2,3,4]);
});
test('refuses unverified or externally invented legacy references',async()=>{
 await assert.rejects(fixture().catalog.inspect({legacyVersions:[1,3]}));
 await assert.rejects(fixture().catalog.inspect({legacyVersions:[2,2]}));
});

test('fully empty prepared V3 is ignored as a session while remaining inspectable',async()=>{
 const f=fixture({folders:['V0003'],prepared:[3]});
 const x=await f.catalog.inspect({legacyVersions:[1,2]});
 assert.deepEqual(x.versions,[1,2]);assert.deepEqual(x.preparedFolders,[3]);
 assert.deepEqual(x.folderVersions,[]);
 assert.ok(f.seen.every(req=>req.method==='GET'));
});
test('an orphan evidence file cannot be silently classified as an empty prepared version',async()=>{
 const f=fixture({folders:['V0003']});
 const x=await f.catalog.inspect({legacyVersions:[1,2]});
 assert.deepEqual(x.versions,[1,2,3]);
 assert.deepEqual(x.preparedFolders,[]);
 // A separate full version inspector must now reject the missing/corrupt manifest.
});
