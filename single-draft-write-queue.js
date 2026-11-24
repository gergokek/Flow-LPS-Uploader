// Persist EVERY accepted mutation, without debounce/coalescing.
// A failed or uncertain upload blocks the entire remaining queue.
// The only safe recovery is an independent SharePoint read/reconciliation.
export function createImmutableDraftQueue({persist,onState=()=>{}}={}){
 if(typeof persist!=='function'||typeof onState!=='function')
  throw Error('Érvénytelen DRAFT mentési sor.');
 let sessionId=null,parentSha256=null,verifiedRevision=0,
  nextRevision=0,pending=[],active=false,blocked=null,closed=false,
  waiters=[],verifiedReceipt=null;
 const state=()=>Object.freeze({active,blocked,closed,
  verifiedRevision,pendingCount:pending.length,nextRevision,
  parentSha256,sessionId,canApprove:!blocked&&!closed&&!active&&
   pending.length===0&&verifiedRevision===nextRevision});
 const notify=()=>{try{onState(state());}catch{/* UI callback cannot break queue. */}};
 const settle=()=>{
  if(active)return;
  const ready=waiters;waiters=[];
  for(const waiter of ready){
   if(blocked)waiter.reject(Error(blocked));
   else if(pending.length===0)waiter.resolve(state());
   else waiters.push(waiter);
  }
 };
 function open(verified){
  if(sessionId||active||closed||blocked||pending.length)
   throw Error('A DRAFT-mentési sor már egy másik munkamenethez tartozik.');
  if(!verified||typeof verified.sessionId!=='string'||
     !/^[a-f0-9-]{36}$/.test(verified.sessionId)||
     !Number.isSafeInteger(verified.revision)||verified.revision<0||
     !/^[a-f0-9]{64}$/.test(verified.sha256||''))
   throw Error('Hiányzik az igazolt SharePoint DRAFT kiinduló állapot.');
  sessionId=verified.sessionId;verifiedRevision=verified.revision;
  nextRevision=verified.revision;parentSha256=verified.sha256;notify();
 }
 async function pump(){
  if(active||closed||blocked||!sessionId)return;
  active=true;notify();
  try{
   while(pending.length&&!closed&&!blocked){
    const item=pending[0];
    if(item.draft.version!==verifiedRevision+1){
     blocked='Hiányzó vagy rossz sorrendű DRAFT-módosítás.';
     break;
    }
    try{
     const proof=await persist({
      updatedDraft:item.draft,expectedSessionId:sessionId,
      expectedParentSha256:parentSha256
     });
     if(proof?.status!=='SAVED'||proof.sessionId!==sessionId||
        proof.revision!==item.draft.version||
        proof.receipt?.verification!=='content-sha256-and-etag'||
        !/^[a-f0-9]{64}$/.test(proof.receipt.sha256||'')||
        !proof.receipt.eTag)
      throw Error('Nem igazolt a SharePoint verzió mentése.');
     verifiedRevision=proof.revision;parentSha256=proof.receipt.sha256;
     verifiedReceipt=proof.receipt;pending.shift();
    }catch(error){
     blocked='DRAFT mentés bizonytalan: '+(error?.message||error)+
      '. Nincs automatikus újrapróbálás.';
    }
    notify();
   }
  }finally{active=false;notify();settle();}
 }
 function enqueue(draft){
  if(!sessionId||blocked||closed||!draft||
     !Number.isSafeInteger(draft.version)||draft.version!==nextRevision+1)
   return false;
  nextRevision=draft.version;
  pending.push({draft:structuredClone(draft)});
  notify();
  void pump();
  return true;
 }
 function idle(){
  if(blocked)return Promise.reject(Error(blocked));
  if(!active&&!pending.length)return Promise.resolve(state());
  return new Promise((resolve,reject)=>{waiters.push({resolve,reject});});
 }
 function stop(){
  closed=true;pending=[];notify();settle();
 }
 return Object.freeze({open,enqueue,idle,stop,state,
  latestReceipt:()=>verifiedReceipt});
}
