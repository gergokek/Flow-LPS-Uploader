const protocol='flow-lps-draft-handoff-v1';
const nonceRegex=/^[0-9a-f-]{36}$/i;
// A receipt is diagnostic UI data. It is not authorization to write to Monday.
export function attachDraftHandoff({win=window,onDraft}={}){
 if(!win||typeof win.addEventListener!=='function'||typeof onDraft!=='function')throw Error('Invalid handoff receiver');
 const params=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=params.get('draft-handoff');
 if(!nonce||!nonceRegex.test(nonce)||!win.opener)
  return Object.freeze({active:false,close:()=>{},publishVerifiedReceipt:()=>false});
 let closed=false,accepted=null;
 const close=()=>{closed=true;win.removeEventListener('message',handler);};
 const handler=async event=>{
  if(closed||accepted||event.source!==win.opener||event.data?.protocol!==protocol||
   event.data?.kind!=='draft'||event.data?.nonce!==nonce||
   event.origin==='null'||!/^https:\/\//.test(event.origin))return;
  const {content,boardId}=event.data;
  if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>5_000_000||
   !/^\d+$/.test(boardId||''))return;
  try{
   const verified=await onDraft({content,boardId,sourceOrigin:event.origin});
   if(!verified||verified.boardId!==boardId||!Number.isSafeInteger(verified.version)||
    verified.version<1||!Number.isSafeInteger(verified.bytes)||
    typeof verified.sha256!=='string'||!/^[0-9a-f]{64}$/.test(verified.sha256))
    throw Error('DRAFT validation did not return matching identity');
   if(closed)return;
   accepted={boardId,version:verified.version,sha256:verified.sha256,
    bytes:verified.bytes,sourceOrigin:event.origin};
   win.removeEventListener('message',handler);
   win.opener?.postMessage({protocol,kind:'received',nonce},event.origin);
  }catch{
   // No ACK or receipt on invalid data; UI displays validation error.
  }
 };
 win.addEventListener('message',handler);
 win.opener.postMessage({protocol,kind:'ready',nonce},'*');
 function publishVerifiedReceipt(saved){
  if(closed||!accepted||!saved||saved.boardId!==accepted.boardId||
   saved.version!==accepted.version||saved.sha256!==accepted.sha256||
   saved.bytes!==accepted.bytes||saved.verification!=='content-sha256-and-etag'||
   typeof saved.name!=='string'||!saved.name.startsWith('draft-v'+accepted.version+'-')||
   typeof saved.itemId!=='string'||!saved.itemId||typeof saved.eTag!=='string'||!saved.eTag)
   return false;
  win.opener?.postMessage({protocol,kind:'verified',nonce,receipt:{
   boardId:saved.boardId,version:saved.version,sha256:saved.sha256,
   bytes:saved.bytes,name:saved.name,itemId:saved.itemId,eTag:saved.eTag,
   verification:saved.verification,isApprovedPlan:false,mondaySyncAllowed:false
  }},accepted.sourceOrigin);
  close();
  return true;
 }
 return Object.freeze({active:true,close,publishVerifiedReceipt});
}
