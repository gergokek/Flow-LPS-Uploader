import {createBatchTaskJournal} from './sync-batch-journal.js';
import {inspectStoredBatchProgress} from './sync-batch-recovery-inspect.js';

// One explicit Uploader confirmation enables a sequential batch of at most ten
// TEST tasks. All later per-item journal records are automatic, immutable and
// verified before the next item can be requested.
export function mountTestBatchSession({
 button,output,getCurrent,getAccessToken,
 confirm,driveId,makeJournal=createBatchTaskJournal,
 inspectBatch=inspectStoredBatchProgress,publishStart=()=>false,publishJournal=()=>false
}={}){
 if(!button||!output||typeof button.addEventListener!=='function'||
    typeof getCurrent!=='function'||typeof getAccessToken!=='function'||
    typeof confirm!=='function'||typeof makeJournal!=='function'||
    typeof inspectBatch!=='function'||
    typeof publishStart!=='function'||typeof publishJournal!=='function')
  throw Error('Hibas TEST batch-session felulet.');
 let phase='IDLE',session=null,journal=null,mark=0,nextStep=1,proof=null;
 const match=(c,p)=>c?.boardId==='5107075373'&&
  c.batchLedger?.canPrepareNextBatch===true&&
  c.batchLedger?.status===(p.intent.batchNumber===1?'FIRST_BATCH_READY':'NEXT_BATCH_READY')&&
  c.batchLedger.nextBatchNumber===p.intent.batchNumber&&
  c.batchLedger.nextStep===(p.intent.startStep??1)&&
  c.batchLedger.evidenceSha256===p.intent.priorLedgerSha256&&
  JSON.stringify(c.batchLedger.nextTaskIds)===JSON.stringify(p.intent.taskIds)&&
  !!c.account?.homeAccountId&&!!c.account?.tenantId&&
  c.account.homeAccountId===p.accountId&&c.account.tenantId===p.tenantId&&
  c.approved?.status==='APPROVED_PLAN_STORED'&&
  c.approved.sha256===p.intent.approvedSha256&&
  c.approved.version===c.saved?.version&&
  c.approved.sourceDraftSha256===c.saved?.sha256&&
  c.validated?.sha256===c.saved.sha256&&
  c.checkpoint?.status==='CHECKPOINT_PREPARED'&&
  c.checkpoint.sha256===p.intent.checkpointSha256&&
  c.checkpoint.approvedPlanSha256===p.intent.approvedSha256&&
  c.checkpoint.checkpoint?.mondayPreflight?.editorIdClaim===p.intent.editorId&&
  c.recovery?.status==='RESULT_VERIFIED'&&
  c.recovery.result?.status==='ITEM_READBACK_VERIFIED'&&
  c.recovery.result.taskId===p.intent.verifiedPilotTaskId&&
  c.recovery.checkpointSha256===p.intent.checkpointSha256&&
  c.recovery.approvedPlanSha256===p.intent.approvedSha256;
 function clear(){
  mark++;phase='IDLE';session=null;journal=null;proof=null;nextStep=1;
  button.disabled=true;output.textContent='A batch-munkamenet megszakadt. A meglévő SharePoint-naplókat ellenőrizni kell; automatikus újrakezdés nincs.';
 }
 function acceptStart({sessionId,intent}={}){
  if(phase==='COMPLETED'&&session&&intent?.batchNumber===session.intent.batchNumber+1&&
     intent?.startStep===(session.intent.startStep??1)+session.intent.taskCount){
   phase='IDLE';session=null;journal=null;proof=null;
  }
  if(phase!=='IDLE'||session||!intent||!Array.isArray(intent.taskIds)||
     intent.taskIds.length<1||intent.taskIds.length>10||
     intent.taskCount!==intent.taskIds.length||
     !Number.isInteger(intent.batchNumber)||intent.batchNumber<1||
     !Number.isSafeInteger(intent.startStep??1)||
     intent.batchNumber!==Math.ceil((intent.startStep??1)/10)||
     typeof sessionId!=='string'||
     !/^[a-f0-9-]{36}$/i.test(sessionId))return false;
  const c=getCurrent(),candidate={sessionId,intent,
   accountId:c?.account?.homeAccountId,tenantId:c?.account?.tenantId};
  if(!match(c,candidate))return false;
  session=candidate;phase='AWAIT_CONFIRMATION';button.disabled=false;
  output.textContent='Monday TEST batch kérelem: '+intent.taskCount+
   ' feladat. Minden feladat írását külön, automatikus SharePoint WRITE_AHEAD és eredménynapló veszi körül.'+
   '\nA gombot egyszer kell megerősíteni; a hibás vagy bizonytalan művelet az egész batch-et leállítja.';
  return true;
 }
 async function approve(){
  const p=session,seq=mark;
  if(phase!=='AWAIT_CONFIRMATION'||!p||!match(getCurrent(),p))return;
  const question='Figyelem: a Monday TEST-boardon legfeljebb '+p.intent.taskCount+
   ' feladat tényleges módosítását engedélyezed. A feladatok egymás után futnak, '+
   'feladatonként teljes SHA-256/eTag-ellenőrzött SharePoint-napló készül. '+
   'Bármilyen hiba után megáll, újraküldés nélkül. Folytatod?';
  if(confirm(question)!==true)return;
  phase='INITIALIZING';button.disabled=true;
  output.textContent='Egyetlen batch SharePoint-napló munkamenetének előkészítése...';
  try{
   const c=getCurrent(),token=await getAccessToken(c.account);
   if(!token||seq!==mark||!match(getCurrent(),p))
    throw Error('Microsoft-munkamenet megvaltozott.');
   // Re-read every durable proof at the precise moment of new write consent.
   const prior=await inspectBatch({boardId:c.boardId,driveId,
    approvedReceipt:c.approved,checkpointReceipt:c.checkpoint,
    getAccessToken:async()=>getAccessToken(c.account),
    assertCurrent:()=>seq===mark&&match(getCurrent(),p)});
   if(!prior.canPrepareNextBatch||
      prior.status!==c.batchLedger.status||
      prior.evidenceSha256!==p.intent.priorLedgerSha256||
      prior.nextBatchNumber!==p.intent.batchNumber||
      prior.nextStep!==(p.intent.startStep??1)||
      JSON.stringify(prior.nextTaskIds)!==JSON.stringify(p.intent.taskIds)||
      seq!==mark||!match(getCurrent(),p))
    throw Error('A SharePoint batch-naplosor valtozott; uj recovery szukseges.');
   journal=makeJournal({boardId:c.boardId,driveId,
    getAccessToken:async()=>getAccessToken(c.account),
    assertCurrent:()=>seq===mark&&match(getCurrent(),p)});
   if(!publishStart(p.sessionId))
    throw Error('A Monday nem fogadta az egyszeri batch inditasi nyugtat.');
   nextStep=p.intent.startStep??1;phase='ACTIVE';
   output.textContent='TEST batch engedélyezve. Egyenként, naplózva legfeljebb '+
    p.intent.taskCount+' feladat; az Uploader várja az első WRITE_AHEAD kérést.';
  }catch(e){
   phase='STOPPED';output.textContent='A batch indítása nem igazolható: '+
    (e?.message||e)+'\nAutomatikus újrapróbálkozás nincs.';
  }
 }
 async function acceptAhead({sessionId,requestId,entry}={}){
  const p=session,seq=mark;
  if(!p||phase!=='ACTIVE'||!journal||sessionId!==p.sessionId||
     entry?.step!==nextStep||entry.batchNumber!==p.intent.batchNumber||
     entry.taskId!==p.intent.taskIds[nextStep-1]||
     entry.approvedSha256!==p.intent.approvedSha256||
     entry.checkpointSha256!==p.intent.checkpointSha256||
     !match(getCurrent(),p))return false;
  phase='PERSISTING_AHEAD';
  try{
   const c=getCurrent(),result=await journal.recordAhead({
    entry,checkpointReceipt:{...c.checkpoint,batchProgress:c.batchLedger},
    approvedReceipt:c.approved});
   if(seq!==mark||!match(getCurrent(),p)||
      !publishJournal('ahead',result,requestId,sessionId))
    throw Error('WRITE_AHEAD igazolas nem jutott vissza a Monday-hez.');
   proof=result;phase='AHEAD_CONFIRMED';
   output.textContent='Batch '+nextStep+'/'+p.intent.taskCount+
    ' – előnapló igazolva: '+result.name+
    '\nVárakozás a Monday egyszeri módosításának visszaolvasására.';
   return true;
  }catch(e){
   phase='STOPPED';output.textContent='A batch előnaplója nem igazolható: '+
    (e?.message||e)+'\nNincs automatikus újraindítás.';
   return false;
  }
 }
 async function acceptResult({sessionId,requestId,entry,aheadReceipt}={}){
  const p=session,seq=mark;
  if(!p||phase!=='AHEAD_CONFIRMED'||!journal||sessionId!==p.sessionId||
     entry?.step!==nextStep||entry.batchNumber!==p.intent.batchNumber||
     entry.taskId!==p.intent.taskIds[nextStep-1]||
     entry.writeAheadSha256!==proof?.sha256||
     aheadReceipt?.sha256!==proof?.sha256||
     entry.approvedSha256!==p.intent.approvedSha256||
     entry.checkpointSha256!==p.intent.checkpointSha256||
     !match(getCurrent(),p))return false;
  phase='PERSISTING_RESULT';
  try{
   const c=getCurrent(),result=await journal.recordResult({
    entry,aheadReceipt,checkpointReceipt:{...c.checkpoint,batchProgress:c.batchLedger},
    approvedReceipt:c.approved});
   if(seq!==mark||!match(getCurrent(),p)||
      !publishJournal('result',result,requestId,sessionId))
    throw Error('A batch eredmenynaplo nyugtaja nem ellenorizheto.');
   if(result.status!=='BATCH_RESULT_VERIFIED'){
    phase='STOPPED';
    output.textContent='A batch megállt bizonytalan Monday-feladatnál: #'+entry.taskId+
     '\nA SharePoint eredménynapló mentve, automatikus folytatás TILTVA.';
    return true;
   }
   nextStep++;proof=null;
   phase=nextStep>(p.intent.startStep??1)+p.intent.taskCount-1?'COMPLETED':'ACTIVE';
   output.textContent='Eredménynapló igazolva: '+result.name+
    '\nSikeres feladatok: '+(nextStep-1)+'/'+p.intent.taskCount+
    (phase==='COMPLETED'?'\nA batch összes feladata ellenőrizve.':
     '\nA következő feladat naplózására várakozás...');
   return true;
  }catch(e){
   phase='STOPPED';
   output.textContent='A batch utónapló bizonytalan: '+(e?.message||e)+
    '\nSemmilyen további Monday-írás nem engedélyezett.';
   return false;
  }
 }
 button.addEventListener('click',approve);
 return Object.freeze({acceptStart,acceptAhead,acceptResult,clear,
  status:()=>({phase,nextStep,taskCount:session?.intent.taskCount??0})});
}
