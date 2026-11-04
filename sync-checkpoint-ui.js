import {saveSyncPreparationCheckpoint} from './sync-checkpoint-save.js';

// Only an explicit browser click prepares a 0-write SharePoint checkpoint.
// This controller never starts a Monday mutation or grants permission to sync.
export function mountSyncCheckpointAction({
 button,output,getCurrent,getAccessToken,confirm,
 driveId,tenantId,save=saveSyncPreparationCheckpoint,onStored=()=>{}
}={}){
 if(!button||!output||typeof getCurrent!=='function'||
    typeof getAccessToken!=='function'||typeof confirm!=='function'||
    typeof save!=='function'||typeof onStored!=='function')
  throw Error('Hibas szinkron checkpoint felulet.');
 let candidate=null,busy=false,completed=new Set(),sequence=0;
 const key=a=>a.boardId+':'+a.version+':'+a.sha256;
 const matches=(c,p)=>{
  const a=c?.approved,r=p?.report;
  return !!c?.account?.homeAccountId&&!!c?.account?.tenantId&&
    !!c?.saved&&!!c?.validated&&!!a&&!!r&&
    c.approved===p.approved&&c.boardId===a.boardId&&
    c.saved.sha256===a.sourceDraftSha256&&
    c.saved.version===a.version&&
    c.validated.sha256===a.sourceDraftSha256&&
    c.validated.version===a.version&&
    r.boardId===a.boardId&&r.draftVersion===a.version&&
    r.approvedPlanSha256===a.sha256&&
    c.account.homeAccountId===p.accountId&&
    c.account.tenantId===p.tenantId;
 };
 function clear(){
  sequence++;candidate=null;button.disabled=true;
  if(!busy)output.textContent='Nincs érvényes Monday szárazpróbából készíthető checkpoint.';
 }
 function receive(approved,report){
  const c=getCurrent();
  if(busy||candidate||!approved||!report||
     report.schemaVersion!==1||
     report.format!=='flow-lps-sync-preparation-report'||
     report.status!=='BOARD_PRECHECK_ONLY'||report.mondaySyncAllowed!==false||
     report.mondayWritten!==false||report.mutationCount!==0||
     approved.status!=='APPROVED_PLAN_STORED'||
     !c?.account?.homeAccountId||!c.account.tenantId||
     completed.has(key(approved)))return false;
  const item={approved,report,accountId:c.account.homeAccountId,tenantId:c.account.tenantId};
  if(!matches(c,item))return false;
  candidate=item;sequence++;button.disabled=false;
  output.textContent='A Monday TEST sikeres, írásmentes szárazpróbája visszaérkezett.'+
   '\nApproved Plan: '+approved.name+
   '\nÉrintett feladatok: '+report.changedTasks+
   ', mezőeltérések: '+report.fieldChanges+
   '\nKülön megerősítéssel PREPARED_NO_WRITES checkpoint menthető a SharePointra.';
  return true;
 }
 async function run(){
  if(busy||!candidate)return;
  const p=candidate,c=getCurrent(),seq=sequence;
  if(!matches(c,p)){clear();return;}
  if(!confirm('Az Approved Plan v'+p.approved.version+
    ' részére szinkron-előkészítő checkpointot mentünk a SharePoint Sync-Status mappájába. '+
    'Ezzel 0 Monday-feladat módosul, és a szinkron továbbra is TILTVA marad. Folytatod?'))
   return;
  busy=true;button.disabled=true;
  output.textContent='Approved Plan újraellenőrzése és 0-írásos SharePoint checkpoint létrehozása...';
  try{
   const token=await getAccessToken(c.account);
   if(typeof token!=='string'||!token)throw Error('Microsoft Graph token nem érhető el.');
   if(seq!==sequence||!matches(getCurrent(),p))
    throw Error('A DRAFT vagy a Microsoft-munkamenet megváltozott; nem indul checkpoint-írás.');
   const result=await save({
    approved:p.approved,report:p.report,boardId:c.boardId,
    driveId,tenantId,accountTenantId:p.tenantId,
    getAccessToken:async()=>token,
    assertCurrent:()=>seq===sequence&&matches(getCurrent(),p)
   });
   completed.add(key(p.approved));candidate=null;
   if(seq!==sequence||!matches(getCurrent(),p)){
    output.textContent='A checkpoint elkészülhetett, de közben változott a munkamenet.'+
     '\nEllenőrizd a Sync-Status mappát: '+result.name;
    return;
   }
   try{onStored(result);}catch{/* Browser handoff feedback cannot affect the verified SharePoint save. */}
   output.textContent='Sikeres 0-írásos checkpoint-mentés, teljes Graph SHA-256/eTag-ellenőrzéssel.'+
    '\nFájl: '+result.path+'\nSHA-256: '+result.sha256+
    '\neTag: '+result.eTag+
    '\nMonday-írás: 0. Tényleges szinkron: TILTVA.';
  }catch(error){
   completed.add(key(p.approved));candidate=null;
   if(seq===sequence)
    output.textContent='Checkpoint mentése nem igazolt: '+(error?.message||error)+
     '\nNe próbáld újra automatikusan: ellenőrizd a Sync-Status mappát.';
  }finally{busy=false;button.disabled=true;}
 }
 button.addEventListener('click',run);
 clear();
 return Object.freeze({clear,receive,hasCandidate:()=>!!candidate});
}
