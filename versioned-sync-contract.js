// Immutable V3+ sync journal and full-board completion contract. Shared source.
// No Graph or Monday side effects. V4 use requires independently verified source.
import {PILOT_BOARD,pilotAssert as ok,pilotStable as stable,
 pilotSha as sha,pilotHex,pilotUuid} from './v1-pilot-contract.js';
import {isVersionedPlan,completedSyncStatus} from './versioned-cycle-version.js';
import {checkVersionedApprovalFile,inspectVersionedApprovalState,
 versionedApprovalCommon} from './versioned-approval-core.js';

const eq=(a,b)=>stable(a)===stable(b);
const clone=x=>structuredClone(x);
const when=(s,now)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&
 Date.parse(s)<=now+5000;
const recent=(s,now)=>when(s,now)&&now-Date.parse(s)<=120000;
const common=(m,a)=>({...versionedApprovalCommon(m),
 approvedSha256:a.approved.receipt.sha256,
 approvalReceiptSha256:a.approval.receipt.sha256,
 freezeSha256:a.freeze.receipt.sha256});
const matches=(doc,fields)=>Object.entries(fields).every(([k,v])=>eq(doc?.[k],v));

export function requireVersionedSyncBoard(args,state,now=Date.now()){
 const m=state?.model;
 ok(m?.boardId===PILOT_BOARD&&isVersionedPlan(m.version)&&
  args?.editorId===m.editorId&&args.createdBy===m.createdBy&&
  args.expectedSessionId===m.sessionId&&args.expectedRevision===m.revision&&
  args.expectedDraftSha256===m.sourceDraftSha256&&
  args.expectedApprovedSha256===state.approvedSha256&&
  args.expectedApprovalReceiptSha256===state.approvalReceiptSha256&&
  args.expectedGenerationSha256===state.generationSha256&&
  args.boardFingerprintSha256===state.expectedBoardSha256&&
  recent(args.boardVerifiedAt,now),
  'V3 szinkron: elavult session, tervezet, Approved, naplo vagy board proof.');
}
export function versionedSyncCommon(m,approval){
 ok(isVersionedPlan(m?.version)&&approval?.approved?.receipt&&
    approval?.freeze?.receipt&&approval?.approval?.receipt,
  'Hianyzo V3 Approved Plan-bizonyitek.');
 return common(m,approval);
}
export async function validateVersionedSyncAhead(pair,m,approval,t,previous,now=Date.now()){
 await checkVersionedApprovalFile(pair,m.boardId,m.version,'sync',m.names.ahead(t.step));
 const d=pair.document,base=versionedSyncCommon(m,approval);
 ok(matches(d,base)&&d.format==='mflow-versioned-sync-ahead'&&
  d.status==='WRITE_AHEAD'&&d.step===t.step&&d.taskId===t.taskId&&
  d.taskName===t.taskName&&eq(d.fields,t.fields)&&
  d.previousResultSha256===previous&&
  d.sourceBoardSha256===t.sourceBoardSha256&&
  d.expectedBoardSha256===t.expectedBoardSha256&&
  pilotHex(d.mutationValuesSha256)&&pilotUuid(d.executionId)&&pilotUuid(d.requestId)&&
  d.maximumMutationAttempts===1&&d.automaticallyRetryable===false&&
  recent(d.boardVerifiedAt,Date.parse(d.createdAt))&&when(d.createdAt,now),
  'V3 szinkron: ervenytelen vagy serult feladat-elojegyzes.');
 return d;
}
export async function validateVersionedSyncResult(pair,ahead,m,approval,t,now=Date.now()){
 await checkVersionedApprovalFile(pair,m.boardId,m.version,'sync',m.names.result(t.step));
 const d=pair.document,a=ahead.document,base=versionedSyncCommon(m,approval);
 ok(matches(d,base)&&d.format==='mflow-versioned-sync-result'&&
  ['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN','ABORTED_NO_WRITE'].includes(d.status)&&
  d.step===t.step&&d.taskId===t.taskId&&d.executionId===a.executionId&&
  d.requestId===a.requestId&&d.writeAheadSha256===ahead.receipt.sha256&&
  d.mutationValuesSha256===a.mutationValuesSha256&&
  [0,1].includes(d.mutationAttempts)&&typeof d.replyConfirmed==='boolean'&&
  typeof d.itemReadbackMatches==='boolean'&&
  typeof d.fullBoardReadbackMatches==='boolean'&&
  (d.itemReadbackSha256===null||pilotHex(d.itemReadbackSha256))&&
  (d.boardReadbackSha256===null||pilotHex(d.boardReadbackSha256))&&
  d.automaticallyRetryable===false&&when(d.checkedAt,now)&&
  Date.parse(d.checkedAt)>=Date.parse(a.createdAt),
  'V3 szinkron: ervenytelen eredmenynaplo.');
 ok(d.itemReadbackMatches===(d.itemReadbackSha256===t.expectedItemSha256)&&
   d.fullBoardReadbackMatches===(d.boardReadbackSha256===t.expectedBoardSha256),
  'V3 szinkron: ellentmondo feladat/board visszaolvasas.');
 if(d.status==='ITEM_READBACK_VERIFIED')
  ok(d.mutationAttempts===1&&d.replyConfirmed===true&&
   d.itemReadbackMatches&&d.fullBoardReadbackMatches&&d.error===null,
   'V3 szinkron: a feladat nincs teljesen visszaellenorizve.');
 else ok(typeof d.error==='string'&&d.error.length>0&&
   (d.status==='ABORTED_NO_WRITE'?d.mutationAttempts===0:
    d.mutationAttempts===1),
   'V3 szinkron: bizonytalan eredmeny ellentmondasos.');
 return d;
}
export async function versionedSyncGeneration(report){
 return sha(stable([report.model.generationSha256,
  report.freeze?.receipt.sha256||null,
  report.approved?.receipt.sha256||null,
  report.approval?.receipt.sha256||null,
  report.records.map(r=>[r.step,r.ahead?.receipt.sha256||null,
   r.result?.receipt.sha256||null]),
  report.final?.receipt.sha256||null]));
}
export async function inspectVersionedSyncCycle(report,now=Date.now()){
 const {model:m,freeze,approved,approval,records,final}=report||{};
 ok(isVersionedPlan(m?.version)&&m.boardId===PILOT_BOARD&&
  Array.isArray(records)&&records.length<=m.changedTaskCount&&
  final!==undefined&&freeze!==undefined&&approved!==undefined&&approval!==undefined,
  'A V3 teljes szinkronnaplo nem vizsgalhato.');
 const a={freeze,approved,approval};
 const approvalState=await inspectVersionedApprovalState({model:m,...a},now);
 ok(['READY_TO_SYNC','READY_TO_CLOSE'].includes(approvalState.status),
  'A V3 Approved Plan meg nem teljes.');
 let verified=0,previous=approval.receipt.sha256,
  expectedBoardSha256=m.sourceBoardSha256,
  status=m.changedTaskCount?'READY_TO_SYNC':'READY_TO_CLOSE';
 for(let i=0;i<records.length;i++){
  const row=records[i],t=m.targets[i];
  ok(row?.step===i+1&&row.ahead&&row.result!==undefined,
   'Hianyzo vagy nem folyamatos V3 naplosor.');
  await validateVersionedSyncAhead(row.ahead,m,a,t,previous,now);
  if(!row.result){
   ok(i===records.length-1&&!final,
    'Hianyos V3 elonaplo utan tovabbi iras vagy zaras.');
   status='MANUAL_REVIEW_REQUIRED';break;
  }
  const result=await validateVersionedSyncResult(row.result,row.ahead,m,a,t,now);
  if(result.status!=='ITEM_READBACK_VERIFIED'){
   ok(i===records.length-1&&!final,
    'Nem igazolt V3 feladat utan tovabbi iras vagy zaras.');
   status='MANUAL_REVIEW_REQUIRED';break;
  }
  verified++;previous=row.result.receipt.sha256;
  expectedBoardSha256=t.expectedBoardSha256;
 }
 if(status!=='MANUAL_REVIEW_REQUIRED')
  status=verified===m.changedTaskCount?'READY_TO_CLOSE':'READY_TO_SYNC';
 const ledgerSha256=await sha(stable([approval.receipt.sha256,
  records.map(r=>[r.step,r.ahead?.receipt.sha256||null,
   r.result?.receipt.sha256||null])]));
 const state={model:m,status,verifiedTaskCount:verified,
  remainingTaskCount:m.changedTaskCount-verified,
  expectedBoardSha256,previousResultSha256:previous,
  ledgerSha256,next:m.targets[verified]||null,
  approvedSha256:approved.receipt.sha256,
  approvalReceiptSha256:approval.receipt.sha256,
  generationSha256:await versionedSyncGeneration(report)};
 if(final){
  ok(status==='READY_TO_CLOSE','V3 lezaro nyugta nem teljes naplo utan.');
  await checkVersionedApprovalFile(final,m.boardId,m.version,'sync',m.names.completed);
  const d=final.document;
  ok(matches(d,common(m,a))&&
   d.format==='mflow-versioned-sync-final'&&d.status===completedSyncStatus(m.version)&&
   d.verifiedTaskCount===m.changedTaskCount&&
   d.totalTaskCount===m.taskCount&&d.remainingTaskCount===0&&
   d.ledgerSha256===ledgerSha256&&d.lastResultSha256===previous&&
   d.boardReadbackSha256===m.finalBoardSha256&&
   d.fullBoardReadbackMatches===true&&d.approvedExactMatch===true&&
   d.automaticallyRetryable===false&&when(d.createdAt,now)&&
   recent(d.checkedAt,Date.parse(d.createdAt)),
   'A V3 lezaro nyugta nem bizonyit teljes Monday-board szinkront.');
  state.status=completedSyncStatus(m.version);
 }
 return state;
}
export function makeVersionedSyncAhead(m,approval,state,args,now=Date.now()){
 requireVersionedSyncBoard(args,state,now);
 const t=state.next;
 ok(state.status==='READY_TO_SYNC'&&t&&args.step===t.step&&
  args.taskId===t.taskId&&pilotHex(args.mutationValuesSha256)&&
  pilotUuid(args.executionId)&&pilotUuid(args.requestId),
  'Hianyzo V3 feladat vagy elonaplo-engedely.');
 return {...versionedSyncCommon(m,approval),format:'mflow-versioned-sync-ahead',
  status:'WRITE_AHEAD',step:t.step,taskId:t.taskId,taskName:t.taskName,
  fields:clone(t.fields),executionId:args.executionId,requestId:args.requestId,
  previousResultSha256:state.previousResultSha256,
  mutationValuesSha256:args.mutationValuesSha256,
  sourceBoardSha256:t.sourceBoardSha256,expectedBoardSha256:t.expectedBoardSha256,
  boardVerifiedAt:args.boardVerifiedAt,createdAt:new Date(now).toISOString(),
  maximumMutationAttempts:1,automaticallyRetryable:false};
}
export function makeVersionedSyncFinal(m,approval,state,args,now=Date.now()){
 requireVersionedSyncBoard(args,state,now);
 ok(state.status==='READY_TO_CLOSE'&&state.remainingTaskCount===0&&
  state.expectedBoardSha256===m.finalBoardSha256,
  'A V3 sync veglegesitese elott hianyzik a teljes board bizonyitek.');
 return {...versionedSyncCommon(m,approval),format:'mflow-versioned-sync-final',
  status:completedSyncStatus(m.version),verifiedTaskCount:m.changedTaskCount,
  totalTaskCount:m.taskCount,remainingTaskCount:0,ledgerSha256:state.ledgerSha256,
  lastResultSha256:state.previousResultSha256,
  boardReadbackSha256:m.finalBoardSha256,fullBoardReadbackMatches:true,
  approvedExactMatch:true,checkedAt:args.boardVerifiedAt,
  createdAt:new Date(now).toISOString(),automaticallyRetryable:false};
}
