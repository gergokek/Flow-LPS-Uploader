// An independent, visible Uploader confirmation for V3 Approved Plan.
// No Monday writes; never authorizes automatically or from a postMessage flag.
const pending=new WeakSet();
export function requestVersionedApprovalConsent({
 host,summary,isCurrent,win=globalThis.window,timeoutMs=300000
}={}){
 const doc=host?.ownerDocument;
 if(!doc?.createElement||typeof host.append!=='function'||
  typeof isCurrent!=='function'||pending.has(host)||!win?.setInterval||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||
  summary?.planVersion!==3||summary.status!=='DRAFT_READY'||
  !Number.isSafeInteger(summary.revision)||summary.revision<0||
  !Number.isSafeInteger(summary.changedTaskCount)||summary.changedTaskCount<0||
  !Number.isSafeInteger(summary.fieldChangeCount)||summary.fieldChangeCount<0||
  !/^[a-f0-9]{64}$/.test(summary.sourceDraftSha256||'')||
  !/^[a-f0-9]{64}$/.test(summary.generationSha256||''))
  return Promise.reject(Error('Nem ellenorzott V3 jovahagyasi elonezet.'));
 const section=doc.createElement('section'),
  title=doc.createElement('h3'),explain=doc.createElement('p'),
  detail=doc.createElement('p'),approve=doc.createElement('button'),
  cancel=doc.createElement('button');
 section.id='versionedApprovalConsent';section.className='v1-full-sync-consent';
 section.setAttribute('role','region');
 section.setAttribute('aria-labelledby','versionedApprovalConsentTitle');
 title.id='versionedApprovalConsentTitle';title.tabIndex=-1;
 title.textContent='V3.'+summary.revision+' DRAFT veglegesitese - Uploader jovahagyas';
 explain.textContent=summary.changedTaskCount+' modositott feladat, '+
  summary.fieldChangeCount+' mezo. A forrast, az osszes DRAFT-reviziot es a teljes '+
  'TEST boardot fuggetlenul ellenorizzuk. Jo vahagyas utan a DRAFT zarolt lesz.';
 detail.textContent='Ez a gomb kizarolag immutabilis SharePoint freeze, Approved Plan '+
  'es jovahagyasi nyugta fajlokat hozhat letre. Monday-feladat iras: 0. '+
  'Barmilyen bizonytalan mentest kulon vissza kell ellenorizni. '+
  'A Monday-ablakban mar megadott megerosites nem helyettesiti ezt a jovahagyast.';
 approve.id='confirmVersionedApproval';approve.type='button';
 approve.textContent='Jovahagyom a V3.'+summary.revision+' Approved Plan mentest (0 Monday-iras)';
 cancel.id='cancelVersionedApproval';cancel.type='button';cancel.textContent='Megse';
 section.append(title,explain,detail,approve,cancel);
 pending.add(host);
 return new Promise((resolve,reject)=>{
  let finished=false,timer;const deadline=Date.now()+timeoutMs;
  const end=(result,error)=>{
   if(finished)return;finished=true;approve.disabled=cancel.disabled=true;
   if(timer!==undefined)win.clearInterval(timer);
   win.removeEventListener('pagehide',onClose);section.remove();pending.delete(host);
   error?reject(error):resolve(result);
  };
  const check=()=>{
   if(Date.now()>=deadline||isCurrent()!==true)
    throw Error('V3 jovahagyas lejart vagy a munkamenet megvaltozott.');
  };
  const onClose=()=>end(false,Error('Az Uploader bezarult a jovahagyas kozben.'));
  approve.addEventListener('click',()=>{try{check();end(true);}catch(e){end(false,e);}});
  cancel.addEventListener('click',()=>end(false));
  try{
   check();host.append(section);win.addEventListener('pagehide',onClose);
   timer=win.setInterval(()=>{try{check();}catch(e){end(false,e);}},500);
   try{section.scrollIntoView({block:'center'});title.focus({preventScroll:true});}catch{}
  }catch(e){end(false,e);}
 });
}
