import {createHash} from 'node:crypto';

const GRAPH='https://graph.microsoft.com/v1.0';
const MAX_BYTES=5_000_000;
const namePattern=/^draft-v([1-9]\d*)-[a-zA-Z0-9_-]{8,100}\.json$/;
const shaPattern=/^[a-f0-9]{64}$/;

function invalid(message){const error=new Error(message);error.status=400;return error;}
function assertJsonReview(value,boardId){
 const r=value;
 if(!r||r.schemaVersion!==1||r.format!=='flow-lps-draft-review-request'||
    r.status!=='REVIEW_REQUEST'||r.isApprovedPlan!==false||
    r.approvalDecision!==null||r.mondaySyncAllowed!==false||
    r.draft?.boardId!==boardId||!Number.isSafeInteger(r.draft.version)||
    r.draft.version<1||!Number.isSafeInteger(r.draft.bytes)||
    r.draft.bytes<=0||r.draft.bytes>MAX_BYTES||
    !Number.isSafeInteger(r.draft.taskCount)||r.draft.taskCount<1||
    !shaPattern.test(r.draft.sha256||''))throw invalid('Invalid non-approved review request');
 return r;
}
async function graphGetJson(fetcher,url,token){
 const r=await fetcher(url,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(r.status!==200)throw new Error('Graph metadata request failed: HTTP '+r.status);
 return r.json();
}
function assertMetadata(m,name,driveId,bytes){
 if(!m?.id||m.name!==name||m.size!==bytes||!m.file||
    m.parentReference?.driveId!==driveId||!m.eTag)
  throw new Error('SharePoint metadata mismatch');
}
async function graphDownload(fetcher,url,token,expectedBytes){
 const r=await fetcher(url,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+token}});
 let download=r;
 if(r.status===302||r.status===301||r.status===307||r.status===308){
  const redirect=r.headers?.get('location');
  if(!redirect)throw new Error('Graph redirect URL missing');
  const target=new URL(redirect);
  if(target.protocol!=='https:'||target.username||target.password||target.port)
   throw new Error('Untrusted Graph download redirect');
  // A preauthenticated URL must NOT receive the Microsoft Graph bearer token.
  download=await fetcher(target.href,{method:'GET',redirect:'error',headers:{}});
 }
 if(download.status!==200)throw new Error('Graph download failed: HTTP '+download.status);
 const sizeHeader=download.headers?.get('content-length');
 if(sizeHeader&&(!/^\d+$/.test(sizeHeader)||Number(sizeHeader)>MAX_BYTES))
  throw new Error('Graph download exceeds the content limit');
 const buf=Buffer.from(await download.arrayBuffer());
 if(buf.length>MAX_BYTES||buf.length!==expectedBytes)throw new Error('Downloaded SharePoint file size mismatch');
 return buf;
}

// Only reusable pure logic is here. Production entrypoint validates the Entra JWT and uses
// Managed Identity. No Graph credentials, caller tokens or download URLs are returned.
export async function verifyStoredDraft({body,fetcher=fetch,getGraphToken,driveId,allowedBoardId}={}){
 const boardId=body?.boardId,name=body?.fileName;
 if(typeof boardId!=='string'||boardId!==allowedBoardId||!/^\d+$/.test(boardId))
  throw invalid('Board is not authorized');
 const match=namePattern.exec(name||'');
 if(!match||typeof driveId!=='string'||!/^b![-_A-Za-z0-9]+$/.test(driveId)||
    typeof getGraphToken!=='function')throw invalid('Invalid SharePoint file request');
 const request=assertJsonReview(body?.reviewRequest,boardId);
 if(Number(match[1])!==request.draft.version)throw invalid('DRAFT version mismatch');
 const token=await getGraphToken();
 if(typeof token!=='string'||!token)throw new Error('Managed Identity Graph token unavailable');
 const root=GRAPH+'/drives/'+encodeURIComponent(driveId);
 const relativePath='Projects/'+boardId+'/Draft-Plans/'+name;
 const pathUrl=root+'/root:/'+relativePath.split('/').map(encodeURIComponent).join('/')+':';
 const metaUrl=pathUrl+'?$select=id,name,size,file,parentReference,eTag,lastModifiedDateTime';
 const before=await graphGetJson(fetcher,metaUrl,token);
 assertMetadata(before,name,driveId,request.draft.bytes);
 const content=await graphDownload(fetcher,root+'/items/'+encodeURIComponent(before.id)+'/content',token,request.draft.bytes);
 const digest=createHash('sha256').update(content).digest('hex');
 if(digest!==request.draft.sha256)throw new Error('SharePoint content SHA-256 differs from REVIEW REQUEST');
 const after=await graphGetJson(fetcher,metaUrl,token);
 assertMetadata(after,name,driveId,request.draft.bytes);
 if(after.id!==before.id||after.eTag!==before.eTag)throw new Error('SharePoint file changed during verification');
 return Object.freeze({
  schemaVersion:1,format:'flow-lps-server-content-attestation',status:'VERIFIED_CONTENT_ONLY',
  isApprovedPlan:false,mondaySyncAllowed:false,eligibleForApproval:false,
  boardId,version:request.draft.version,taskCount:request.draft.taskCount,
  bytes:content.length,sha256:digest,sharePoint:{driveId,itemId:before.id,path:relativePath,
   eTag:before.eTag},checks:{graphContent:'passed',sha256:'passed',fileVersionStable:'passed',
   approverAuthorization:'not-checked',mondayConflict:'not-checked'}
 });
}
