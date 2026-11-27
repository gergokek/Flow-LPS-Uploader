import {PILOT_BOARD,pilotAssert as ok,pilotStable as stable,
 pilotFileSha,pilotHex,pilotUuid} from './v1-pilot-contract.js';
import {FULL_FINAL,stepName,syncCommon,inspectFullSyncEvidence,requireFreshBoard,
 validateStepAhead,validateStepResult,recoverySummary,validateNoteReconciliation} from './v1-full-sync-contract.js';

// Only verified create-only storage is injected. No Monday writer exists here.
// Unique step filenames serialize competing popups without overwriting a journal.
export function createV1FullSyncStore({inspectPilot,readSync,listSync,createSync,
 checkPinned,check=()=>{},now=()=>new Date()}={}){
 for(const f of [inspectPilot,readSync,listSync,createSync,checkPinned,check,now])
  ok(typeof f==='function','Invalid V1 full-sync store.');
 let session=null,lastInspection=null;
 const wrap=f=>f?{document:f.value,receipt:{name:f.name,id:f.id,eTag:f.eTag,
  sha256:f.sha256,path:'Projects/'+PILOT_BOARD+'/Sync-Status/'+f.name,
  verification:'content-sha256-and-etag'}}:null;
 const catalog=items=>stable(items.map(({id,name,eTag})=>({id,name,eTag}))
  .sort((a,b)=>a.name.localeCompare(b.name)));
 const list=async()=>{
  const files=await listSync();ok(Array.isArray(files),'Invalid Sync-Status listing.');
  return files.filter(item=>item.name?.startsWith('sync-v1-step-'));
 };
 async function inspect({createdBy,editorId}={}){
  check();const pilot=await inspectPilot({createdBy,editorId});
  ok(pilot.status==='PILOT_RECORDED','A V1 pilot nincs teljesen igazolva; szinkron tiltva.');
  const listed=await list(),steps=new Map();
  // Bounded parallel full-content reads; every receipt has a double eTag check
  // in the underlying readFile. Compare the complete listing again afterward.
  for(let offset=0;offset<listed.length;offset+=4){
   const batch=listed.slice(offset,offset+4);
   const files=await Promise.all(batch.map(item=>readSync(item.name)));
   for(let i=0;i<batch.length;i++){
    const item=batch[i],file=files[i],match=/^sync-v1-step-(\d{6})-(ahead|result|reconciliation)\.json$/.exec(item.name);
    ok(match&&Number(match[1])>=2,'Ismeretlen vagy hibas V1 szinkronnaplo.');
    const step=Number(match[1]),kind=match[2],row=steps.get(step)||{step,ahead:null,result:null};
    ok(!row[kind],'Duplikalt V1 szinkronnaplo.');
    ok(file&&file.id===item.id&&file.eTag===item.eTag,'A V1 naplolista visszaolvasas kozben megvaltozott.');
    row[kind]=wrap(file);steps.set(step,row);
   }
  }
  const listing=catalog(listed);
  ok(listing===catalog(await list()),'A V1 naplolista nem stabil; nincs folytatas.');
  const evidence={...pilot.evidence,records:[...steps.values()].sort((a,b)=>a.step-b.step),
   final:wrap(await readSync(FULL_FINAL))};
  const state=await inspectFullSyncEvidence(evidence,editorId,now().getTime());check();
  lastInspection={createdBy,editorId,evidence:structuredClone(evidence),state,
   listing,at:now().getTime()};
  return {status:state.status,evidence,verifiedTaskCount:state.verifiedTaskCount,
   remainingTaskCount:state.remainingTaskCount,changedTaskCount:state.model.changedTaskCount,
   reconciliation:recoverySummary(state.recovery),ledgerSha256:state.ledgerSha256,checkedAt:now().toISOString(),readOnly:true};
 }
 async function begin({createdBy,userConfirmed,...request}={}){
  ok(userConfirmed===true&&pilotUuid(request.executionId)&&!session,
   'A teljes szinkron nincs megerositve vagy mar fut.');
  const report=await inspect({createdBy,editorId:request.editorId});
  const state=await inspectFullSyncEvidence(report.evidence,request.editorId,now().getTime());
  ok(['READY_TO_SYNC','READY_TO_CLOSE','V1_SYNC_COMPLETED','RECONCILIATION_AVAILABLE'].includes(state.status),
   'V1 naplo bizonytalan; nincs folytatas.');
  // begin is read-only: user consent is for this immutable plan/ledger. Monday
  // refreshes the board after consent. Each actual ahead/finish enforces freshness.
  ok(request.expectedApprovedSha256===state.model.pilot.approvedSha256&&
   request.expectedCheckpointSha256===state.model.pilot.checkpointSha256&&
   request.ledgerSha256===state.ledgerSha256,'A jovahagyott V1 terv vagy naplosor megvaltozott.');
  ok((request.acceptedReconciliationSha256??null)===(state.recovery?.sha256??null),
   'A megjegyzes pontos eltereset kulon fel kell tuntetni es elfogadni.');
  session={acceptedReconciliationSha256:state.recovery?.sha256??null,id:request.executionId,createdBy,editorId:request.editorId,
   evidence:structuredClone(report.evidence),state,inFlight:null,spent:new Set(),blocked:false,
   expires:now().getTime()+60*60*1000};
  return structuredClone({...report,executionId:session.id});
 }
 function current(request){
  check();const s=session;
  ok(s&&!s.blocked&&request.executionId===s.id&&request.createdBy===s.createdBy&&
   request.editorId===s.editorId&&now().getTime()<s.expires,
   'Lejart vagy megszakadt V1 szinkronmunkamenet.');return s;
 }
 function inspected(s){
  const r=lastInspection;
  ok(r&&r.createdBy===s.createdBy&&r.editorId===s.editorId&&
   now().getTime()-r.at<=120000&&r.state.ledgerSha256===s.state.ledgerSha256,
   'Friss teljes SharePoint-naploellenorzes szukseges.');return r;
 }
 async function reconcile(request={}){
  const s=current(request);
  try{
   ok(!s.inFlight&&s.state.status==='RECONCILIATION_AVAILABLE'&&!s.spent.has('reconcile'),
    'Nincs uj egyeztetesre engedelyezett megjegyzes.');
   s.spent.add('reconcile');
   const report=await inspect({createdBy:s.createdBy,editorId:s.editorId});
   const r=lastInspection,c=r.state.recovery;
   ok(c&&c.sha256===s.acceptedReconciliationSha256&&c.sha256===request.recoverySha256&&
    r.state.ledgerSha256===s.state.ledgerSha256,'A jovahagyott egyeztetesi alap megvaltozott.');
   requireFreshBoard(request,r.state,now().getTime());
   let rawNote;try{rawNote=JSON.parse(request.rawNoteValue);}catch{throw Error('Hibas nyers note visszaolvasas.');}
   ok(request.noteText===c.observedNote&&rawNote===c.observedNote&&
    request.itemReadbackSha256===c.observedItemSha256,'A megjegyzes nyers tartalma elter.');
   await checkPinned(report.evidence,s.createdBy);
   ok(r.listing===catalog(await list()),'A naplolista az egyeztetes elott megvaltozott.');
   requireFreshBoard(request,r.state,now().getTime());
   const {observedFingerprint,sha256,...binding}=c;
   const document={...binding,format:'mflow-v1-sync-reconciliation',status:'NOTE_REPRESENTATION_ACCEPTED',
    candidateSha256:sha256,userConfirmed:true,approvedExactMatch:false,
    executionId:s.id,requestId:request.requestId,newMutationAttempts:0,historicalMutationAttempts:1,
    noteText:request.noteText,rawNoteValue:request.rawNoteValue,fullBoardReadbackMatches:true,
    checkedAt:request.boardVerifiedAt,createdAt:now().toISOString(),automaticallyRetryable:false};
   const receipt=await createSync(stepName(c.step,'reconciliation'),document),pair={document,receipt};
   await validateNoteReconciliation(pair,c,now().getTime());
   s.evidence=structuredClone(report.evidence);s.evidence.records.at(-1).reconciliation=pair;
   s.state=await inspectFullSyncEvidence(s.evidence,s.editorId,now().getTime());
   ok(['READY_TO_SYNC','READY_TO_CLOSE'].includes(s.state.status),'Az egyeztetes nem oldotta fel a megallast.');
   return structuredClone(pair);
  }catch(error){s.blocked=true;throw error;}
 }
 async function ahead(request={}){
  const s=current(request);
  try{
   ok(!s.inFlight&&s.state.status==='READY_TO_SYNC','V1 szinkron: meg van fuggoben levo feladat.');
   // Monday asks for a fresh full-inspect before these boundaries, then reads
   // the current board. Do not make that board proof stale by repeating the scan.
   if(s.state.verifiedTaskCount>1&&(s.state.verifiedTaskCount-1)%10===0){
    const r=inspected(s);
    ok(r.state.status==='READY_TO_SYNC'&&r.listing===catalog(await list()),
     'A V1 naplolanc megvaltozott.');
    s.evidence=structuredClone(r.evidence);s.state=r.state;
   }
   const t=s.state.next;
   requireFreshBoard(request,s.state,now().getTime());
   ok(t&&request.step===t.step&&request.taskId===t.taskId&&pilotUuid(request.requestId)&&
    pilotHex(request.mutationValuesSha256)&&!s.spent.has('ahead:'+t.step),
    'Eltero vagy mar elkezdett V1 lepes.');
   s.spent.add('ahead:'+t.step);
   await checkPinned(s.evidence,s.createdBy);check();
   const row=s.evidence.records.at(-1),last=row?.reconciliation||row?.result||s.evidence.result;
   const prior=wrap(await readSync(last.receipt.name));
   ok(prior?.receipt.sha256===s.state.previousResultSha256&&prior.receipt.eTag===last.receipt.eTag,
    'A legutobbi igazolt V1 eredmeny megvaltozott.');
   requireFreshBoard(request,s.state,now().getTime());
   const document={...syncCommon(t),format:'mflow-v1-sync-ahead',status:'WRITE_AHEAD',
    step:t.step,taskId:t.taskId,taskName:t.taskName,executionId:s.id,requestId:request.requestId,
    fields:structuredClone(t.fields),previousResultSha256:s.state.previousResultSha256,
    mutationValuesSha256:request.mutationValuesSha256,sourceBoardSha256:t.sourceBoardSha256,
    expectedBoardSha256:t.expectedBoardSha256,boardVerifiedAt:request.boardVerifiedAt,
    createdAt:now().toISOString(),maximumMutationAttempts:1,automaticallyRetryable:false};
   const receipt=await createSync(stepName(t.step,'ahead'),document);
   const pair={document,receipt};
   await validateStepAhead(pair,t,s.state.previousResultSha256,now().getTime());
   s.inFlight=structuredClone(pair);return structuredClone(pair);
  }catch(error){s.blocked=true;throw error;}
 }
 async function result(request={}){
  const s=current(request),t=s.state.next,d=request.result;
  try{
   ok(s.inFlight&&t&&d?.step===t.step&&!s.spent.has('result:'+t.step),'Hianyzo vagy mar lezart V1 lepes.');
   s.spent.add('result:'+t.step);await checkPinned(s.evidence,s.createdBy);
   const ahead=wrap(await readSync(stepName(t.step,'ahead')));
   ok(ahead?.receipt.sha256===s.inFlight.receipt.sha256,'V1 elonaplo megvaltozott.');
   const candidate={document:d,receipt:{name:stepName(t.step,'result'),id:'validate',eTag:'validate',
    path:'Projects/'+PILOT_BOARD+'/Sync-Status/'+stepName(t.step,'result'),
    sha256:await pilotFileSha(d),verification:'content-sha256-and-etag'}};
   await validateStepResult(candidate,ahead,t,now().getTime());
   const receipt=await createSync(stepName(t.step,'result'),d),pair={document:structuredClone(d),receipt};
   await validateStepResult(pair,ahead,t,now().getTime());
   s.evidence.records.push({step:t.step,ahead,result:pair});
   s.state=await inspectFullSyncEvidence(s.evidence,s.editorId,now().getTime());s.inFlight=null;
   if(s.state.status==='MANUAL_RECONCILIATION_REQUIRED')s.blocked=true;
   return structuredClone(pair);
  }catch(error){s.blocked=true;throw error;}
 }
 async function finish(request={}){
  const s=current(request);
  try{
   ok(!s.inFlight&&!s.spent.has('finish'),'V1 zaras mar elkezdodott vagy feladat fuggoben.');
   s.spent.add('finish');
   const inspectedState=inspected(s),state=inspectedState.state,evidence=inspectedState.evidence;
   ok(['READY_TO_CLOSE','V1_SYNC_COMPLETED'].includes(state.status),'Nem teljes a V1 naplolanc.');
   requireFreshBoard(request,state,now().getTime());
   ok(inspectedState.listing===catalog(await list()),'A V1 naplolista a zaras elott megvaltozott.');
   await checkPinned(evidence,s.createdBy);requireFreshBoard(request,state,now().getTime());
   if(evidence.final){s.blocked=true;return structuredClone(evidence.final);}
   const document={...syncCommon(state.model.pilot),format:'mflow-v1-sync-final',status:'V1_SYNC_COMPLETED',
    verifiedTaskCount:state.verifiedTaskCount,totalTaskCount:state.model.taskCount,remainingTaskCount:0,
    ledgerSha256:state.ledgerSha256,lastResultSha256:state.previousResultSha256,
    approvedExactMatch:state.model.reconciliations.length===0,
    approvedFinalBoardSha256:state.model.approvedFinalBoardSha256,reconciliations:state.model.reconciliations,
    boardReadbackSha256:state.model.finalBoardSha256,fullBoardReadbackMatches:true,
    checkedAt:request.boardVerifiedAt,createdAt:now().toISOString(),automaticallyRetryable:false};
   const receipt=await createSync(FULL_FINAL,document),pair={document,receipt};
   const verified=await inspectFullSyncEvidence({...evidence,final:pair},s.editorId,now().getTime());
   ok(verified.status==='V1_SYNC_COMPLETED','V1 zaronyugta ellenorzese sikertelen.');
   s.blocked=true;return structuredClone(pair);
  }catch(error){s.blocked=true;throw error;}
 }
 return Object.freeze({inspect,begin,reconcile,ahead,result,finish});
}
