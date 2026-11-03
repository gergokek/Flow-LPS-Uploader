// User-opted-in autosave for a single active Uploader tab. No stored opt-in.
// Never retries a failed or ambiguous SharePoint write automatically.
export function createSessionDraftAutosave({save,delayMs=1500,schedule=setTimeout,cancel=clearTimeout,onState=()=>{}}={}){
 if(typeof save!=='function'||typeof onState!=='function'||typeof schedule!=='function'||
  typeof cancel!=='function'||!Number.isInteger(delayMs)||delayMs<0)throw Error('Invalid autosave configuration');
 let enabled=false,stopped=false,busy=false,timer=null,queued=null,latestRevision=0,error=null;
 const state=()=>Object.freeze({enabled,busy,pendingRevision:queued?.version??null,
  savedRevision:latestRevision,error});
 const notify=()=>onState(state());
 const disable=()=>{enabled=false;if(timer!==null)cancel(timer);timer=null;queued=null;notify();};
 const enable=()=>{if(stopped)throw Error('Session ended');error=null;enabled=true;notify();};
 async function flush(){
  if(stopped||!enabled||busy||!queued)return state();
  if(timer!==null)cancel(timer);timer=null;
  const work=queued;queued=null;busy=true;notify();
  try{
   const receipt=await save(work);
   if(!receipt||receipt.version!==work.version||receipt.sha256!==work.sha256||
    receipt.verification!=='content-sha256-and-etag')
    throw Error('Remote SharePoint content verification missing or mismatched');
   latestRevision=Math.max(latestRevision,work.version);
  }catch(e){
   error=String(e?.message||e);
   // Fail closed, without an automatic retry even if another revision is queued.
   enabled=false;queued=null;
  }finally{
   busy=false;
   if(enabled&&queued)timer=schedule(()=>{timer=null;void flush();},delayMs);
   notify();
  }
  return state();
 }
 const enqueue=work=>{
  if(stopped||!enabled)return false;
  if(!work||typeof work.content!=='string'||!Number.isSafeInteger(work.version)||
   work.version<=latestRevision||!/^([0-9a-f]{64})$/.test(work.sha256||''))return false;
  if(queued&&queued.version>=work.version)return false;
  queued=work;
  if(timer!==null)cancel(timer);
  timer=null;
  if(!busy)timer=schedule(()=>{timer=null;void flush();},delayMs);
  notify();
  return true;
 };
 const stop=()=>{disable();stopped=true;};
 return Object.freeze({enable,disable,enqueue,flush,state,stop});
}
