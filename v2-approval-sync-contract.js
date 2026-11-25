// Pure V2 approval/writeback contract, identical in both TEST applications.
// Historical V1 files are inputs only; no normalization or implicit replay.
import {PILOT_BOARD,PILOT_FIELDS,pilotAssert as ok,pilotStable as stable,
 pilotSha as sha,pilotFileSha,pilotUuid,pilotHex,pilotTask,pilotFingerprint,checkPilotFile} from './v1-pilot-contract.js';
import {inspectV2Report} from './v2-session-contract.js';
export const V2_FREEZE='session-v2-freeze.json';
export const V2_APPROVED='approved-v2.json';
export const V2_APPROVAL='session-v2-approved.json';
export const V2_FINAL='sync-v2-completed.json';
export const v2StepName=(n,kind)=>{
 ok(Number.isSafeInteger(n)&&n>=1&&n<=999999&&['ahead','result'].includes(kind),'Invalid V2 journal name.');
 return 'sync-v2-step-'+String(n).padStart(6,'0')+'-'+kind+'.json';
};
const clone=x=>structuredClone(x),same=(a,b)=>stable(a)===stable(b);
const time=(s,now)=>Number.isFinite(Date.parse(s))&&Date.parse(s)<=now+5000;
export function v2Common(m){return {schemaVersion:1,boardId:PILOT_BOARD,planVersion:2,
 sessionId:m.sessionId,revision:m.revision,editorId:m.editorId,createdBy:m.createdBy,
 microsoftEntraObjectId:m.microsoftEntraObjectId,sourceDraftSha256:m.sourceDraftSha256,
 claimSha256:m.claimSha256,closureSha256:m.closureSha256,completionV1Sha256:m.completionV1Sha256};}
const matches=(d,m)=>Object.entries(v2Common(m)).every(([k,v])=>same(d?.[k],v));
// Cache only fully validated immutable source models, keyed by ALL serialized
// source bytes and identities (including key order). Any change revalidates.
// Journal and live-board checks are never cached. Values are copied on both sides.
const verifiedModels=new Map();
export async function makeV2CycleModel(session,editorId,createdBy,now=Date.now()){
 const key=await sha(JSON.stringify([session,editorId,createdBy]));
 const old=verifiedModels.get(key);
 if(old&&now>=old.at)return clone(old.model);
 const model=await buildV2CycleModel(session,editorId,createdBy,now);
 if(verifiedModels.size>=4)verifiedModels.delete(verifiedModels.keys().next().value);
 verifiedModels.set(key,{at:now,model:clone(model)});return model;
}
async function buildV2CycleModel(session,editorId,createdBy,now){
 const checked=await inspectV2Report(session,editorId,createdBy,now);
 ok(checked.status==='V2_ACTIVE','Hianyzo vagy nem teljes V2 DRAFT-munkamenet.');
 const d=checked.latest.document,targets=[];let expected=clone(d.base),fieldCount=0;
 for(let i=0;i<d.working.length;i++){
  const before=d.base.tasks[i],after=d.working[i];
  const fields=Object.fromEntries(PILOT_FIELDS.filter(k=>!same(before[k],after[k])).map(k=>
   [k,{before:clone(before[k]??null),after:clone(after[k]??null)}]));
  if(!Object.keys(fields).length)continue;
  // A known lossy text representation must be corrected in the DRAFT, not
  // silently trimmed in an approved document or accepted after a write.
  if(fields.note)ok(typeof after.note==='string'&&!/ +$/.test(after.note),
   'A megjegyzes vegen szokoz van. Jovahagyas elott javitsd a V2 DRAFT-ban; nem vagjuk le automatikusan.');
  const sourceFingerprint=pilotFingerprint(expected);
  expected={...expected,tasks:expected.tasks.map(t=>t.id===after.id?clone(after):t)};
  const expectedFingerprint=pilotFingerprint(expected);
  targets.push({step:targets.length+1,taskId:after.id,taskName:after.name,before:clone(before),after:clone(after),
   fields,sourceFingerprint,expectedFingerprint,sourceBoardSha256:await sha(sourceFingerprint),
   expectedBoardSha256:await sha(expectedFingerprint),expectedItemSha256:await sha(stable(pilotTask(after)))});
  fieldCount+=Object.keys(fields).length;
 }
 const lineage=checked.model.lineage;
 return {sessionId:d.session.sessionId,revision:d.version,editorId,createdBy,
  microsoftEntraObjectId:lineage.microsoftEntraObjectId,sourceDraftSha256:checked.latest.receipt.sha256,
  claimSha256:session.claim.receipt.sha256,closureSha256:session.closure.receipt.sha256,
  completionV1Sha256:lineage.completionSha256,draft:d,draftReceipt:checked.latest.receipt,
  sourceFingerprint:d.source,sourceBoardSha256:await sha(d.source),finalFingerprint:pilotFingerprint(expected),
  finalBoardSha256:await sha(pilotFingerprint(expected)),targets,fieldCount,changedTaskCount:targets.length,
  taskCount:d.working.length,generationSha256:session.generationSha256,
  inheritedReconciliations:clone(lineage.reconciliations)};
}
export function makeV2Freeze(m,args){return {...v2Common(m),format:'mflow-v2-approval-freeze',status:'APPROVAL_FROZEN',
 draftName:m.draftReceipt.name,sourceGenerationSha256:m.generationSha256,sourceBoardSha256:m.sourceBoardSha256,
 finalBoardSha256:m.finalBoardSha256,changedTaskCount:m.changedTaskCount,fieldChangeCount:m.fieldCount,
 createdAt:args.createdAt,boardVerifiedAt:args.boardVerifiedAt,executionId:args.executionId,userConfirmed:true,
 mondayWrites:0,automaticallyRetryable:false};}
export async function validateV2Freeze(pair,m,now=Date.now()){
 await checkPilotFile(pair?.document,pair?.receipt,'Draft-Plans',V2_FREEZE);
 const d=pair.document;
 ok(matches(d,m)&&d.format==='mflow-v2-approval-freeze'&&d.status==='APPROVAL_FROZEN'&&
  d.draftName===m.draftReceipt.name&&d.sourceGenerationSha256===m.generationSha256&&
  d.sourceBoardSha256===m.sourceBoardSha256&&d.finalBoardSha256===m.finalBoardSha256&&
  d.changedTaskCount===m.changedTaskCount&&d.fieldChangeCount===m.fieldCount&&pilotUuid(d.executionId)&&
  d.userConfirmed===true&&d.mondayWrites===0&&d.automaticallyRetryable===false&&time(d.createdAt,now)&&
  Number.isFinite(Date.parse(d.boardVerifiedAt))&&Date.parse(d.boardVerifiedAt)<=Date.parse(d.createdAt)+5000&&
  Date.parse(d.createdAt)-Date.parse(d.boardVerifiedAt)<=120000,
  'A V2 jovahagyasi zarolas nem az ellenorzott utolso DRAFT-hoz tartozik.');return d;
}
export function makeV2Approved(m,freeze){return {schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',
 isApprovedPlan:true,mondaySyncAllowed:false,syncStatus:'NOT_STARTED',boardId:PILOT_BOARD,planVersion:2,
 draftVersion:m.revision,sourceFingerprint:m.sourceFingerprint,
 sourceDraft:{name:m.draftReceipt.name,id:m.draftReceipt.id,eTag:m.draftReceipt.eTag,sha256:m.sourceDraftSha256},
 lineage:clone(m.draft.session.lineage),closureSha256:m.closureSha256,claimSha256:m.claimSha256,
 finalization:{sessionId:m.sessionId,mondayEditorIdClaim:m.editorId,microsoftHomeAccountId:m.createdBy,
  microsoftEntraObjectId:m.microsoftEntraObjectId,freezeSha256:freeze.receipt.sha256,
  executionId:freeze.document.executionId,userConfirmed:true,createdAt:freeze.document.createdAt,
  boardVerifiedAt:freeze.document.boardVerifiedAt,boardFingerprintSha256:m.sourceBoardSha256},
 changedTaskCount:m.changedTaskCount,fieldChangeCount:m.fieldCount,totalTaskCount:m.taskCount,
 finalBoardSha256:m.finalBoardSha256,
 plan:{base:clone(m.draft.base),working:clone(m.draft.working),history:clone(m.draft.history),session:clone(m.draft.session)}};}
export function makeV2ApprovalReceipt(m,freeze,approved){return {...v2Common(m),format:'mflow-v2-approval-receipt',
 status:'APPROVED_PLAN_V2_STORED',approvedName:V2_APPROVED,approvedSha256:approved.receipt.sha256,
 approvedItemId:approved.receipt.id,approvedETag:approved.receipt.eTag,freezeSha256:freeze.receipt.sha256,
 approvedAt:freeze.document.createdAt,mondayWrites:0,automaticallyRetryable:false};}
export function v2SyncCommon(m,approval){return {...v2Common(m),approvedSha256:approval.approved.receipt.sha256,
 approvalReceiptSha256:approval.approval.receipt.sha256,freezeSha256:approval.freeze.receipt.sha256};}
export async function validateV2Ahead(pair,m,a,t,previousResultSha256,now=Date.now()){
 await checkPilotFile(pair?.document,pair?.receipt,'Sync-Status',v2StepName(t.step,'ahead'));
 const d=pair.document,c=v2SyncCommon(m,a);
 ok(Object.entries(c).every(([k,v])=>same(d[k],v))&&d.format==='mflow-v2-sync-ahead'&&d.status==='WRITE_AHEAD'&&
  d.step===t.step&&d.taskId===t.taskId&&d.taskName===t.taskName&&same(d.fields,t.fields)&&
  d.previousResultSha256===previousResultSha256&&d.sourceBoardSha256===t.sourceBoardSha256&&
  d.expectedBoardSha256===t.expectedBoardSha256&&pilotHex(d.mutationValuesSha256)&&pilotUuid(d.requestId)&&
  pilotUuid(d.executionId)&&d.maximumMutationAttempts===1&&d.automaticallyRetryable===false&&time(d.createdAt,now)&&
  Number.isFinite(Date.parse(d.boardVerifiedAt))&&Date.parse(d.boardVerifiedAt)<=Date.parse(d.createdAt)+5000&&
  Date.parse(d.createdAt)-Date.parse(d.boardVerifiedAt)<=120000,
  'Hibas vagy eltero V2 elonaplo; nincs iras.');return d;
}
export async function validateV2Result(pair,ahead,m,a,t,now=Date.now()){
 await checkPilotFile(pair?.document,pair?.receipt,'Sync-Status',v2StepName(t.step,'result'));
 const d=pair.document,h=ahead.document,c=v2SyncCommon(m,a);
 ok(Object.entries(c).every(([k,v])=>same(d[k],v))&&d.format==='mflow-v2-sync-result'&&
  ['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN','ABORTED_NO_WRITE'].includes(d.status)&&d.step===t.step&&d.taskId===t.taskId&&
  d.executionId===h.executionId&&d.requestId===h.requestId&&d.writeAheadSha256===ahead.receipt.sha256&&
  d.mutationValuesSha256===h.mutationValuesSha256&&[0,1].includes(d.mutationAttempts)&&
  typeof d.replyConfirmed==='boolean'&&typeof d.itemReadbackMatches==='boolean'&&typeof d.fullBoardReadbackMatches==='boolean'&&
  (d.itemReadbackSha256===null||pilotHex(d.itemReadbackSha256))&&(d.boardReadbackSha256===null||pilotHex(d.boardReadbackSha256))&&
  d.automaticallyRetryable===false&&time(d.checkedAt,now)&&Date.parse(d.checkedAt)>=Date.parse(h.createdAt),
  'Hibas V2 eredmenynaplo; nincs tovabblepes.');
 ok(d.itemReadbackMatches===(d.itemReadbackSha256===t.expectedItemSha256)&&
  d.fullBoardReadbackMatches===(d.boardReadbackSha256===t.expectedBoardSha256),'Ellentmondo V2 visszaolvasas.');
 if(d.status==='ITEM_READBACK_VERIFIED')ok(d.mutationAttempts===1&&d.replyConfirmed&&d.itemReadbackMatches&&
  d.fullBoardReadbackMatches&&d.error===null,'A V2 iras nem teljesen igazolt.');
 else ok(typeof d.error==='string'&&!!d.error&&
  (d.status==='ABORTED_NO_WRITE'?d.mutationAttempts===0:d.mutationAttempts===1),'Ellentmondo V2 hibas iras.');
 return d;
}
export async function v2CycleGeneration(r){return sha(stable([r.session.generationSha256,
 r.freeze?.receipt.sha256??null,r.approved?.receipt.sha256??null,r.approval?.receipt.sha256??null,
 r.records.map(x=>[x.step,x.ahead?.receipt.sha256??null,x.result?.receipt.sha256??null]),r.final?.receipt.sha256??null]));}
export async function inspectV2Cycle(r,editorId,createdBy,now=Date.now()){
 const m=await makeV2CycleModel(r.session,editorId,createdBy,now);
 ok(r.freeze!==undefined&&r.approved!==undefined&&r.approval!==undefined&&r.final!==undefined&&
  Array.isArray(r.records)&&r.records.length<=m.changedTaskCount,'Hianyos V2 jovahagyasi/szinkronallapot.');
 let status='DRAFT_READY',verified=0,previous=null,expected=m.sourceFingerprint;
 if(!r.freeze)ok(!r.approved&&!r.approval&&!r.records.length&&!r.final,'Arva V2 jovahagyasi vagy szinkronfajl.');
 else{
  await validateV2Freeze(r.freeze,m,now);status='APPROVAL_INCOMPLETE';
  if(!r.approved)ok(!r.approval&&!r.records.length&&!r.final,'Hianyzik az Approved V2.');
  else{
   await checkPilotFile(r.approved.document,r.approved.receipt,'Approved-Plans',V2_APPROVED);
   ok(same(r.approved.document,makeV2Approved(m,r.freeze)),'Az Approved V2 elter a zarolt DRAFT-tol.');
   if(!r.approval)ok(!r.records.length&&!r.final,'Hianyzik a V2 jovahagyasi nyugta.');
   else{
    await checkPilotFile(r.approval.document,r.approval.receipt,'Draft-Plans',V2_APPROVAL);
    ok(same(r.approval.document,makeV2ApprovalReceipt(m,r.freeze,r.approved)),'Hibas V2 jovahagyasi nyugta.');
    previous=r.approval.receipt.sha256;status=m.changedTaskCount?'READY_TO_SYNC':'READY_TO_CLOSE';
    for(let i=0;i<r.records.length;i++){
     const row=r.records[i],t=m.targets[i];
     ok(row?.step===i+1&&row.ahead&&row.result!==undefined,'Hianyos vagy nem folytonos V2 naplosor.');
     await validateV2Ahead(row.ahead,m,r,t,previous,now);
     if(!row.result){ok(i===r.records.length-1&&!r.final,'Naplo bizonytalan lepes utan.');status='MANUAL_REVIEW_REQUIRED';break;}
     const d=await validateV2Result(row.result,row.ahead,m,r,t,now);
     if(d.status!=='ITEM_READBACK_VERIFIED'){
      ok(i===r.records.length-1&&!r.final,'Naplo nem igazolt lepes utan.');status='MANUAL_REVIEW_REQUIRED';break;
     }
     verified++;previous=row.result.receipt.sha256;expected=t.expectedFingerprint;
    }
    if(status!=='MANUAL_REVIEW_REQUIRED')status=verified===m.changedTaskCount?'READY_TO_CLOSE':'READY_TO_SYNC';
   }
  }
 }
 const ledgerSha256=await sha(stable([r.approval?.receipt.sha256??null,
  r.records.map(x=>[x.step,x.ahead?.receipt.sha256??null,x.result?.receipt.sha256??null])]));
 const state={model:m,status,verifiedTaskCount:verified,remainingTaskCount:m.changedTaskCount-verified,
  expectedFingerprint:expected,expectedBoardSha256:await sha(expected),previousResultSha256:previous,
  ledgerSha256,next:m.targets[verified]||null,generationSha256:await v2CycleGeneration(r)};
 if(r.final){
  ok(status==='READY_TO_CLOSE','V2 zaronyugta nem teljes naplosor utan.');
  await checkPilotFile(r.final.document,r.final.receipt,'Sync-Status',V2_FINAL);
  const d=r.final.document,c=v2SyncCommon(m,r);
  ok(Object.entries(c).every(([k,v])=>same(d[k],v))&&d.format==='mflow-v2-sync-final'&&d.status==='V2_SYNC_COMPLETED'&&
   d.verifiedTaskCount===m.changedTaskCount&&d.totalTaskCount===m.taskCount&&d.remainingTaskCount===0&&
   d.ledgerSha256===ledgerSha256&&d.lastResultSha256===previous&&d.boardReadbackSha256===m.finalBoardSha256&&
   d.fullBoardReadbackMatches===true&&d.approvedExactMatch===true&&same(d.inheritedReconciliations,m.inheritedReconciliations)&&
   d.automaticallyRetryable===false&&time(d.createdAt,now)&&Number.isFinite(Date.parse(d.checkedAt))&&
   Date.parse(d.checkedAt)<=Date.parse(d.createdAt)+5000&&Date.parse(d.createdAt)-Date.parse(d.checkedAt)<=120000,
   'A V2 zaronyugta nem a teljesen igazolt vegallapotot rogziti.');state.status='V2_SYNC_COMPLETED';
 }
 return state;
}
export function requireV2CycleBoard(args,state,now=Date.now()){
 const m=state.model,at=Date.parse(args.boardVerifiedAt);
 ok(args.editorId===m.editorId&&args.createdBy===m.createdBy&&args.expectedV2SessionId===m.sessionId&&
  args.expectedV2Revision===m.revision&&args.expectedDraftSha256===m.sourceDraftSha256&&
  args.generationSha256===state.generationSha256&&args.boardFingerprintSha256===state.expectedBoardSha256&&
  Number.isFinite(at)&&at<=now+5000&&now-at<=120000,'Elavult vagy eltero V2 board-bizonyitek.');
}
