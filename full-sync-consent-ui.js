// Explicit UI consent for asynchronous V1 requests. No native confirm dialog,
// no Graph/Monday writer, no affirmative fallback on timeout or window closure.
const pendingHosts=new WeakSet();
const assertCurrent=isCurrent=>{
 if(isCurrent()!==true)throw Error('A V1 kapcsolat vagy fiok megvaltozott. Nem indult uj iras.');
};
export function requestV1FullSyncConsent({host,report,isCurrent,win=globalThis.window,
 timeoutMs=300000}={}){
 const doc=host?.ownerDocument;
 if(!doc?.createElement||typeof host.append!=='function'||typeof isCurrent!=='function'||
    !win?.setInterval||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)
  return Promise.reject(Error('Hibas V1 megerositesi felulet.'));
 const verified=report?.verifiedTaskCount,remaining=report?.remainingTaskCount,total=report?.changedTaskCount;
 if(!['READY_TO_SYNC','READY_TO_CLOSE'].includes(report?.status)||
    ![verified,remaining,total].every(Number.isSafeInteger)||verified<1||remaining<0||
    total!==verified+remaining||(report.status==='READY_TO_SYNC'&&remaining===0)||
    (report.status==='READY_TO_CLOSE'&&remaining!==0))
  return Promise.reject(Error('Nem igazolt a teljes V1 megerositesi osszesito.'));
 if(pendingHosts.has(host))return Promise.reject(Error('Mar van fuggoben V1 megerosites.'));
 try{assertCurrent(isCurrent);}catch(error){return Promise.reject(error);}
 const panel=doc.createElement('section'),heading=doc.createElement('h3'),summary=doc.createElement('p'),
  warning=doc.createElement('p'),approve=doc.createElement('button'),cancel=doc.createElement('button');
 panel.id='v1FullSyncConsent';panel.className='v1-full-sync-consent';
 panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','v1FullSyncConsentTitle');
 heading.id='v1FullSyncConsentTitle';heading.tabIndex=-1;
 heading.textContent='Teljes V1 vissza\u00edr\u00e1s j\u00f3v\u00e1hagy\u00e1sa';
 summary.textContent='Monday TEST board: 5107075373. Igazolt: '+verified+' / '+total+
  '. H\u00e1tral\u00e9v\u0151: '+remaining+' feladat.';
 warning.textContent=remaining>0?
  'Ez VAL\u00d3DI board-vissza\u00edr\u00e1st enged\u00e9lyez a h\u00e1tral\u00e9v\u0151 tervre. '+
  'A m\u00e1r igazolt feladatokat kihagyjuk; a napl\u00f3z\u00e1s \u00e9s a visszaellen\u0151rz\u00e9s automatikus. '+
  'Mindk\u00e9t ablak maradjon nyitva. A j\u00f3v\u00e1hagy\u00e1sig nem indul \u00faj \u00edr\u00e1s. '+
  'A k\u00e9relem legfeljebb 5 percig \u00e9rv\u00e9nyes.':
  'Minden feladat igazolt. Csak a teljes V1 szinkron lez\u00e1r\u00e1s\u00e1t enged\u00e9lyezed; '+
  'a feladatokat nem \u00edrjuk \u00fajra. Mindk\u00e9t ablak maradjon nyitva.';
 approve.type=cancel.type='button';approve.id='approveV1FullSync';cancel.id='cancelV1FullSync';
 approve.textContent=remaining>0?'Teljes V1 vissza\u00edr\u00e1s j\u00f3v\u00e1hagy\u00e1sa':'V1 lez\u00e1r\u00e1s j\u00f3v\u00e1hagy\u00e1sa';
 cancel.textContent='M\u00e9gse \u2013 ne induljon \u00edr\u00e1s';
 panel.append(heading,summary,warning,approve,cancel);pendingHosts.add(host);
 return new Promise((resolve,reject)=>{
  const oldTitle=doc.title,waitingTitle='J\u00f3v\u00e1hagy\u00e1sra v\u00e1r \u2013 M-Flow';
  const deadline=Date.now()+timeoutMs;let settled=false,timer;
  const finish=(accepted,error)=>{
   if(settled)return;settled=true;approve.disabled=cancel.disabled=true;
   if(timer!==undefined)win.clearInterval(timer);
   win.removeEventListener('pagehide',unload);pendingHosts.delete(host);panel.remove();
   if(doc.title===waitingTitle)doc.title=oldTitle;
   if(error)reject(error);else resolve(accepted);
  };
  const validate=()=>{
   if(Date.now()>=deadline)throw Error('A V1 megerositesi kerelem lejart. Nem indult uj iras. Nyiss uj kapcsolatot.');
   assertCurrent(isCurrent);
  };
  const unload=()=>finish(false,Error('Az Uploader ablak bezarult. Nem indult uj iras.'));
  approve.addEventListener('click',()=>{
   if(settled)return;
   try{validate();finish(true);}catch(error){finish(false,error);}
  });
  cancel.addEventListener('click',()=>finish(false));
  try{
   host.append(panel);doc.title=waitingTitle;win.addEventListener('pagehide',unload);
   timer=win.setInterval(()=>{try{validate();}catch(error){finish(false,error);}},500);
   // Focus the heading, never the affirmative button: Enter is not consent.
   try{panel.scrollIntoView({block:'center'});heading.focus({preventScroll:true});}catch{}
  }catch(error){finish(false,error);}
 });
}

export async function beginV1FullSyncWithConsent({full,args,host,output,isCurrent,
 win=globalThis.window}={}){
 try{
  assertCurrent(isCurrent);
  const report=await full.inspect(args);assertCurrent(isCurrent);
  if(report.ledgerSha256!==args.ledgerSha256)
   throw Error('A V1 naplosor megvaltozott. Nem indult uj iras.');
  output.textContent='A teljes V1 visszairas a lenti jovahagyasra var. Meg nem indult uj iras.';
  const accepted=await requestV1FullSyncConsent({host,report,isCurrent,win});
  if(!accepted)throw Error('A teljes V1 inditasa az Uploader Megse gombjaval megszakitva. Ebben a futasban nem tortent iras.');
  assertCurrent(isCurrent);
  // Existing store re-reads the immutable plan and journal chain after consent.
  const result=await full.begin({...args,userConfirmed:true});assertCurrent(isCurrent);
  output.textContent='Teljes V1 szinkron engedelyezve. Hatravan: '+result.remainingTaskCount+
   ' feladat. Automatikus naplozas; az ablak maradjon nyitva.';
  return result;
 }catch(error){output.textContent=String(error?.message||error);throw error;}
}
