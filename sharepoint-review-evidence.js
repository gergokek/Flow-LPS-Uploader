import {validateEditedDraft} from './edited-draft-validator.js';

function reviewRequest(json){
 const request=JSON.parse(json);
 if(request?.schemaVersion!==1||request?.format!=='flow-lps-draft-review-request'||
 request.status!=='REVIEW_REQUEST'||request.isApprovedPlan!==false||
 request.approvalDecision!==null||request.mondaySyncAllowed!==false)
  throw new Error('Invalid or approved review request');
 return request;
}

// Combine an exact local SHA-256 file check with a separate authenticated Graph metadata read.
// The downloaded file is selected by a human: Graph metadata alone cannot authenticate those bytes.
export async function prepareSharePointReviewEvidence({requestText,draftBytes,boardId,driveId,fileName,getAccessToken,fetcher=fetch}={}){
 const review=reviewRequest(requestText);
 if(!/^\d+$/.test(boardId||'')||review.draft?.boardId!==boardId||
 !/^b![-_a-zA-Z0-9]+$/.test(driveId||'')||
 !/^draft-v[1-9]\d*-[a-zA-Z0-9_-]{8,100}\.json$/.test(fileName||'')||
 typeof getAccessToken!=='function'||!(draftBytes instanceof Uint8Array)||draftBytes.length>5_000_000)
  throw new Error('Invalid project, file, or SharePoint connection');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(draftBytes);
 const draft=await validateEditedDraft(text,boardId);
 if(draft.version!==review.draft.version||draft.taskCount!==review.draft.taskCount||
 draft.bytes!==review.draft.bytes||draft.sha256!==review.draft.sha256)
  throw new Error('REVIEW REQUEST does not match downloaded DRAFT bytes');
 const token=await getAccessToken();
 if(!token)throw new Error('Missing Microsoft Graph token');
 const path='Projects/'+boardId+'/Draft-Plans/'+fileName;
 const url='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId)+'/root:/'+
  path.split('/').map(encodeURIComponent).join('/')+'?$select=id,name,size,parentReference,file,eTag,lastModifiedDateTime';
 const response=await fetcher(url,{method:'GET',cache:'no-store',redirect:'error',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(!response.ok)throw new Error('SharePoint metadata read failed: HTTP '+response.status);
 const item=await response.json();
 if(!item?.id||item.name!==fileName||item.size!==draft.bytes||!item.file||
 item.parentReference?.driveId!==driveId)
  throw new Error('SharePoint file metadata differs from reviewed DRAFT');
 const evidence={
  schemaVersion:1,format:'flow-lps-sharepoint-review-evidence',
  status:'EVIDENCE_ONLY',isApprovedPlan:false,mondaySyncAllowed:false,
  boardId,version:draft.version,taskCount:draft.taskCount,sha256:draft.sha256,bytes:draft.bytes,
  sharePoint:{driveId,itemId:item.id,path,name:item.name,eTag:item.eTag??null,
   lastModifiedDateTime:item.lastModifiedDateTime??null},
  checks:{reviewRequestMatch:'passed',downloadedFileSHA256:'passed',
   graphMetadataRead:'passed',graphFileContent:'not-verified',downloadProvenance:'user-selected-file',
   approverIdentity:'not-verified',liveMondayConflict:'not-checked'},
  eligibleForApproval:false
 };
 return Object.freeze(evidence);
}
