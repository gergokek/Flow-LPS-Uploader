const protocol='flow-lps-draft-handoff-v1';
const nonceRegex=/^[0-9a-f-]{36}$/i;
// The opener is not an authority: transferred JSON is untrusted until DRAFT validation.
// A handoff never authenticates the sender or authorizes a SharePoint operation.
export function attachDraftHandoff({win=window,onDraft}={}){
 if(!win||typeof win.addEventListener!=='function'||typeof onDraft!=='function')throw Error('Invalid handoff receiver');
 const params=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=params.get('draft-handoff');
 if(!nonce||!nonceRegex.test(nonce)||!win.opener)return {active:false,close:()=>{}};
 let closed=false;
 const handler=async event=>{
  if(closed||event.source!==win.opener||event.data?.protocol!==protocol||
   event.data?.kind!=='draft'||event.data?.nonce!==nonce||
   event.origin==='null'||!/^https:\/\//.test(event.origin))return;
  const {content,boardId}=event.data;
  if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>5_000_000||
   !/^\d+$/.test(boardId||''))return;
  closed=true;win.removeEventListener('message',handler);
  try{
   await onDraft({content,boardId,sourceOrigin:event.origin});
   win.opener?.postMessage({protocol,kind:'received',nonce},event.origin);
  }catch{
   // No ACK; validation errors remain visible in the receiving UI.
  }
 };
 win.addEventListener('message',handler);
 // No sensitive values in the ready message or URL.
 win.opener.postMessage({protocol,kind:'ready',nonce},'*');
 return {active:true,close:()=>{closed=true;win.removeEventListener('message',handler);}};
}
