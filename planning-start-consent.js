// A second, explicit Uploader-side consent for state-selected version creation.
// Never treat a Monday postMessage flag as the Uploader user's consent.
export function requestPlanningStartConsent({host,state,isCurrent,
 win=globalThis.window,timeoutMs=300000}={}){
 const doc=host?.ownerDocument;
 if(!doc?.createElement||typeof host.append!=='function'||
  typeof isCurrent!=='function'||!win?.setInterval||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||
  state?.action!=='START_NEXT'||state.boardMatches!==true||
  !Number.isSafeInteger(state.planVersion)||state.planVersion<1||
  state.planVersion>9999||host.querySelector?.('#planningStartConsent'))
  return Promise.reject(Error('Nem hitelesitett a kovetkezo terv inditasa.'));
 const panel=doc.createElement('section'),title=doc.createElement('h3'),
  info=doc.createElement('p'),ok=doc.createElement('button'),cancel=doc.createElement('button');
 panel.id='planningStartConsent';panel.className='v1-full-sync-consent';
 panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','planningStartConsentTitle');
 title.id='planningStartConsentTitle';title.tabIndex=-1;
 title.textContent='Kovetkezo terv inditasa: V'+state.planVersion;
 info.textContent='A teljesen ellenorzott elozo terv es az aktualis TEST board alapjan V'+
  state.planVersion+' kulon SharePoint mappakat, munkamenet-nyugtat es V'+
  state.planVersion+'.0 DRAFT-ot hozunk letre. Nem modositunk Monday-feladatot. '+
  'Korabbi tervek nem torlodnek. Erositsd meg kulon az Uploaderben.';
 ok.type=cancel.type='button';ok.id='approvePlanningStart';
 cancel.id='cancelPlanningStart';ok.textContent='V'+state.planVersion+' DRAFT inditasanak jovahagyasa';
 cancel.textContent='Megse';
 panel.append(title,info,ok,cancel);
 return new Promise((resolve,reject)=>{
  let done=false,timer;
  const deadline=Date.now()+timeoutMs;
  const finish=(answer,error)=>{if(done)return;done=true;ok.disabled=cancel.disabled=true;
   if(timer!==undefined)win.clearInterval(timer);
   win.removeEventListener('pagehide',onClose);panel.remove();
   if(error)reject(error);else resolve(answer);
  };
  const check=()=>{if(Date.now()>deadline||isCurrent()!==true)
   throw Error('A tervinditasi jovahagyas lejart vagy a kapcsolat megvaltozott.');};
  const onClose=()=>finish(false,Error('Az Uploader kapcsolat megszakadt.'));
  ok.addEventListener('click',()=>{try{check();finish(true);}catch(e){finish(false,e);}});
  cancel.addEventListener('click',()=>finish(false);
  try{check();host.append(panel);win.addEventListener('pagehide',onClose);
   timer=win.setInterval(()=>{try{check();}catch(e){finish(false,e);}},500);
   try{panel.scrollIntoView({block:'center'});title.focus({preventScroll:true});}catch{}
  }catch(e){finish(false,e);}
 });
}
