import {createStoredSyncRecovery} from './sync-recovery-catalog.js';

// Reopen and inspect historical checkpoints even when the original Uploader
// window no longer exists. Never starts/resumes a Monday write.
export function mountStoredSyncRecovery({
 listButton,select,inspectButton,output,getCurrent,getAccessToken,
 driveId,makeService=createStoredSyncRecovery,onInspected=()=>{}
}={}){
 if(!listButton||!select||!inspectButton||!output||
    typeof getCurrent!=='function'||typeof getAccessToken!=='function'||
    typeof makeService!=='function'||typeof onInspected!=='function')
  throw Error('Hibas tarolt szinkron recovery felulet.');
 let busy=false,items=[],generation=0,accountKey=null;
 const accountOf=c=>[c?.account?.homeAccountId,c?.account?.tenantId].join('|');
 const eligible=c=>c?.boardId==='5107075373'&&
  !!c.account?.homeAccountId&&!!c.account?.tenantId;
 const currentMatches=(baseline)=>{
  const c=getCurrent();
  return eligible(c)&&c.boardId===baseline.boardId&&
   accountOf(c)===baseline.accountKey;
 };
 function refresh(){
  const ok=eligible(getCurrent())&&!busy;
  listButton.disabled=!ok;
  inspectButton.disabled=!ok||!items.length||!items.some(i=>i.name===select.value);
  return ok;
 }
 function clear(){
  generation++;items=[];accountKey=null;
  select.replaceChildren();select.disabled=true;inspectButton.disabled=true;
  output.textContent='Nincs betöltött korábbi checkpoint. Kizárólag ellenőrzés érhető el.';
  refresh();
 }
 async function execute(type){
  if(busy||!eligible(getCurrent()))return;
  const c=getCurrent(),baseline={boardId:c.boardId,accountKey:accountOf(c)},
   seq=generation;
  if(type==='inspect'&&(!items.some(i=>i.name===select.value)||
      accountKey!==baseline.accountKey))return;
  busy=true;refresh();
  output.textContent=type==='list'?
   'Korábbi Sync-Status checkpoint fájlok keresése a SharePointon...':
   'Korábbi Approved Plan, checkpoint és naplófájlok SHA-256/eTag-visszaellenőrzése...';
  try{
   const token=await getAccessToken(c.account);
   if(!token||seq!==generation||!currentMatches(baseline))
    throw Error('A Microsoft-felhasznalo megvaltozott.');
   const service=makeService({boardId:c.boardId,driveId,
    getAccessToken:async()=>token,
    assertCurrent:()=>seq===generation&&currentMatches(baseline)});
   if(type==='list'){
    const found=await service.list();
    if(seq!==generation||!currentMatches(baseline))
     throw Error('A munkamenet megvaltozott.');
    items=[...found];accountKey=baseline.accountKey;
    select.replaceChildren();
    for(const item of items){
     const option=select.ownerDocument.createElement('option');
     option.value=item.name;option.textContent=item.name;
     select.append(option);
    }
    select.disabled=!items.length;
    output.textContent=items.length+
     ' korábbi, előkészítő checkpoint található. Válassz verziót; az ellenőrzés nem ír Monday-adatot.';
   }else{
    const name=select.value;
    const inspected=await service.inspectNamed(name);
    if(seq!==generation||!currentMatches(baseline))
     throw Error('A munkamenet megvaltozott.');
    const sent=onInspected(inspected)===true;
    const r=inspected.report;
    output.textContent='Korábbi szinkron ellenőrizve: '+name+
     '\nSharePoint állapot: '+r.status+
     '\nElőnapló: '+(r.ahead?.name||'nincs')+
     '\nUtónapló: '+(r.result?.name||'nincs')+
     '\nAutomatikus folytatás: TILTVA.'+
     (sent?'\nAz aktív Monday TEST megkapta az információt.':
      '\nKorábbi, bezárt Monday-ablakhoz nincs automatikus újracsatlakozás.');
   }
  }catch(e){
   output.textContent='Korábbi szinkron recovery nem igazolható: '+(e?.message||e)+
    '\nTilos további Monday-írás vagy automatikus újrapróbálkozás.';
  }finally{busy=false;refresh();}
 }
 listButton.addEventListener('click',()=>execute('list'));
 inspectButton.addEventListener('click',()=>execute('inspect'));
 select.addEventListener('change',refresh);
 refresh();
 return Object.freeze({refresh,clear,status:()=>({busy,count:items.length})});
}
