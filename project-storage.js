import {versionLayout,VERSION_FOLDERS,VERSION_ROOT,versionFolder} from './version-workspace-layout.js';
// Project folder provisioning on the top-level, Microsoft-authenticated page.
// No Monday API calls; no overwrite or deletion of existing SharePoint files.
export const PROJECT_FOLDERS=Object.freeze(['Draft-Plans','Approved-Plans','Sync-Status','Backups','Logs']);
export function createProjectStorage({driveId,getAccessToken,fetcher=fetch}={}){
 if(typeof driveId!=='string'||!driveId.startsWith('b!')||typeof getAccessToken!=='function'||typeof fetcher!=='function')throw new Error('Hibas Graph tarhely konfiguracio.');
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 async function request(path,options={}){
  const token=await getAccessToken();
  if(!token)throw new Error('Microsoft bejelentkezes szukseges.');
  const response=await fetcher(root+path,{...options,cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
  if(!response.ok){const error=new Error('SharePoint Graph HTTP '+response.status);error.status=response.status;throw error;}
  return response.json();
 }
 async function folder(path,parentId,name,create){
  let value;
  try{value=await request('/root:/'+path);}
  catch(err){
   if(err.status!==404||!create)throw err;
   try{value=await request('/items/'+encodeURIComponent(parentId)+'/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})});}
   catch(e){if(e.status!==409)throw e;value=await request('/root:/'+path);}
  }
  if(!value?.id||!value.folder)throw new Error('Nem ervenyes SharePoint mappa: '+path);
  return value;
 }
 async function ensure(boardId){
  if(typeof boardId!=='string'||!/^\d{5,20}$/.test(boardId))throw new Error('Ervenytelen Monday Board ID.');
  const library=await request('/root?$select=id,folder');
  if(!library?.id||!library.folder)throw new Error('Hibas dokumentumtar.');
  const projects=await folder('Projects',library.id,'Projects',true);
  const project=await folder('Projects/'+boardId,projects.id,boardId,true);
  for(const name of PROJECT_FOLDERS)await folder('Projects/'+boardId+'/'+name,project.id,name,true);
  return {boardId,path:'Projects/'+boardId,folders:[...PROJECT_FOLDERS],verification:'folder-metadata'};
 }

 // New versions (V3+) have their own independent evidence tree.
 // Provisioning creates ONLY empty folders, never copies, moves or edits data.
 async function ensureVersion(boardId,version){
  const layout=versionLayout(boardId,version);
  if(layout.legacy)return Object.freeze({...await ensure(boardId),version,legacy:true});
  await ensure(boardId);
  const project=await folder('Projects/'+boardId,'unused',boardId,false);
  const versions=await folder('Projects/'+boardId+'/'+VERSION_ROOT,project.id,VERSION_ROOT,true);
  const versionDir=await folder(layout.versionRoot,versions.id,versionFolder(version),true);
  const ids=new Set();
  for(const name of VERSION_FOLDERS){
   const item=await folder(layout.versionRoot+'/'+name,versionDir.id,name,true);
   if(ids.has(item.id))throw Error('Duplicate version folder ID.');
   ids.add(item.id);
  }
  return Object.freeze({boardId,planVersion:version,path:layout.versionRoot,
   legacy:false,folders:[...VERSION_FOLDERS],manifest:layout.manifest,
   verification:'folder-metadata',filesCreated:0,mondayWrites:0});
 }
 return Object.freeze({ensure,ensureVersion});
}
