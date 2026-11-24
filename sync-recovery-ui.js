import {inspectSingleTaskRecovery} from './sync-recovery-inspect.js';
import {inspectStoredBatchProgress} from './sync-batch-recovery-inspect.js';

// A single read-only action instead of per-journal confirmation buttons.
export function mountSyncRecoveryAction({
 button,output,getCurrent,getAccessToken,
 inspect=inspectSingleTaskRecovery,inspectBatch=inspectStoredBatchProgress,
 driveId,onInspected=()=>{}
}={}){
 if(!button||!output||typeof button.addEventListener!=='function'||
    typeof getCurrent!=='function'||typeof getAccessToken!=='function'||
    typeof inspect!=='function'||typeof inspectBatch!=='function'||
    typeof onInspected!=='function')
  throw Error('Hibas recovery ellenorzo felulet.');
 let generation=0,running=false,ready=false;
 const eligible=c=>c?.boardId==='5107075373'&&
  !!c.account?.homeAccountId&&!!c.account?.tenantId&&
  c.approved?.status==='APPROVED_PLAN_STORED'&&
  c.approved.mondaySyncAllowed===false&&
  c.checkpoint?.status==='CHECKPOINT_PREPARED'&&
  c.checkpoint.approvedPlanSha256===c.approved.sha256&&
  c.checkpoint.mondaySyncAllowed===false&&
  c.checkpoint.mondayWrites===0;
 const same=(old,c)=>eligible(c)&&
  old.accountId===c.account.homeAccountId&&
  old.tenantId===c.account.tenantId&&
  old.sha256===c.approved.sha256&&
  old.checkpointSha256===c.checkpoint.sha256&&
  old.boardId===c.boardId;
 function enable(){
  const current=getCurrent();
  ready=eligible(current);
  button.disabled=!ready||running;
  if(ready)output.textContent='A teljes SharePoint checkpoint és a pilot-naplók állapota egy kattintással, kizárólag olvasással ellenőrizhető.';
  return ready;
 }
 function clear(){
  generation++;ready=false;button.disabled=true;
  output.textContent='Nincs aktuális Approved Plan és SharePoint checkpoint a recovery ellenőrzéshez.';
 }
 async function run(){
  if(!ready||running)return;
  const c=getCurrent(),mark=generation;
  if(!eligible(c)){clear();return;}
  const old={boardId:c.boardId,accountId:c.account.homeAccountId,
   tenantId:c.account.tenantId,sha256:c.approved.sha256,
   checkpointSha256:c.checkpoint.sha256};
  running=true;button.disabled=true;
  output.textContent='A SharePoint checkpoint, WRITE_AHEAD és eredménynapló teljes tartalmi ellenőrzése...';
  try{
   const token=await getAccessToken(c.account);
   if(typeof token!=='string'||!token||generation!==mark||!same(old,getCurrent()))
    throw Error('A SharePoint munkamenet megvaltozott az ellenorzes kozben.');
   const report=await inspect({boardId:c.boardId,driveId,
    approvedReceipt:c.approved,checkpointReceipt:c.checkpoint,
    getAccessToken:async()=>token,
    assertCurrent:()=>generation===mark&&same(old,getCurrent())});
   if(generation!==mark||!same(old,getCurrent()))
    throw Error('A DRAFT vagy a Microsoft-felhasznalo megvaltozott.');
   const labels={
    NO_JOURNAL:'Nincs pilot-írási napló. A Monday állapotát külön össze kell vetni az eredeti tervvel.',
    WRITE_AHEAD_ONLY:'ÍRÁS ELŐTTI NAPLÓ VAN, EREDMÉNY NINCS. Az írás megtörténhetett; kézi egyeztetés kötelező.',
    RESULT_VERIFIED:'A SharePoint utónapló szerint az egyetlen pilot-feladat visszaolvasása sikeres.',
    RESULT_UNCERTAIN:'A pilot eredménye bizonytalan. Kézi egyeztetés szükséges, nincs újraküldés.'
   };
   const batchReport=report.status==='RESULT_VERIFIED'?await inspectBatch({
    boardId:c.boardId,driveId,approvedReceipt:c.approved,
    checkpointReceipt:c.checkpoint,getAccessToken:async()=>token,
    assertCurrent:()=>generation===mark&&same(old,getCurrent())
   }):null;
   if(generation!==mark||!same(old,getCurrent()))
    throw Error('A SharePoint batch-recovery munkamenete megvaltozott.');
   const sent=onInspected(report,batchReport)===true;
   output.textContent='SharePoint naplóállapot: '+report.status+'\n'+labels[report.status]+
    '\nCheckpoint SHA-256: '+report.checkpointSha256+
    '\nElőnapló: '+(report.ahead?.name||'nincs')+
    '\nUtónapló: '+(report.result?.name||'nincs')+
    (batchReport?'\nIgazolt korábbi batch-feladatok: '+batchReport.verifiedBatchCount+
     '\nKövetkező csoport: '+(batchReport.nextBatchNumber??'nem engedélyezett')+
     '\nBatch státusz: '+batchReport.status:'')+
    '\nMonday-írás az ellenőrzés során: 0.'+
    (sent?'\nAz eredmény a Monday TEST teljes-board ellenőrzéséhez átadva.':
     '\nAz eredmény csak az Uploaderben látható; a Monday ablak nem fogadta.');
  }catch(error){
   output.textContent='A SharePoint recovery bizonyíték NEM ellenőrizhető: '+
    (error?.message||error)+
    '\nAutomatikus folytatás és további Monday-írás TILTVA.';
  }finally{
   running=false;
   if(generation===mark)button.disabled=!ready;
  }
 }
 button.addEventListener('click',run);
 return Object.freeze({enable,clear,status:()=>({ready,running})});
}
