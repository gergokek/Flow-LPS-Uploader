// READ ONLY SharePoint folder enumeration for plan version discovery.
// Folder names are NOT proof of approval, active sessions, or completion.
// The caller must inspect each discovered version's immutable receipts.
import {versionFolder,versionLayout,isLegacyVersion} from './version-workspace-layout.js';
const ok=(v,m)=>{if(!v)throw Error(m);};
export function createVersionFolderCatalog({boardId,driveId,getAccessToken,
 fetcher=fetch,assertCurrent=()=>true,maxPages=50}={}){
 ok(typeof boardId==='string'&&/^\d{5,20}$/.test(boardId)&&
  typeof driveId==='string'&&/^b![-_A-Za-z0-9]+$/.test(driveId)&&
  [getAccessToken,fetcher,assertCurrent].every(f=>typeof f==='function')&&
  Number.isSafeInteger(maxPages)&&maxPages>=1&&maxPages<=100,
  'Invalid version catalog reader.');
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const versionsPath='Projects/'+boardId+'/Versions';
 const encoded='/root:/'+versionsPath.split('/').map(encodeURIComponent).join('/');
 const guard=()=>ok(assertCurrent()===true,'Version catalog connection changed.');
 async function api(path){
  guard();const token=await getAccessToken();guard();
  ok(typeof token==='string'&&token.length>0,'Graph token required.');
  const result=await fetcher(root+path,{method:'GET',cache:'no-store',
   redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  guard();return result;
 }
 async function listFolders(){
  const meta=await api(encoded+'?$select=id,name,folder,parentReference');
  if(meta.status===404)return [];
  ok(meta.ok,'Version folder HTTP '+meta.status);
  const folder=await meta.json();
  ok(folder?.id&&folder.folder&&folder.parentReference?.driveId===driveId,
   'Invalid SharePoint Versions folder.');
  const output=[],names=new Set(),ids=new Set(),seen=new Set();
  let next=root+'/items/'+encodeURIComponent(folder.id)+'/children?$select=id,name,folder&$top=200';
  for(let i=0;next&&i<maxPages;i++){
   ok(next.startsWith(root+'/')&&!seen.has(next),'Unsafe or incomplete folder pagination.');
   seen.add(next);
   const reply=await api(next.slice(root.length));
   ok(reply.ok,'Version folder listing HTTP '+reply.status);
   const data=await reply.json();
   ok(Array.isArray(data?.value),'Invalid SharePoint folder response.');
   for(const item of data.value){
    ok(item.id&&item.folder&&typeof item.name==='string'&&
     /^V[0-9]{4}$/.test(item.name)&&!names.has(item.name)&&!ids.has(item.id),
     'Unknown, duplicate or conflicting version folder.');
    const version=Number(item.name.slice(1));
    ok(version>=1&&version<=9999&&item.name===versionFolder(version),
     'Invalid plan folder number.');
    names.add(item.name);ids.add(item.id);output.push(version);
   }
   const cursor=data['@odata.nextLink'];
   next=cursor||null;
  }
  ok(!next,'Version folder enumeration exceeded pagination limit.');
  guard();return output.sort((a,b)=>a-b);
 }
 async function inspectFolder(version){
  const layout=versionLayout(boardId,version);
  ok(!layout.legacy,'Legacy version cannot be physically enumerated.');
  let hasEvidence=false;
  for(const folder of [layout.session,layout.drafts,layout.approved,layout.sync]){
   const path='/root:/'+folder.split('/').map(encodeURIComponent).join('/');
   const meta=await api(path+'?$select=id,folder,parentReference');
   ok(meta.ok,'A verzio almappaja hianyzik vagy hibas: '+folder);
   const m=await meta.json();
   ok(m.id&&m.folder&&m.parentReference?.driveId===driveId,
    'A verzio almappa nem ellenorzott SharePoint mappa.');
   let next=root+'/items/'+encodeURIComponent(m.id)+'/children?$select=id,name,file,folder&$top=200';
   const seen=new Set();
   for(let page=0;next&&page<maxPages;page++){
    ok(next.startsWith(root+'/')&&!seen.has(next),
     'Untrusted/incomplete version folder page.');
    seen.add(next);
    const r=await api(next.slice(root.length));
    ok(r.ok,'Version content HTTP '+r.status);
    const data=await r.json();
    ok(Array.isArray(data?.value),'Invalid version content list.');
    for(const item of data.value){
     ok(item.id&&item.file&&typeof item.name==='string',
      'Unexpected subfolder or invalid file in version tree.');
     hasEvidence=true;
    }
    next=data['@odata.nextLink']||null;
   }
   ok(!next,'Incomplete version content pagination.');
  }
  return hasEvidence?'HAS_FILES':'PREPARED_EMPTY';
 }
 async function inspect({legacyVersions=[]}={}){
  ok(Array.isArray(legacyVersions)&&legacyVersions.every(n=>
   Number.isSafeInteger(n)&&n>0&&n<=9999&&isLegacyVersion(boardId,n))&&
   new Set(legacyVersions).size===legacyVersions.length,
   'Legacy plan versions must be explicitly verified.');
  const folders=await listFolders();
  const preparedFolders=[],occupiedFolders=[];
  for(const version of folders){
   const className=await inspectFolder(version);
   if(className==='PREPARED_EMPTY')preparedFolders.push(version);
   else occupiedFolders.push(version);
  }
  const combined=[...legacyVersions,...occupiedFolders].sort((a,b)=>a-b);
  ok(new Set(combined).size===combined.length,
   'Legacy and versioned plan stores overlap.');
  ok(combined.every((n,i)=>n===i+1),
   'A gap exists in the verified plan version list.');
  return Object.freeze({complete:true,versions:combined,
   paths:Object.freeze(combined.map(n=>versionLayout(boardId,n))),
   folderVersions:occupiedFolders,preparedFolders,legacyVersions:[...legacyVersions],readOnly:true,
   projectWrites:0});
 }
 return Object.freeze({inspect});
}
