import {createSingleTaskJournal} from './sync-single-task-journal.js';

// Browser controller for ONE journaled TEST pilot. A Monday request cannot
// create the write-ahead without a separate click in the Uploader.
export function mountSingleTaskJournalControl({
 button,output,getCurrent,getAccessToken,confirm,
 driveId,makeJournal=createSingleTaskJournal,
 onAheadVerified=()=>false,onResultVerified=()=>false
}={}){
 if(!button||!output||typeof getCurrent!=='function'||
    typeof getAccessToken!=='function'||typeof confirm!=='function'||
    typeof makeJournal!=='function'||typeof onAheadVerified!=='function'||
    typeof onResultVerified!=='function')
  throw Error('Hibas egyfeladatos naplo felulet.');
 let candidate=null,stage='IDLE',generation=0,used=false;
 let journal=null,aheadReceipt=null,token=null;
 const match=(c,p)=>{
  const a=c?.approved,cp=c?.checkpoint,account=c?.account;
  return !!c?.saved&&!!c?.validated&&!!account?.homeAccountId&&
   !!account.tenantId&&!!a&&!!cp&&
   c.boardId==='5107075373'&&a.status==='APPROVED_PLAN_STORED'&&
   a.approvedPlan?.boardId===c.boardId&&
   a.sha256===p.entry.approvedSha256&&
   a.sourceDraftSha256===c.saved.sha256&&
   a.version===c.saved.version&&
   c.validated.sha256===c.saved.sha256&&
   c.validated.version===c.saved.version&&
   cp.status==='CHECKPOINT_PREPARED'&&cp.sha256===p.entry.checkpointSha256&&
   cp.approvedPlanSha256===a.sha256&&cp.mondayWrites===0&&
   cp.mondaySyncAllowed===false&&
   account.homeAccountId===p.accountId&&account.tenantId===p.tenantId&&
   cp.checkpoint?.mondaySourceFingerprint===p.entry.sourceFingerprint;
 };
 function clear(){
  generation++;candidate=null;button.disabled=true;
  if(stage!=='IDLE'&&stage!=='DONE')stage='STOPPED';
  output.textContent='Nincs indítható pilot-napló. Monday-írás nem történt ezen a felületen.';
 }
 function acceptAhead({requestId,entry}){
  if(used||stage!=='IDLE'||candidate||typeof requestId!=='string'||
     !/^[a-f0-9-]{36}$/i.test(requestId)||
     entry?.schemaVersion!==1||entry.format!=='flow-lps-single-task-write-ahead'||
     entry.status!=='WRITE_AHEAD'||entry.boardId!=='5107075373'||
     !/^\d+$/.test(entry.taskId||'')||
     entry.maximumMondayWrites!==1||entry.actualMondayWrites!==0||
     !Array.isArray(entry.fieldNames)||!entry.fieldNames.length)return false;
  const c=getCurrent(),p={requestId,entry,accountId:c?.account?.homeAccountId,
   tenantId:c?.account?.tenantId};
  if(!match(c,p))return false;
  const plan=c.approved.approvedPlan.plan;
  const before=plan.base?.tasks?.find(t=>t.id===entry.taskId);
  const after=plan.working?.find(t=>t.id===entry.taskId);
  if(!before||!after||JSON.stringify(before)===JSON.stringify(after))return false;
  candidate=p;used=true;stage='PENDING';generation++;button.disabled=false;
  output.textContent='Egyetlen TEST-feladat előnaplózási kérése érkezett.'+
   '\nFeladat: #'+entry.taskId+' | Mezők: '+entry.fieldNames.join(', ')+
   '\nSharePoint előnaplózás csak az alábbi gomb külön megerősítése után indulhat.'+
   '\nA Monday-írás még nem kezdődött meg.';
  return true;
 }
 async function run(){
  if(!candidate||stage!=='PENDING')return;
  const p=candidate,current=getCurrent(),seq=generation;
  if(!match(current,p)){clear();return;}
  if(!confirm('Az Approved Plan egyetlen TEST-feladatához ('+p.entry.taskId+
   ') visszaellenőrzött SharePoint WRITE_AHEAD naplót hozunk létre. '+
   'E sikeres napló visszajelzése után a Monday a külön már megerősített '+
   'egyetlen feladaton egyetlen módosítási kísérletet tehet. Folytatod?'))return;
  stage='WRITING_AHEAD';button.disabled=true;
  output.textContent='WRITE_AHEAD napló mentése és teljes SharePoint-visszaellenőrzése...';
  try{
   token=await getAccessToken(current.account);
   if(typeof token!=='string'||!token||seq!==generation||!match(getCurrent(),p))
    throw Error('Microsoft-fiók vagy DRAFT közben megváltozott.');
   journal=makeJournal({boardId:current.boardId,driveId,
    getAccessToken:async()=>token,
    assertCurrent:()=>seq===generation&&match(getCurrent(),p)});
   const r=await journal.recordAhead({entry:p.entry,
    approvedReceipt:current.approved,checkpointReceipt:current.checkpoint});
   aheadReceipt=r;
   if(seq!==generation||!match(getCurrent(),p)||!onAheadVerified(r,p.requestId))
    throw Error('A napló elkészülhetett, de a Monday-nek nem igazolható. NINCS további írás.');
   stage='AHEAD_CONFIRMED';
   output.textContent='WRITE_AHEAD napló SharePointon igazolva: '+r.name+
    '\nSHA-256: '+r.sha256+
    '\nAz Uploader várja a Monday egyetlen feladatának ellenőrzött eredményét.';
  }catch(error){
   stage='STOPPED';
   output.textContent='A pilot előnaplózása vagy visszaigazolása nem igazolt: '+
    (error?.message||error)+
    '\nTilos az automatikus újraküldés. Ellenőrizd a SharePoint Sync-Status mappát.';
  }
 }
 async function acceptResult({requestId,entry,aheadReceipt:proof}){
  const p=candidate;
  if(stage!=='AHEAD_CONFIRMED'||!p||!journal||
     requestId!==p.requestId||
     proof?.status!=='WRITE_AHEAD_VERIFIED'||
     proof.sha256!==aheadReceipt?.sha256||
     entry?.boardId!=='5107075373'||entry.taskId!==p.entry.taskId||
     entry.approvedSha256!==p.entry.approvedSha256||
     entry.checkpointSha256!==p.entry.checkpointSha256||
     entry.writeAheadSha256!==aheadReceipt.sha256)return false;
  stage='WRITING_RESULT';
  const current=getCurrent(),seq=generation;
  try{
   if(!match(current,p))throw Error('A munkamenet eltér a korábbi pilot-naplótól.');
   const result=await journal.recordResult({entry,aheadReceipt:proof,
    approvedReceipt:current.approved,checkpointReceipt:current.checkpoint});
   if(seq!==generation||!match(getCurrent(),p)||!onResultVerified(result,p.requestId))
    throw Error('A visszaellenőrzött eredményt nem lehetett átadni a Monday-nek.');
   stage='DONE';
   output.textContent='A pilot eredménye tartósan rögzítve: '+result.name+
    '\nÁllapot: '+result.status+
    '\nNincs automatikus folytatás. A többi feladat változatlan.';
   return true;
  }catch(error){
   stage='STOPPED';
   output.textContent='A pilot írás utáni naplója nem igazolt: '+(error?.message||error)+
    '\nA Monday-írást TILOS újraindítani. Kézi SharePoint/Monday-egyeztetés szükséges.';
   return false;
  }
 }
 button.addEventListener('click',run);
 return Object.freeze({clear,acceptAhead,acceptResult,status:()=>stage});
}
