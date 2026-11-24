// Isolated, origin/nonce-bound TEST browser bridge. The Graph proof comes
// exclusively from createSingleDraftSessionStore; postMessage is only
// transport/display feedback, NEVER an authorization for Monday writes.
export const SINGLE_DRAFT_PROTOCOL='mflow-single-draft-session-v1';
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);
export function attachSingleDraftSessionBridge({win=window,
 onSaveRevision=async()=>{},onStatus=()=>{}}={}){
 if(typeof onSaveRevision!=='function'||typeof onStatus!=='function'||
    !win||typeof win.addEventListener!=='function')
  throw Error('Érvénytelen TEST munkamenet-átadás.');
 const p=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=p.get('mflow-session'),boardId=p.get('board');
 if(!uuid(nonce)||boardId!=='5107075373'||!win.opener)
  return Object.freeze({active:false,ready:false,close:()=>{},
   selected:()=>false,saved:()=>false,failed:()=>false});
 let origin=null,closed=false,selectedSession=null,working=false;
 const emit=(kind,extras={})=>{
  if(closed||!origin||!win.opener)return false;
  try{win.opener.postMessage({protocol:SINGLE_DRAFT_PROTOCOL,
   kind,nonce,boardId,...extras},origin);return true;}catch{return false;}
 };
 const handler=async event=>{
  if(closed||event.source!==win.opener||
     event.data?.protocol!==SINGLE_DRAFT_PROTOCOL||
     event.data?.nonce!==nonce||event.data.boardId!==boardId||
     !/^https:\/\//.test(event.origin)||event.origin==='null')return;
  if(event.data.kind==='hello'){
   if(origin&&origin!==event.origin)return;
   origin=event.origin;emit('ready');onStatus('ready');return;
  }
  if(!origin||event.origin!==origin||working||!selectedSession)return;
  if(event.data.kind==='save-revision'){
   const draft=event.data.draft,requestId=event.data.requestId;
   if(!uuid(requestId)||!draft||typeof draft!=='object'||
      draft.boardId!==boardId||
      draft.session?.sessionId!==selectedSession.sessionId||
      draft.version!==selectedSession.revision+1)return;
   working=true;
   try{
    const result=await onSaveRevision({draft,requestId,
     sessionId:selectedSession.sessionId});
    if(result?.status!=='SAVED'||result.sessionId!==selectedSession.sessionId||
       result.revision!==draft.version||
       !/^[a-f0-9]{64}$/.test(result.receipt?.sha256||'')||
       !result.receipt.eTag)
     throw Error('Nem igazolt a DRAFT mentése.');
    selectedSession={...selectedSession,revision:result.revision};
    emit('revision-saved',{requestId,revision:result.revision,
     receipt:{sha256:result.receipt.sha256,eTag:result.receipt.eTag,
      name:result.receipt.name,verification:result.receipt.verification}});
    onStatus('saved');
   }catch(error){
    emit('revision-failed',{requestId,message:String(error?.message||error).slice(0,300)});
    onStatus('blocked');
   }finally{working=false;}
  }
 };
 win.addEventListener('message',handler);
 // Nonce is unguessable and opener origin is established by the hello roundtrip.
 try{win.opener.postMessage({protocol:SINGLE_DRAFT_PROTOCOL,
  kind:'ready',nonce,boardId},'*');}catch{/* User can retry opening. */}
 function selected(verified){
  if(closed||!origin||working||selectedSession||verified?.status!=='ACTIVE'||
     verified.boardId!==boardId||!uuid(verified.sessionId)||
     !Number.isSafeInteger(verified.revision)||verified.revision<0||
     verified.draft?.session?.sessionId!==verified.sessionId||
     verified.draft.version!==verified.revision||
     verified.receipt?.verification!=='content-sha256-and-etag'||
     !/^[a-f0-9]{64}$/.test(verified.receipt.sha256||''))
   return false;
  const sent=emit('session-selected',{sessionId:verified.sessionId,
   revision:verified.revision,versionLabel:verified.versionLabel,
   draft:structuredClone(verified.draft),
   receipt:{sha256:verified.receipt.sha256,eTag:verified.receipt.eTag,
    name:verified.receipt.name,verification:verified.receipt.verification}});
  if(sent)selectedSession={sessionId:verified.sessionId,revision:verified.revision};
  return sent;
 }
 const close=()=>{closed=true;win.removeEventListener('message',handler);};
 return Object.freeze({active:true,selected,close,
  ready:()=>!!origin,session:()=>selectedSession});
}
