import {validateEditedDraft} from './edited-draft-validator.js';

const graphRoot='https://graph.microsoft.com/v1.0/drives/';
const filenamePattern=/^draft-v([1-9]\d*)-[A-Za-z0-9_-]{8,100}\.json$/;
const maxBytes=5_000_000;
const allowedDownloadHosts=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com','.1drv.com','.blob.core.windows.net'];
function safeDownloadUrl(value){
 if(typeof value!=='string')throw new Error('Graph did not provide a preauthenticated download URL');
 let url;
 try{url=new URL(value);}catch{throw new Error('Graph returned invalid download URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||
    !allowedDownloadHosts.some(suffix=>url.hostname.toLowerCase().endsWith(suffix)))
  throw new Error('Graph returned untrusted download URL');
 return url.href;
}


function reviewData(json,boardId){
 const r=JSON.parse(json);
 if(!/^\d+$/.test(boardId||'')||r?.schemaVersion!==1||
 r.format!=='flow-lps-draft-review-request'||r.status!=='REVIEW_REQUEST'||
 r.isApprovedPlan!==false||r.approvalDecision!==null||r.mondaySyncAllowed!==false||
 r.draft?.boardId!==boardId||!Number.isSafeInteger(r.draft.version)||r.draft.version<1||
 !Number.isSafeInteger(r.draft.taskCount)||r.draft.taskCount<1||
 !Number.isSafeInteger(r.draft.bytes)||r.draft.bytes<=0||r.draft.bytes>maxBytes||
 !/^[0-9a-f]{64}$/.test(r.draft.sha256||''))
  throw new Error('Invalid REVIEW REQUEST');
 return r;
}

export async function verifyGraphDraftContent({requestText,boardId,driveId,fileName,getAccessToken,fetcher=fetch}={}){
 const review=reviewData(requestText,boardId),version=review.draft.version;
 const match=filenamePattern.exec(fileName||'');
 if(!match||Number(match[1])!==version||!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
 typeof getAccessToken!=='function'||typeof fetcher!=='function')
  throw new Error('Invalid SharePoint draft filename or connection');
 const token=await getAccessToken();
 if(typeof token!=='string'||!token)throw new Error('Microsoft Graph token missing');
 const auth={Authorization:'Bearer '+token,Accept:'application/json'};
 const path='Projects/'+boardId+'/Draft-Plans/'+fileName;
 const rootUrl=graphRoot+encodeURIComponent(driveId);
 const pathUrl=rootUrl+'/root:/'+path.split('/').map(encodeURIComponent).join('/');
 const metadataUrl=pathUrl+'?$select=id,name,size,file,parentReference,eTag,lastModifiedDateTime';
 const requestMetadata=async()=>{
  const response=await fetcher(metadataUrl,{method:'GET',cache:'no-store',redirect:'error',headers:auth});
  if(!response.ok)throw new Error('Graph metadata HTTP '+response.status);
  const item=await response.json();
  if(!item?.id||item.name!==fileName||item.size!==review.draft.bytes||
     !item.file||item.parentReference?.driveId!==driveId||
     typeof item.eTag!=='string'||!item.eTag)
   throw new Error('Graph metadata mismatch or missing eTag');
  return item;
 };
 const first=await requestMetadata();
 // Graph /content triggers an authenticated 302 redirect that browsers cannot
 // follow during CORS preflight. Use the short-lived, preauthenticated URL instead.
 // Never forward the Microsoft Graph bearer token or cookies to the download host.
 const itemUrl=rootUrl+'/items/'+encodeURIComponent(first.id);
 const itemResponse=await fetcher(itemUrl,{method:'GET',cache:'no-store',redirect:'error',headers:auth});
 if(!itemResponse.ok)throw new Error('Graph driveItem download URL request HTTP '+itemResponse.status);
 const downloadItem=await itemResponse.json();
 if(downloadItem?.id!==first.id||downloadItem.name!==fileName||
    downloadItem.size!==first.size||downloadItem.eTag!==first.eTag||
    downloadItem.parentReference?.driveId!==driveId||!downloadItem.file)
  throw new Error('Graph driveItem differs from SharePoint metadata');
 const downloadUrl=safeDownloadUrl(downloadItem['@microsoft.graph.downloadUrl']);
 let response;
 try{
  response=await fetcher(downloadUrl,{method:'GET',mode:'cors',cache:'no-store',
   credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow'});
 }catch{
  throw new Error('Preauthenticated SharePoint download blocked by CORS or network; no content attestation produced');
 }
 if(!response.ok)throw new Error('Preauthenticated SharePoint download HTTP '+response.status);
 const lengthRaw=response.headers?.get?.('content-length');
 if(lengthRaw!==null&&lengthRaw!==undefined&&(!/^\d+$/.test(lengthRaw)||Number(lengthRaw)>maxBytes))
  throw new Error('SharePoint content exceeds size limit');
 const buffer=await response.arrayBuffer();
 if(buffer.byteLength!==review.draft.bytes||buffer.byteLength>maxBytes)
  throw new Error('Graph downloaded content size mismatch');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
 const result=await validateEditedDraft(text,boardId);
 if(result.version!==version||result.taskCount!==review.draft.taskCount||
    result.bytes!==review.draft.bytes||result.sha256!==review.draft.sha256)
  throw new Error('Graph downloaded DRAFT SHA-256 or version does not match REVIEW REQUEST');
 const second=await requestMetadata();
 if(first.id!==second.id||first.eTag!==second.eTag||first.size!==second.size)
  throw new Error('SharePoint file changed during content verification');
 return Object.freeze({
  schemaVersion:1,format:'flow-lps-sharepoint-review-evidence',
  status:'EVIDENCE_ONLY',isApprovedPlan:false,mondaySyncAllowed:false,
  boardId,version,taskCount:result.taskCount,sha256:result.sha256,bytes:result.bytes,
  sharePoint:{driveId,itemId:first.id,path,name:first.name,eTag:first.eTag,
   lastModifiedDateTime:first.lastModifiedDateTime??null},
  checks:{reviewRequestMatch:'passed',downloadedFileSHA256:'passed',
   graphMetadataRead:'passed',graphFileContent:'passed',
   downloadProvenance:'graph-authenticated-response',approverIdentity:'not-verified',
   liveMondayConflict:'not-checked'},
  eligibleForApproval:false
 });
}
