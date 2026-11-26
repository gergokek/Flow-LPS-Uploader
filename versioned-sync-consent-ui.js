// Independent Uploader consent to a real V3 Monday TEST board writeback.
// This is separate from V3 Approved Plan consent; no automatic approval.
const pending=new WeakSet();
export function requestVersionedSyncConsent({
 host,state,isCurrent,win=globalThis.window,timeoutMs=300000
}={}){
 const doc=host?.ownerDocument;
 if(!doc?.createElement||typeof host.append!=='function'||
  pending.has(host)||typeof isCurrent!=='function'||!win?.setInterval||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||
  state?.model?.version!==3||state.model.boardId!=='5107075373'||
  !['READY_TO_SYNC','READY_TO_CLOSE'].includes(state.status)||
  !Number.isSafeInteger(state.verifiedTaskCount)||
  !Number.isSafeInteger(state.remainingTaskCount)||
  state.verifiedTaskCount<0||state.remainingTaskCount<0||
  state.verifiedTaskCount+state.remainingTaskCount!==state.model.changedTaskCount||
  !/^[a-f0-9]{64}$/.test(state.approvedSha256||'')||
  !/^[a-f0-9]{64}$/.test(state.approvalReceiptSha256||'')||
  !/^[a-f0-9]{64}$/.test(state.generationSha256||''))
  return Promise.reject(Error('Hibas vagy nem igazolt V3 szinkron allapot.'));
 const section=doc.createElement('section'),title=doc.createElement('h3'),
 summary=doc.createElement('p'),detail=doc.createElement('pre'),
 approve=doc.createElement('button'),cancel=doc.createElement('button');
 section.className='v1-full-sync-consent';section.id='v3SyncConsent';
 title.id='v3SyncConsentTitle';section.setAttribute('role','region');
 section.setAttribute('aria-labelledby',title.id);title.tabIndex=-1;
 title.textContent='V3 teljes Monday TEST szinkron - fuggetlen megerosites';
 summary.textContent='Jovahagyott V3.'+state.model.revision+
  ' · Modosult feladatok: '+state.model.changedTaskCount+
  ' · Mar igazolt: '+state.verifiedTaskCount+
  ' · Hatralevo: '+state.remainingTaskCount+
  '. A teljes szinkron VALODI Monday TEST feladatirasokat okoz!';
 detail.textContent='Csak a TEST board 5107075373. Minden feladat elott '+
  'SharePoint elonaplo, egyetlen irasi kiserlet, majd feladat- es '+
  'teljesboard-visszaolvasas. Megszakadas vagy bizonytalan valasz utan '+
  'nincs automatikus ujraprobalas. A korabbi igazolt naplok valtozatlanok. '+
  'A Monday ablakban megadott megerosites onmagaban nem eleg.';
 detail.style.whiteSpace='pre-wrap';
 approve.type=cancel.type='button';approve.id='confirmV3Sync';
 cancel.id='cancelV3Sync';
 approve.textContent='V3 teljes TEST board-visszairas engedelyezese';
 cancel.textContent='Megse';
 section.append(title,summary,detail,approve,cancel);pending.add(host);
 return new Promise((resolve,reject)=>{
  let done=false,timer;const deadline=Date.now()+timeoutMs;
  const finish=(value,error)=>{
   if(done)return;done=true;approve.disabled=cancel.disabled=true;
   if(timer!==undefined)win.clearInterval(timer);
   win.removeEventListener('pagehide',onClose);section.remove();pending.delete(host);
   error?reject(error):resolve(value);
  };
  const verify=()=>{
   if(Date.now()>deadline||isCurrent()!==true)
    throw Error('A V3 szinkronengedely lejart vagy a kapcsolat megvaltozott.');
  };
  const onClose=()=>finish(false,Error('Az Uploader bezarult a V3 szinkron elott.'));
  approve.addEventListener('click',()=>{try{verify();finish(true);}catch(e){finish(false,e);}});
  cancel.addEventListener('click',()=>finish(false));
  try{
   verify();host.append(section);win.addEventListener('pagehide',onClose);
   timer=win.setInterval(()=>{try{verify();}catch(e){finish(false,e);}},500);
   try{section.scrollIntoView({block:'center'});title.focus({preventScroll:true});}catch{}
  }catch(e){finish(false,e);}
 });
}
