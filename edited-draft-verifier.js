import {validateEditedDraft} from './edited-draft-validator.js';
// Verify a user-downloaded SharePoint DRAFT against the exact exported v1+ JSON.
export async function verifyEditedDraftDownload({originalText,downloadedBytes,boardId}={}){
 const expected=await validateEditedDraft(originalText,boardId);
 if(!(downloadedBytes instanceof Uint8Array)||downloadedBytes.byteLength>5_000_000)throw new Error('Invalid downloaded DRAFT file');
 const decoded=new TextDecoder('utf-8',{fatal:true}).decode(downloadedBytes);
 const actual=await validateEditedDraft(decoded,boardId);
 if(actual.version!==expected.version||actual.taskCount!==expected.taskCount||actual.bytes!==expected.bytes||actual.sha256!==expected.sha256)throw new Error('Downloaded SharePoint DRAFT differs from exported version');
 return Object.freeze({...actual,verification:'full-content-sha256'});
}
