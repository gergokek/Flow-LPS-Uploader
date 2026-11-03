import {verifyGraphDraftContent} from './graph-draft-content-verifier.js';
import {validateEditedDraft} from './edited-draft-validator.js';
import {validateDraftTransfer} from './draft-transfer-validator.js';
import {createProjectStorage} from './project-storage.js';
const root='https://graph.microsoft.com/v1.0/drives/';
export async function saveDraftTransfer({transferText,boardId,driveId,getAccessToken,fetcher=fetch,versionId,editedDraftText}={}){
 const valid=editedDraftText===undefined?await validateDraftTransfer(transferText,{expectedBoardId:boardId}):await validateEditedDraft(editedDraftText,boardId);
 if(!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||typeof getAccessToken!=='function')throw new Error('Hibas SharePoint kapcsolat.');
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(versionId||''))throw new Error('Ervenytelen verzioazonosito.');
 const envelope=editedDraftText===undefined?JSON.parse(transferText):null;
 const filename='draft-'+versionId+'.json';
 const storage=createProjectStorage({driveId,getAccessToken,fetcher});
 await storage.ensure(boardId);
 const base=root+encodeURIComponent(driveId);
 const token=await getAccessToken();
 if(!token)throw new Error('Microsoft Graph token hianyzik.');
 const body=new TextEncoder().encode(editedDraftText===undefined?envelope.payload:editedDraftText);
 let response;
 try{response=await fetcher(base+'/root:/Projects/'+boardId+'/Draft-Plans/'+encodeURIComponent(filename)+':/content?%40microsoft.graph.conflictBehavior=fail',{method:'PUT',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body});}
 catch(e){throw new Error('SharePoint feltoltes halozati hiba; ellenorizd a fajllistat az ujraprobalas elott.');}
 if(!response.ok)throw new Error('SharePoint feltoltes HTTP '+response.status+'; nem probaljuk automatikusan ujra.');
 const created=await response.json();
 if(created?.name!==filename||!created.id)throw new Error('A feltoltes visszaigazolasa nem megfelelo.');
 const metadataResponse=await fetcher(base+'/items/'+encodeURIComponent(created.id)+'?$select=id,name,size,file',{method:'GET',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+await getAccessToken(),Accept:'application/json'}});
 if(!metadataResponse.ok)throw new Error('A fajl felkerult, de a metaadat ellenorzese sikertelen: HTTP '+metadataResponse.status);
 const metadata=await metadataResponse.json();
 if(metadata.id!==created.id||metadata.name!==filename||metadata.size!==body.length||!metadata.file)throw new Error('A SharePoint fajl metaadatai elternek.');
 const path='Projects/'+boardId+'/Draft-Plans/'+filename;
 if(editedDraftText===undefined)
  return Object.freeze({boardId,name:filename,id:created.id,bytes:body.length,sha256:valid.sha256,path,verification:'metadata-only'});
 // The edited DRAFT save can only be fully verified from a fresh, authenticated
 // Graph readback. Never infer integrity from PUT success or item metadata alone.
 const requestText=JSON.stringify({schemaVersion:1,format:'flow-lps-draft-review-request',
  status:'REVIEW_REQUEST',isApprovedPlan:false,approvalDecision:null,mondaySyncAllowed:false,
  draft:{boardId,version:valid.version,taskCount:valid.taskCount,bytes:valid.bytes,sha256:valid.sha256}});
 let evidence;
 try{
  evidence=await verifyGraphDraftContent({requestText,boardId,driveId,fileName:filename,
   getAccessToken,fetcher});
  if(evidence.sharePoint.itemId!==created.id)throw Error('SharePoint file identity changed after upload');
 }catch(cause){
  const err=new Error('A DRAFT felkerult a SharePointra, de a teljes tartalmi ellenorzes nem sikerult: '+
   (cause?.message||'ismeretlen hiba')+'. Ne ismeteld meg automatikusan a feltoltest.');
  err.uploaded={boardId,id:created.id,name:filename,path,bytes:body.length,sha256:valid.sha256};
  throw err;
 }
 return Object.freeze({boardId,name:filename,id:created.id,bytes:body.length,sha256:valid.sha256,path,
  verification:'content-sha256-and-etag',eTag:evidence.sharePoint.eTag,
  checks:evidence.checks,isApprovedPlan:false,mondaySyncAllowed:false});

}
