// Pure shared V1 synchronization contract. Keep identical in both TEST apps.
import {PILOT_BOARD,PILOT_FIELDS,pilotAssert as ok,pilotStable as stable,
 pilotSha as sha,pilotTask,pilotFingerprint,pilotUuid,pilotHex,
 checkPilotFile,inspectPilotEvidence} from './v1-pilot-contract.js';
export const FULL_FINAL='sync-v1-completed.json';
export function stepName(step,kind){
 ok(Number.isSafeInteger(step)&&step>=2&&step<=999999&&['ahead','result','reconciliation'].includes(kind),'Invalid V1 journal name.');
 return 'sync-v1-step-'+String(step).padStart(6,'0')+'-'+kind+'.json';
}
export function syncCommon(t){return {schemaVersion:1,boardId:PILOT_BOARD,planVersion:1,
 sessionId:t.sessionId,revision:t.revision,editorId:t.editorId,
 microsoftEntraObjectId:t.microsoftEntraObjectId,approvedSha256:t.approvedSha256,
 checkpointSha256:t.checkpointSha256};}
const matches=(d,t)=>Object.entries(syncCommon(t)).every(([k,v])=>d?.[k]===v);
export async function fullSyncModel(e,editorId,now=Date.now()){
 const pilot=await inspectPilotEvidence(e,editorId,now);
 ok(pilot.status==='PILOT_RECORDED','A teljes szinkronhoz igazolt pilot es mindket pilotnaplo szukseges.');
 const a=e.approvedPlan,base=a.plan.base,working=a.plan.working,changes=[];
 for(let i=0;i<working.length;i++){
  const before=base.tasks[i],after=working[i];
  const fields=Object.fromEntries(PILOT_FIELDS.filter(k=>stable(before[k])!==stable(after[k]))
   .map(k=>[k,{before:before[k]??null,after:after[k]??null}]));
  if(Object.keys(fields).length)changes.push({step:changes.length+1,taskId:after.id,
   taskName:after.name,before,after,fields});
 }
 ok(changes[0].taskId===pilot.target.taskId,'V1 pilot sorrend elter.');
 const snapshots=[pilotFingerprint(base)],expected=structuredClone(base);
 const byId=new Map(expected.tasks.map((t,i)=>[t.id,i]));
 for(const c of changes){expected.tasks[byId.get(c.taskId)]=structuredClone(c.after);snapshots.push(pilotFingerprint(expected));}
 const hashes=await Promise.all(snapshots.map(sha));
 const targets=changes.map((c,i)=>({...syncCommon(pilot.target),...c,
  sourceFingerprint:snapshots[i],expectedFingerprint:snapshots[i+1],
  sourceBoardSha256:hashes[i],expectedBoardSha256:hashes[i+1]}));
 return {targets,snapshots,hashes,changedTaskCount:changes.length,taskCount:base.tasks.length,
  pilot:pilot.target,effectiveWorking:structuredClone(working),reconciliations:[],
  approvedFinalBoardSha256:hashes.at(-1),finalFingerprint:snapshots.at(-1),finalBoardSha256:hashes.at(-1)};
}
export async function validateStepAhead(pair,t,previousResultSha256,now=Date.now()){
 const d=pair?.document;
 await checkPilotFile(d,pair?.receipt,'Sync-Status',stepName(t.step,'ahead'));
 ok(matches(d,t)&&d.format==='mflow-v1-sync-ahead'&&d.status==='WRITE_AHEAD'&&
  d.step===t.step&&d.taskId===t.taskId&&d.taskName===t.taskName&&d.previousResultSha256===previousResultSha256&&
  stable(d.fields)===stable(t.fields)&&d.sourceBoardSha256===t.sourceBoardSha256&&
  d.expectedBoardSha256===t.expectedBoardSha256&&pilotHex(d.mutationValuesSha256)&&
  pilotUuid(d.requestId)&&pilotUuid(d.executionId)&&d.maximumMutationAttempts===1&&
  d.automaticallyRetryable===false&&Number.isFinite(Date.parse(d.createdAt))&&
  Date.parse(d.createdAt)<=now+5000,'V1 szinkron: ervenytelen elonaplo.');
 return d;
}
export async function validateStepResult(pair,ahead,t,now=Date.now()){
 const d=pair?.document,a=ahead.document;
 await checkPilotFile(d,pair?.receipt,'Sync-Status',stepName(t.step,'result'));
 ok(matches(d,t)&&d.format==='mflow-v1-sync-result'&&d.step===t.step&&d.taskId===t.taskId&&
  d.requestId===a.requestId&&d.executionId===a.executionId&&
  d.writeAheadSha256===ahead.receipt.sha256&&d.mutationValuesSha256===a.mutationValuesSha256&&
  [0,1].includes(d.mutationAttempts)&&['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN','ABORTED_NO_WRITE'].includes(d.status)&&
  d.automaticallyRetryable===false&&Number.isFinite(Date.parse(d.checkedAt))&&
  Date.parse(d.checkedAt)>=Date.parse(a.createdAt)&&Date.parse(d.checkedAt)<=now+5000,
  'V1 szinkron: ervenytelen eredmenynaplo.');
 if(d.status!=='ITEM_READBACK_VERIFIED'){
  ok(d.status!=='ABORTED_NO_WRITE'||d.mutationAttempts===0,'Ellentmondo mutation darabszam.');return false;
 }
 ok(d.mutationAttempts===1&&d.replyConfirmed===true&&d.itemReadbackMatches===true&&
  d.fullBoardReadbackMatches===true&&d.error===null&&d.boardReadbackSha256===t.expectedBoardSha256&&
  d.itemReadbackSha256===await sha(stable(pilotTask(t.after))),
  'V1 szinkron: a sikeres allapot nincs visszaellenorizve.');
 return true;
}
// Recovery is an explicit, append-only acceptance of ONE documented representation
// difference. Never trim fingerprint/equality inputs or modify the Approved Plan.
export async function noteReconciliationCandidate(r,t){
 const d=r.result?.document,approvedNote=t.fields.note?.after;
 if(d?.status!=='ITEM_UNCERTAIN'||d.mutationAttempts!==1||d.replyConfirmed!==true||
    d.error!=='READBACK_MISMATCH'||d.itemReadbackMatches!==false||d.fullBoardReadbackMatches!==false||
    typeof approvedNote!=='string'||!approvedNote.endsWith(' '))return null;
 // ASCII U+0020 at the END only. Leading/internal/Unicode whitespace is significant.
 const observedNote=approvedNote.replace(/ +$/,'');
 if(!observedNote||observedNote===approvedNote)return null;
 const task={...structuredClone(t.after),note:observedNote};
 const snapshot=JSON.parse(t.expectedFingerprint),item=snapshot.tasks.find(x=>x.id===t.taskId);
 if(!item)return null;item.note=observedNote;
 const observedFingerprint=pilotFingerprint(snapshot),observedBoardSha256=await sha(observedFingerprint),
  observedItemSha256=await sha(stable(pilotTask(task)));
 if(d.boardReadbackSha256!==observedBoardSha256||d.itemReadbackSha256!==observedItemSha256)return null;
 const binding={...syncCommon(t),step:t.step,taskId:t.taskId,taskName:t.taskName,
  policy:'EXPLICIT_TRAILING_ASCII_SPACE_ACCEPTANCE',approvedNote,observedNote,
  approvedExpectedBoardSha256:t.expectedBoardSha256,
  originalAheadSha256:r.ahead.receipt.sha256,originalResultSha256:r.result.receipt.sha256,
  observedBoardSha256,observedItemSha256};
 return {...binding,sha256:await sha(stable(binding)),observedFingerprint};
}
export function recoverySummary(c){return c?{step:c.step,taskId:c.taskId,taskName:c.taskName,
 approvedNote:c.approvedNote,observedNote:c.observedNote,sha256:c.sha256}:null;}
export async function validateNoteReconciliation(pair,c,now=Date.now()){
 const d=pair?.document;
 await checkPilotFile(d,pair?.receipt,'Sync-Status',stepName(c.step,'reconciliation'));
 const {observedFingerprint,sha256,...binding}=c;
 let rawNote;try{rawNote=JSON.parse(d.rawNoteValue);}catch{throw Error('Hibas nyers megjegyzes-igazolas.');}
 ok(Object.entries(binding).every(([k,v])=>d[k]===v)&&
  d.format==='mflow-v1-sync-reconciliation'&&d.status==='NOTE_REPRESENTATION_ACCEPTED'&&
  d.candidateSha256===sha256&&d.userConfirmed===true&&d.approvedExactMatch===false&&
  d.newMutationAttempts===0&&d.historicalMutationAttempts===1&&
  d.noteText===c.observedNote&&rawNote===c.observedNote&&
  d.fullBoardReadbackMatches===true&&d.automaticallyRetryable===false&&
  pilotUuid(d.executionId)&&pilotUuid(d.requestId)&&
  Number.isFinite(Date.parse(d.checkedAt))&&Number.isFinite(Date.parse(d.createdAt))&&
  Date.parse(d.checkedAt)<=Date.parse(d.createdAt)+5000&&
  Date.parse(d.createdAt)-Date.parse(d.checkedAt)<=120000&&Date.parse(d.createdAt)<=now+5000,
  'V1: a megjegyzes eltereserol nincs ervenyes, jovahagyott egyeztetesi nyugta.');
 return d;
}
async function projectAcceptedNote(model,c,pair){
 // Rebuild only FUTURE expectations from a validated receipt; old expected hashes
 // remain in the immutable ahead/result and in the reconciliation's binding.
 for(let i=c.step;i<model.snapshots.length;i++){
  const snapshot=JSON.parse(model.snapshots[i]);
  snapshot.tasks.find(t=>t.id===c.taskId).note=c.observedNote;
  model.snapshots[i]=pilotFingerprint(snapshot);model.hashes[i]=await sha(model.snapshots[i]);
 }
 for(const t of model.targets.filter(t=>t.step>c.step)){
  t.sourceFingerprint=model.snapshots[t.step-1];t.sourceBoardSha256=model.hashes[t.step-1];
  t.expectedFingerprint=model.snapshots[t.step];t.expectedBoardSha256=model.hashes[t.step];
 }
 model.effectiveWorking.find(t=>t.id===c.taskId).note=c.observedNote;
 model.reconciliations.push({step:c.step,taskId:c.taskId,sha256:pair.receipt.sha256,
  approvedNote:c.approvedNote,observedNote:c.observedNote});
 model.finalFingerprint=model.snapshots.at(-1);model.finalBoardSha256=model.hashes.at(-1);
}
export async function inspectFullSyncEvidence(e,editorId,now=Date.now()){
 const model=await fullSyncModel(e,editorId,now);
 ok(Array.isArray(e.records)&&e.records.length<model.changedTaskCount&&e.final!==undefined,
  'V1 szinkron: hianyos vagy tulhosszu naplolista.');
 let verified=1,previous=e.result.receipt.sha256,blocked=false,recovery=null;
 const ledger=[previous];
 for(let i=0;i<e.records.length;i++){
  const r=e.records[i],t=model.targets[i+1];
  ok(!blocked&&r?.step===i+2&&r.ahead&&r.result!==undefined,'Hianyos, ritkas vagy arva V1 naplosor.');
  await validateStepAhead(r.ahead,t,previous,now);
  if(!r.result){ok(!r.reconciliation,'Eredmeny nelkuli egyeztetesi nyugta.');blocked=true;continue;}
  if(!await validateStepResult(r.result,r.ahead,t,now)){
   const candidate=await noteReconciliationCandidate(r,t);
   if(r.reconciliation){
    ok(candidate,'Nem megengedett V1 mezoelteres egyeztetese.');
    await validateNoteReconciliation(r.reconciliation,candidate,now);
    ok(Date.parse(r.reconciliation.document.checkedAt)>=Date.parse(r.result.document.checkedAt),
     'Az egyeztetes megelozi az eredeti eredmenyt.');
    await projectAcceptedNote(model,candidate,r.reconciliation);
    ledger.push(r.result.receipt.sha256);previous=r.reconciliation.receipt.sha256;
    ledger.push(previous);verified++;continue;
   }
   if(candidate){recovery=candidate;ledger.push(r.result.receipt.sha256);}
   blocked=true;continue;
  }
  ok(!r.reconciliation,'Sikeres feladathoz felesleges egyeztetesi nyugta.');
  previous=r.result.receipt.sha256;ledger.push(previous);verified++;
 }
 const ledgerSha256=await sha(stable(ledger)),complete=verified===model.changedTaskCount&&!blocked;
 if(e.final){
  const d=e.final.document;
  await checkPilotFile(d,e.final.receipt,'Sync-Status',FULL_FINAL);
  ok(complete&&matches(d,model.pilot)&&d.format==='mflow-v1-sync-final'&&d.status==='V1_SYNC_COMPLETED'&&
   d.verifiedTaskCount===model.changedTaskCount&&d.totalTaskCount===model.taskCount&&d.remainingTaskCount===0&&
   d.ledgerSha256===ledgerSha256&&d.lastResultSha256===previous&&
   d.boardReadbackSha256===model.finalBoardSha256&&d.fullBoardReadbackMatches===true&&
   d.automaticallyRetryable===false&&Number.isFinite(Date.parse(d.checkedAt))&&
   Date.parse(d.checkedAt)<=now+5000,'V1 szinkron: a zaronyugta nem igazolt.');
  if(model.reconciliations.length)ok(d.approvedExactMatch===false&&
   d.approvedFinalBoardSha256===model.approvedFinalBoardSha256&&
   stable(d.reconciliations)===stable(model.reconciliations),'A zaronyugtahoz hianyzik az elfogadott szovegelteres.');
 }
 return {status:recovery?'RECONCILIATION_AVAILABLE':blocked?'MANUAL_RECONCILIATION_REQUIRED':e.final?'V1_SYNC_COMPLETED':complete?'READY_TO_CLOSE':'READY_TO_SYNC',
  model,recovery,verifiedTaskCount:verified,remainingTaskCount:model.changedTaskCount-verified,
  expectedFingerprint:recovery?.observedFingerprint??model.snapshots[verified],
  expectedBoardSha256:recovery?.observedBoardSha256??model.hashes[verified],
  next:complete||blocked?null:model.targets[verified],previousResultSha256:previous,ledgerSha256};
}
export function requireFreshBoard(request,state,now=Date.now()){
 const at=Date.parse(request.boardVerifiedAt);
 ok(request.editorId===state.model.pilot.editorId&&
  request.expectedApprovedSha256===state.model.pilot.approvedSha256&&
  request.expectedCheckpointSha256===state.model.pilot.checkpointSha256&&
  request.ledgerSha256===state.ledgerSha256&&request.boardFingerprintSha256===state.expectedBoardSha256&&
  Number.isFinite(at)&&at<=now+5000&&now-at<=120000,
  'V1 szinkron: elavult vagy eltero board/naplo ellenorzes.');
}
