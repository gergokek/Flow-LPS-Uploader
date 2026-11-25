// Explicit in-page consent. Closing or losing the account never means approval.
export function requestV2SessionConsent({host,report,isCurrent,win=globalThis.window,timeoutMs=300000}={}){
 const doc=host?.ownerDocument;
 if(!doc?.createElement||typeof host.append!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||typeof isCurrent!=='function'||!win?.setInterval||
  !['V2_READY_TO_START','V2_START_INCOMPLETE'].includes(report?.status)||
  !Number.isSafeInteger(report.taskCount)||report.taskCount<1||host.querySelector?.('#v2SessionConsent'))
  return Promise.reject(Error('Invalid V2 consent request.'));
 const panel=doc.createElement('section'),title=doc.createElement('h3'),summary=doc.createElement('p'),
  approve=doc.createElement('button'),cancel=doc.createElement('button');
 panel.id='v2SessionConsent';panel.className='v1-full-sync-consent';panel.setAttribute('role','region');
 panel.setAttribute('aria-labelledby','v2SessionConsentTitle');
 title.id='v2SessionConsentTitle';title.tabIndex=-1;title.textContent='V1 lez\u00e1r\u00e1sa \u00e9s V2 DRAFT ind\u00edt\u00e1sa';
 const variations=report.evidence?.final?.document?.reconciliations?.length||0;
 summary.textContent='TEST board: 5107075373. '+report.taskCount+' feladat. '+
  'A V2 a lez\u00e1rt V1 ellen\u0151rz\u00f6tt v\u00e9g\u00e1llapot\u00e1b\u00f3l indul, '+variations+
  ' elfogadott megjegyz\u00e9selt\u00e9r\u00e9ssel. A SharePointon lez\u00e1r\u00f3 nyugta, '+
  'egyetlen V2 foglal\u00e1s \u00e9s kezd\u0151 DRAFT k\u00e9sz\u00fcl. '+
  'Meglev\u0151 foglal\u00e1st folytatunk, nem nyitunk m\u00e1sodikat. '+
  'Monday-\u00edr\u00e1s: 0. F\u00e1jlt\u00f6rl\u00e9s: 0. Mindk\u00e9t ablak maradjon nyitva.';
 approve.id='approveV2Session';cancel.id='cancelV2Session';approve.type=cancel.type='button';
 approve.textContent='V1 lez\u00e1r\u00e1sa \u00e9s V2 DRAFT ind\u00edt\u00e1sa';cancel.textContent='M\u00e9gse';
 panel.append(title,summary,approve,cancel);
 return new Promise((resolve,reject)=>{
  let done=false,timer;const deadline=Date.now()+timeoutMs;
  const finish=(accepted,error)=>{if(done)return;done=true;approve.disabled=cancel.disabled=true;
   if(timer!==undefined)win.clearInterval(timer);win.removeEventListener('pagehide',unload);panel.remove();
   error?reject(error):resolve(accepted);};
  const valid=()=>{if(Date.now()>=deadline)throw Error('A V2 jovahagyasi kerelem lejart; nem indult iras.');
   if(isCurrent()!==true)throw Error('A V2 fiok vagy kapcsolat megvaltozott; nem indult iras.');};
  const unload=()=>finish(false,Error('A V2 Uploader ablak bezarult.'));
  approve.addEventListener('click',()=>{try{valid();finish(true);}catch(e){finish(false,e);}});
  cancel.addEventListener('click',()=>finish(false));
  try{valid();host.append(panel);win.addEventListener('pagehide',unload);
   timer=win.setInterval(()=>{try{valid();}catch(e){finish(false,e);}},500);
   try{panel.scrollIntoView({block:'center'});title.focus({preventScroll:true});}catch{}
  }catch(e){finish(false,e);}
 });
}
