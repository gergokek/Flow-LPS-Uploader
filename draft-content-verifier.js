import {validateDraftTransfer} from './draft-transfer-validator.js';

// Compare the exact downloaded file bytes against the original transfer payload.
export async function verifyDownloadedDraft({transferText,downloadedBytes,boardId}={}){
 const original=await validateDraftTransfer(transferText,{expectedBoardId:boardId});
 if(!(downloadedBytes instanceof Uint8Array)||downloadedBytes.length>5_000_000)throw new Error('Hibas vagy tul nagy letoltott DRAFT.');
 const expected=new TextEncoder().encode(JSON.parse(transferText).payload);
 const digest=await crypto.subtle.digest('SHA-256',downloadedBytes);
 const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(expected.length!==downloadedBytes.length||sha256!==original.sha256)throw new Error('A SharePoint DRAFT tartalma nem egyezik az eredetivel.');
 const draft=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(downloadedBytes));
 if(draft?.format!=='flow-lps-draft'||draft?.boardId!==boardId||draft?.status!=='DRAFT'||draft?.isApprovedPlan!==false)throw new Error('A letoltott fajl nem megfelelo DRAFT.');
 return Object.freeze({boardId,bytes:downloadedBytes.length,sha256,verification:'full-content-sha256',taskCount:original.taskCount});
}
