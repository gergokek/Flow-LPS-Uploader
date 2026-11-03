import {validateEditedDraft} from './edited-draft-validator.js';

const graph='https://graph.microsoft.com/v1.0/drives/';
const namePattern=/^draft-v([1-9]\d*)-[A-Za-z0-9_-]{8,100}\.json$/;
const maxBytes=5_000_000;
const trustedSuffixes=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com','.1drv.com','.blob.core.windows.net'];
const validUrl=value=>{
 let u;try{u=new URL(value);}catch{throw Error('Hianyzik az ellenorzott SharePoint letoltesi URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!trustedSuffixes.some(x=>u.hostname.toLowerCase().endsWith(x)))
  throw Error('Nem megbizhato SharePoint letoltesi URL.');
 return u.href;
};
function verifyArgs({boardId,driveId,getAccessToken,fetcher}){
 if(!/^\d+$/.test(boardId||'')||!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
  typeof getAccessToken!=='function'||typeof fetcher!=='function')throw Error('Ervenytelen projekt vagy Graph kapcsolat.');
}
export async function listStoredDraftVersions({boardId,driveId,getAccessToken,fetcher=fetch}={}){
 verifyArgs({boardId,driveId,getAccessToken,fetcher});
 const token=await getAccessToken(),root=graph+encodeURIComponent(driveId);
 if(!token)throw Error('Microsoft Graph token hianyzik.');
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const folder='Projects/'+boardId+'/Draft-Plans';
 const info=await fetcher(root+'/root:/'+folder,{method:'GET',cache:'no-store',redirect:'error',headers});
 if(!info.ok)throw Error('SharePoint Draft-Plans mappa HTTP '+info.status);
 const folderData=await info.json();
 if(!folderData?.folder||typeof folderData.id!=='string')throw Error('A Draft-Plans nem erheto el.');
 let next=root+'/items/'+encodeURIComponent(folderData.id)+'/children?$top=200&$select=id,name,size,file,eTag,lastModifiedDateTime,parentReference';
 const entries=[],seen=new Set();
 for(let page=0;next&&page<30;page++){
  if(!next.startsWith(root+'/'))throw Error('Nem megbizhato Graph lapozasi URL.');
  const response=await fetcher(next,{method:'GET',cache:'no-store',redirect:'error',headers});
  if(!response.ok)throw Error('SharePoint verzio lista HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data?.value))throw Error('Hibas SharePoint verzio lista.');
  for(const item of data.value){
   const match=namePattern.exec(item?.name||'');
   if(!match||!item.file||typeof item.id!=='string'||!item.id||
    !Number.isSafeInteger(item.size)||item.size<=0||item.size>maxBytes||
    typeof item.eTag!=='string'||!item.eTag||seen.has(item.id))continue;
   seen.add(item.id);
   entries.push({id:item.id,name:item.name,version:Number(match[1]),size:item.size,
    eTag:item.eTag,modifiedAt:item.lastModifiedDateTime||null});
  }
  next=data['@odata.nextLink']||null;
 }
 if(next)throw Error('A SharePoint verzio lista tul sok oldalas.');
 return entries.sort((a,b)=>b.version-a.version||(b.modifiedAt||'').localeCompare(a.modifiedAt||''));
}
export async function loadStoredDraftVersion({boardId,driveId,selected,getAccessToken,fetcher=fetch}={}){
 verifyArgs({boardId,driveId,getAccessToken,fetcher});
 if(!selected||!namePattern.test(selected.name||'')||!selected.id||typeof selected.eTag!=='string'||!selected.eTag||
  !Number.isSafeInteger(selected.size)||selected.size<=0||selected.size>maxBytes)
  throw Error('Valassz egy ervenyes DRAFT verziot.');
 const token=await getAccessToken(),root=graph+encodeURIComponent(driveId);
 if(!token)throw Error('Microsoft Graph token hianyzik.');
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const metaUrl=root+'/items/'+encodeURIComponent(selected.id);
 const metadata=async()=>{
  const response=await fetcher(metaUrl,{method:'GET',cache:'no-store',redirect:'error',headers});
  if(!response.ok)throw Error('SharePoint fajl metadata HTTP '+response.status);
  const item=await response.json();
  if(item?.id!==selected.id||item.name!==selected.name||item.size!==selected.size||
   item.eTag!==selected.eTag||item.parentReference?.driveId!==driveId||!item.file)
   throw Error('A kivalasztott SharePoint verzio megvaltozott. Frissitsd a listat.');
  return item;
 };
 const first=await metadata(),downloadUrl=validUrl(first['@microsoft.graph.downloadUrl']);
 let response;try{response=await fetcher(downloadUrl,{method:'GET',mode:'cors',cache:'no-store',
  credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow'});}
 catch{throw Error('SharePoint CORS / halozati letoltesi hiba.');}
 if(!response.ok)throw Error('SharePoint letoltes HTTP '+response.status);
 const data=await response.arrayBuffer();
 if(data.byteLength!==selected.size||data.byteLength>maxBytes)throw Error('A SharePoint fajlmeret elter.');
 const content=new TextDecoder('utf-8',{fatal:true}).decode(data);
 const verified=await validateEditedDraft(content,boardId);
 const filenameVersion=Number(namePattern.exec(selected.name)[1]);
 if(verified.version!==filenameVersion||verified.bytes!==selected.size)
  throw Error('A DRAFT verzio vagy tartalom nem egyezik a SharePoint metadataival.');
 await metadata();
 return Object.freeze({name:selected.name,content,sha256:verified.sha256,bytes:verified.bytes,
  version:verified.version,taskCount:verified.taskCount,status:'VERIFIED_DRAFT_ONLY',
  isApprovedPlan:false,mondaySyncAllowed:false});
}
