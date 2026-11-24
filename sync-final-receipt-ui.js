import {saveFinalSyncReceipt} from './sync-final-receipt-save.js';

// A separate Uploader click is mandatory. Failure consumes this browser
// candidate: a retry requires manual SharePoint reconciliation and a new flow.
export function mountFinalSyncReceiptAction({
 button,output,driveId,tenantId,
 getCurrent,getAccessToken,confirm,
 requestLiveClosure,onStored=()=>false,save=saveFinalSyncReceipt
}={}){
 if(!button||!output||typeof button.addEventListener!=='function'||
    typeof getCurrent!=='function'||typeof getAccessToken!=='function'||
    typeof confirm!=='function'||typeof requestLiveClosure!=='function'||
    typeof onStored!=='function'||typeof save!=='function')
  throw Error('Hibas szinkronlezarasi UI konfiguracio.');
 let candidate=null,busy=false,generation=0;
 const used=new Set();
 const key=(c,requestId)=>c?.approved?.sha256+':'+requestId;
 const matches=(c,p)=>{
  const intent=p?.intent;
  return c?.boardId==='5107075373'&&
   !!c.account?.homeAccountId&&!!c.account?.tenantId&&
   c.account.homeAccountId===p.accountId&&
   c.account.tenantId===p.tenantId&&
   c.approved?.status==='APPROVED_PLAN_STORED'&&
   c.approved.sha256===intent.approvedPlanSha256&&
   c.approved.approvedPlan?.sourceFingerprint===intent.sourceFingerprint&&
   c.checkpoint?.status==='CHECKPOINT_PREPARED'&&
   c.checkpoint.sha256===intent.checkpointSha256&&
   c.checkpoint.checkpoint?.mondayPreflight?.editorIdClaim===intent.editorId&&
   c.recovery?.status==='RESULT_VERIFIED'&&
   c.recovery.result?.taskId===intent.verifiedPilotTaskId&&
   c.batchLedger?.status==='ALL_VERIFIED'&&
   c.batchLedger.evidenceSha256===intent.ledgerEvidenceSha256&&
   c.batchLedger.verifiedBatchCount+1===intent.changedTaskCount&&
   c.batchLedger.remainingTaskCount===0&&
   c.batchLedger.canPrepareNextBatch===false;
 };
 function clear(){
  generation++;candidate=null;button.disabled=true;
  if(!busy)output.textContent='Nincs aktuális, két alkalmazásban jóváhagyott lezárási kérelem.';
 }
 function receive({requestId,intent}={}){
  const c=getCurrent();
  if(candidate||busy||!intent||!matches(c,{intent,
   accountId:c?.account?.homeAccountId,tenantId:c?.account?.tenantId})||
   !/^[0-9a-f-]{36}$/i.test(requestId||'')||
   intent?.format!=='flow-lps-sync-final-intent'||
   intent.status!=='REQUEST_ONLY'||
   !/^[0-9a-f]{64}$/.test(intent.boardFingerprint||'')||
   used.has(key(c,requestId)))return false;
  candidate={requestId,intent,accountId:c.account.homeAccountId,
   tenantId:c.account.tenantId};
  generation++;button.disabled=false;
  output.textContent='Monday TEST lezárási kérelme fogadva. '+
   'Módosult feladatok: '+intent.changedTaskCount+
   '\nApproved Plan: '+intent.approvedPlanSha256+
   '\nA teljes SharePoint-naplósor és a teljes Monday-board ÚJRA ellenőrzendő.'+
   '\nKülön felhasználói jóváhagyás nélkül NINCS SharePoint-írás.';
  return true;
 }
 async function run(){
  const p=candidate,c=getCurrent(),seq=generation;
  if(busy||!p)return;
  if(!matches(c,p)){clear();return;}
  if(!confirm('Ellenőrzött TEST szinkronizáció végleges zárónyugtáját '+
    'MENTJÜK a SharePoint Sync-Status mappába. A teljes naplósort '+
    'újraolvassuk és friss Monday-board igazolást kérünk. '+
    '0 Monday-írás; meglévő fájl soha nem írható felül. Folytatod?'))return;
  used.add(key(c,p.requestId));
  busy=true;candidate=null;button.disabled=true;
  output.textContent='Friss SharePoint-naplóellenőrzés, Monday-board visszaolvasás, '+
   'Entra /me és konfliktusvédett fájlmentés...';
  const valid=()=>generation===seq&&matches(getCurrent(),p);
  try{
   const token=await getAccessToken(c.account);
   if(typeof token!=='string'||!token||!valid())
    throw Error('A Microsoft / DRAFT munkamenet megváltozott.');
   const receipt=await save({boardId:c.boardId,driveId,tenantId,
    accountTenantId:p.tenantId,approvedReceipt:c.approved,
    checkpointReceipt:c.checkpoint,pilotReport:c.recovery,
    getAccessToken:async()=>token,
    requestLiveClosure:ledger=>requestLiveClosure(ledger,p.requestId),
    assertCurrent:valid});
   if(!valid()){
    output.textContent='A zárónyugta létrejöhetett, de a munkamenet időközben változott. '+
     'Ellenőrizd a Sync-Status mappát: '+receipt.name;
    return;
   }
   const sent=onStored(receipt,p.requestId)===true;
   output.textContent='SharePoint végső nyugta SHA-256/eTag visszaolvasása sikeres.'+
    '\nFájl: '+receipt.path+'\nSHA-256: '+receipt.sha256+
    '\neTag: '+receipt.eTag+'\nMonday-írás: 0'+
    (sent?'\nMonday TEST visszajelzés elküldve.':
     '\nMonday visszajelzés nem ment át; a SharePoint fájl már létezhet.');
  }catch(e){
   output.textContent='A végső nyugta nem tekinthető igazoltnak: '+
    (e?.message||e)+'\nTILOS automatikusan újrapróbálni. '+
    'Ellenőrizd a SharePoint Sync-Status mappát, és csak kézi egyeztetés után folytasd.';
  }finally{busy=false;button.disabled=true;}
 }
 button.addEventListener('click',run);
 clear();
 return Object.freeze({receive,clear,status:()=>({busy,ready:!!candidate})});
}
