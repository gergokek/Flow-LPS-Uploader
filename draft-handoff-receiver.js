const protocol='flow-lps-draft-handoff-v1';
const nonceRegex=/^[0-9a-f-]{36}$/i;
// Verified receipts are UI feedback only. They do not authorize Monday writes.
export function attachDraftHandoff({win=window,onDraft,onRevision=async()=>{}}={}){
 if(!win||typeof win.addEventListener!=='function'||typeof onDraft!=='function'||
    typeof onRevision!=='function')throw Error('Invalid handoff receiver');
 const params=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=params.get('draft-handoff');
 if(!nonce||!nonceRegex.test(nonce)||!win.opener)
  return Object.freeze({active:false,close:()=>{},publishVerifiedReceipt:()=>false});
 let closed=false,accepted=null,busy=false,verifiedVersion=0;
 const close=()=>{closed=true;win.removeEventListener('message',handler);};
 const validProof=(proof,boardId)=>proof&&proof.boardId===boardId&&
  Number.isSafeInteger(proof.version)&&proof.version>0&&
  Number.isSafeInteger(proof.bytes)&&proof.bytes>0&&proof.bytes<=5_000_000&&
  typeof proof.sha256==='string'&&/^[0-9a-f]{64}$/.test(proof.sha256);
 const handler=async event=>{
  if(closed||busy||event.source!==win.opener||event.data?.protocol!==protocol||
   event.data?.nonce!==nonce||event.origin==='null'||!/^https:\/\//.test(event.origin))return;
  const kind=event.data?.kind;
  if(kind!=='draft'&&kind!=='revision')return;
  if(kind==='draft'&&accepted||kind==='revision'&&!accepted)return;
  if(accepted&&event.origin!==accepted.sourceOrigin)return;
  const {content,boardId}=event.data;
  if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>5_000_000||
   !/^\d+$/.test(boardId||'')||accepted&&boardId!==accepted.boardId)return;
  busy=true;
  try{
   const verified=await (kind==='draft'?onDraft:onRevision)({content,boardId,sourceOrigin:event.origin});
   if(!validProof(verified,boardId))throw Error('DRAFT validation failed');
   if(accepted&&verified.version<=accepted.version)throw Error('Older or duplicate DRAFT revision');
   if(closed)return;
   accepted={boardId,version:verified.version,sha256:verified.sha256,
    bytes:verified.bytes,sourceOrigin:event.origin};
   win.opener?.postMessage({protocol,kind:'received',nonce},event.origin);
  }catch{
   // Invalid data: no ACK, no write authorization.
  }finally{busy=false;}
 };
 win.addEventListener('message',handler);
 win.opener.postMessage({protocol,kind:'ready',nonce},'*');
 function publishVerifiedReceipt(saved){
  if(closed||!accepted||!saved||saved.boardId!==accepted.boardId||
   saved.version!==accepted.version||saved.sha256!==accepted.sha256||
   saved.bytes!==accepted.bytes||saved.verification!=='content-sha256-and-etag'||
   saved.version<=verifiedVersion||typeof saved.name!=='string'||
   !saved.name.startsWith('draft-v'+accepted.version+'-')||
   typeof saved.itemId!=='string'||!saved.itemId||typeof saved.eTag!=='string'||!saved.eTag)
   return false;
  win.opener?.postMessage({protocol,kind:'verified',nonce,receipt:{
   boardId:saved.boardId,version:saved.version,sha256:saved.sha256,
   bytes:saved.bytes,name:saved.name,itemId:saved.itemId,eTag:saved.eTag,
   verification:saved.verification,isApprovedPlan:false,mondaySyncAllowed:false
  }},accepted.sourceOrigin);
  verifiedVersion=saved.version;
  return true;
 }
 return Object.freeze({active:true,close,publishVerifiedReceipt});
}
