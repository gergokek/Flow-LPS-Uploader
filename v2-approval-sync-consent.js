// In-page, explicit authorization for one pinned V2 approval + full sync run.
// This module has no network client and can never authorize on timeout/closure.
const pending=new WeakSet();
export function requestV2FlowConsent({host,state,isCurrent,win=globalThis.window,timeoutMs=300000}={}){
 const doc=host?.ownerDocument,m=state?.model;
 if(!doc?.createElement||!win?.setInterval||typeof isCurrent!=='function'||pending.has(host)||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||
  !['DRAFT_READY','APPROVAL_INCOMPLETE','READY_TO_SYNC','READY_TO_CLOSE'].includes(state?.status)||
  !m||!Number.isSafeInteger(m.revision)||m.revision<0||!Array.isArray(m.targets)||
  !Number.isSafeInteger(m.fieldCount)||m.fieldCount<0||
  !Number.isSafeInteger(state.verifiedTaskCount)||state.verifiedTaskCount<0||
  !Number.isSafeInteger(m.changedTaskCount)||!Number.isSafeInteger(state.remainingTaskCount)||
  m.changedTaskCount<0||state.remainingTaskCount<0||state.verifiedTaskCount+state.remainingTaskCount!==m.changedTaskCount)
  return Promise.reject(Error('Hibas V2 jovahagyasi osszesito.'));
 const section=doc.createElement('section'),title=doc.createElement('h3'),summary=doc.createElement('p'),
  details=doc.createElement('pre'),approve=doc.createElement('button'),cancel=doc.createElement('button');
 section.id='v2FlowConsent';section.className='v1-full-sync-consent';section.setAttribute('role','region');
 section.setAttribute('aria-labelledby','v2FlowConsentTitle');title.id='v2FlowConsentTitle';title.tabIndex=-1;
 title.textContent='V2 j\u00f3v\u00e1hagy\u00e1sa \u00e9s teljes board-vissza\u00edr\u00e1s';
 summary.textContent='Monday TEST: 5107075373. Forr\u00e1s: V2.'+m.revision+'. '+m.changedTaskCount+
  ' m\u00f3dosult feladat, '+m.fieldCount+' mez\u0151. Igazolt: '+state.verifiedTaskCount+
  ', h\u00e1tral\u00e9v\u0151: '+state.remainingTaskCount+'. '+
  'Ez a V2 v\u00e9gleges\u00edt\u00e9s\u00e9t \u00e9s VAL\u00d3DI Monday-vissza\u00edr\u00e1s\u00e1t enged\u00e9lyezi. '+
  'A kor\u00e1bban igazolt feladatokat nem \u00edrjuk \u00fajra. Nincs k\u00fcl\u00f6n pilot vagy t\u00edzesenk\u00e9nti j\u00f3v\u00e1hagy\u00e1s. '+
  'A V1 bizony\u00edt\u00e9kai v\u00e1ltozatlanok maradnak. Mindk\u00e9t ablak maradjon nyitva; a boardot k\u00f6zben ne szerkeszd.';
 details.style.whiteSpace='pre-wrap';details.style.maxHeight='240px';details.style.overflow='auto';
 details.textContent=m.targets.map(t=>t.taskName+' (#'+t.taskId+')\n'+Object.entries(t.fields).map(([k,v])=>
  '  '+k+': '+JSON.stringify(v.before)+' -> '+JSON.stringify(v.after)).join('\n')).join('\n\n')||'Nincs mezovaltozas; Monday-iras nelkuli veglegesites es ellenorzes.';
 approve.id='approveV2Flow';cancel.id='cancelV2Flow';approve.type=cancel.type='button';
 approve.textContent='V2 j\u00f3v\u00e1hagy\u00e1sa \u00e9s teljes szinkron ind\u00edt\u00e1sa';cancel.textContent='M\u00e9gse';
 section.append(title,summary,details,approve,cancel);pending.add(host);
 return new Promise((resolve,reject)=>{
  let done=false,timer;const deadline=Date.now()+timeoutMs;
  const finish=(value,error)=>{if(done)return;done=true;approve.disabled=cancel.disabled=true;
   if(timer!==undefined)win.clearInterval(timer);win.removeEventListener('pagehide',unload);section.remove();pending.delete(host);
   error?reject(error):resolve(value);};
  const valid=()=>{if(Date.now()>=deadline)throw Error('A V2 jovahagyas lejart. Nem indult uj iras.');
   if(isCurrent()!==true)throw Error('A V2 kapcsolat vagy fiok megvaltozott. Nem indult uj iras.');};
  const unload=()=>finish(false,Error('Az Uploader ablak bezarult.'));
  approve.addEventListener('click',()=>{try{valid();finish(true);}catch(e){finish(false,e);}});
  cancel.addEventListener('click',()=>finish(false));
  try{valid();host.append(section);win.addEventListener('pagehide',unload);
   timer=win.setInterval(()=>{try{valid();}catch(e){finish(false,e);}},500);
   try{section.scrollIntoView({block:'center'});title.focus({preventScroll:true});}catch{}
  }catch(e){finish(false,e);}
 });
}
