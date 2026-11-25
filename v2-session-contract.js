// Shared, side-effect-free V1 closure / V2 DRAFT contract. No global normalization.
import {PILOT_BOARD,PILOT_FIELDS,pilotAssert as ok,pilotStable as stable,
 pilotSha as sha,pilotUuid,pilotHex,pilotFingerprint,pilotTask,checkPilotFile} from './v1-pilot-contract.js';
import {inspectFullSyncEvidence} from './v1-full-sync-contract.js';
export const V1_CLOSED='session-v1-closed.json';
export const V2_ACTIVE='active-session-v2.json';
export const V2_BASELINE='draft-v2.json';
export const v2RevisionName=n=>{
 ok(Number.isSafeInteger(n)&&n>=0&&n<=999999,'Invalid V2 revision.');
 return n?'draft-v2-r'+String(n).padStart(6,'0')+'.json':V2_BASELINE;
};
const clone=x=>structuredClone(x);
const same=(a,b)=>stable(a)===stable(b);
const instant=(value,now)=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+5000;
export async function v2Source(evidence,oldClaim,editorId,createdBy,now=Date.now()){
 const state=await inspectFullSyncEvidence(evidence,editorId,now);
 ok(state.status==='V1_SYNC_COMPLETED'&&state.remainingTaskCount===0,
  'A V2 csak teljesen lezart es igazolt V1 szinkronbol indulhat.');
 await checkPilotFile(oldClaim?.document,oldClaim?.receipt,'Draft-Plans','active-session.json');
 const old=oldClaim.document,t=state.model.pilot;
 ok(old.schemaVersion===1&&old.format==='mflow-single-draft-session'&&old.status==='ACTIVE'&&
  old.planVersion===1&&old.boardId===PILOT_BOARD&&old.sessionId===t.sessionId&&
  old.baselineFile==='draft-v1.json'&&old.createdBy===createdBy&&createdBy===evidence.checkpoint.createdBy&&
  pilotHex(old.approvedV0Sha256)&&old.mondayWrites===0,
  'A V1 munkamenet-foglalas vagy a felhasznalo nem egyezik.');
 const base={...clone(evidence.approvedPlan.plan.base),tasks:clone(state.model.effectiveWorking)};
 const source=pilotFingerprint(base),final=evidence.final.document;
 ok(source===state.model.finalFingerprint&&await sha(source)===final.boardReadbackSha256,
  'A V2 bazisa nem a lezart V1 tenyleges vegallapota.');
 const lineage={sourcePlanVersion:1,targetPlanVersion:2,sourceSessionId:t.sessionId,
  sourceRevision:t.revision,editorId,createdBy,microsoftEntraObjectId:t.microsoftEntraObjectId,
  approvedV1Sha256:evidence.receipt.sha256,completionSha256:evidence.final.receipt.sha256,
  sourceClaimSha256:oldClaim.receipt.sha256,effectiveBoardSha256:final.boardReadbackSha256,
  approvedFinalBoardSha256:state.model.approvedFinalBoardSha256,
  approvedExactMatch:state.model.reconciliations.length===0,reconciliations:clone(state.model.reconciliations)};
 return {base,source,lineage,completedAt:final.createdAt,taskCount:base.tasks.length};
}
export function requireV2Board(args,model,now=Date.now()){
 const at=Date.parse(args.boardVerifiedAt);
 ok(args.editorId===model.lineage.editorId&&args.createdBy===model.lineage.createdBy&&
  args.expectedApprovedSha256===model.lineage.approvedV1Sha256&&
  args.completionSha256===model.lineage.completionSha256&&
  args.boardFingerprintSha256===model.lineage.effectiveBoardSha256&&
  Number.isFinite(at)&&at<=now+5000&&now-at<=120000,
  'A V2 inditasahoz friss, teljes es egyezo Monday-board ellenorzes szukseges.');
}
export function makeV1Closure(model,{createdAt,boardVerifiedAt}){
 return {schemaVersion:1,format:'mflow-planning-session-closure',status:'CLOSED',
  boardId:PILOT_BOARD,planVersion:1,sessionId:model.lineage.sourceSessionId,
  finalRevision:model.lineage.sourceRevision,lineage:clone(model.lineage),
  closedBy:model.lineage.createdBy,createdAt,boardVerifiedAt,
  mondayWrites:0,draftFilesDeleted:0,automaticallyRetryable:false};
}
export async function validateV1Closure(pair,model,now=Date.now()){
 await checkPilotFile(pair?.document,pair?.receipt,'Draft-Plans',V1_CLOSED);
 const d=pair.document;
 ok(d.schemaVersion===1&&d.format==='mflow-planning-session-closure'&&d.status==='CLOSED'&&
  d.boardId===PILOT_BOARD&&d.planVersion===1&&d.sessionId===model.lineage.sourceSessionId&&
  d.finalRevision===model.lineage.sourceRevision&&same(d.lineage,model.lineage)&&
  d.closedBy===model.lineage.createdBy&&instant(d.createdAt,now)&&
  Date.parse(d.createdAt)>=Date.parse(model.completedAt)&&
  Number.isFinite(Date.parse(d.boardVerifiedAt))&&
  Date.parse(d.boardVerifiedAt)<=Date.parse(d.createdAt)+5000&&
  Date.parse(d.createdAt)-Date.parse(d.boardVerifiedAt)<=120000&&
  d.mondayWrites===0&&d.draftFilesDeleted===0&&d.automaticallyRetryable===false,
  'A V1 munkamenet lezaro nyugtaja ervenytelen.');
 return d;
}
export function makeV2Claim(model,closure,{sessionId,createdAt}){
 ok(pilotUuid(sessionId)&&sessionId!==model.lineage.sourceSessionId,'Invalid new V2 session ID.');
 return {schemaVersion:1,format:'mflow-single-draft-session-v2',status:'ACTIVE',
  boardId:PILOT_BOARD,planVersion:2,sessionId,baselineFile:V2_BASELINE,
  lineage:clone(model.lineage),closureSha256:closure.receipt.sha256,
  createdBy:model.lineage.createdBy,createdAt,mondayWrites:0};
}
export async function validateV2Claim(pair,model,closure,now=Date.now()){
 await checkPilotFile(pair?.document,pair?.receipt,'Draft-Plans',V2_ACTIVE);
 const d=pair.document;
 ok(d.schemaVersion===1&&d.format==='mflow-single-draft-session-v2'&&d.status==='ACTIVE'&&
  d.boardId===PILOT_BOARD&&d.planVersion===2&&pilotUuid(d.sessionId)&&
  d.sessionId!==model.lineage.sourceSessionId&&d.baselineFile===V2_BASELINE&&
  same(d.lineage,model.lineage)&&d.closureSha256===closure.receipt.sha256&&
  d.createdBy===model.lineage.createdBy&&instant(d.createdAt,now)&&
  Date.parse(d.createdAt)>=Date.parse(closure.document.createdAt)&&d.mondayWrites===0,
  'A V2 foglalasa nem a lezart V1 munkamenethez tartozik.');
 return d;
}
function sessionFor(claim,revision,parentSha256){return {sessionId:claim.sessionId,planVersion:2,
 revision,lineage:clone(claim.lineage),closureSha256:claim.closureSha256,parentSha256};}
export function makeV2Baseline(model,claim){
 return {schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,
  boardId:PILOT_BOARD,source:model.source,version:0,base:clone(model.base),
  working:clone(model.base.tasks),history:[],session:sessionFor(claim,0,null)};
}
export function validateV2Draft(d,model,claim,revision,parentSha256){
 ok(d?.schemaVersion===1&&d.format==='flow-lps-draft'&&d.status==='DRAFT'&&d.isApprovedPlan===false&&
  d.boardId===PILOT_BOARD&&d.source===model.source&&same(d.base,model.base)&&
  d.version===revision&&Array.isArray(d.history)&&d.history.length===revision&&
  d.history.every((h,i)=>h?.revision===i+1&&['edit','weekly','obstacle','recalculate'].includes(h.type)&&Number.isFinite(Date.parse(h.at)))&&
  same(d.session,sessionFor(claim,revision,parentSha256))&&Array.isArray(d.working)&&
  same(d.working.map(t=>t.id),model.base.tasks.map(t=>t.id)),
  'A V2 DRAFT forrasa, munkamenete vagy reviziolanca elter.');
 const frozen=t=>Object.fromEntries(Object.entries(pilotTask(t)).filter(([k])=>!PILOT_FIELDS.includes(k)));
 for(let i=0;i<d.working.length;i++)ok(same(frozen(d.working[i]),frozen(model.base.tasks[i])),
  'A V2 DRAFT vedett feladatmezot modositott.');
 if(revision===0)ok(same(d.working,model.base.tasks),'A V2 kiindulo DRAFT mar modositott.');
 return d;
}
export function makeNextV2Draft(previous,updated,model,claim,parentSha256){
 ok(pilotHex(parentSha256)&&updated?.version===previous.version+1&&
  same(updated.base,previous.base)&&updated.source===previous.source&&
  same(updated.session,previous.session)&&same(updated.history?.slice(0,-1),previous.history),
  'A V2 modositas nem a legutolso igazolt allapot folytatasa.');
 const draft=clone(updated);draft.session=sessionFor(claim,draft.version,parentSha256);
 validateV2Draft(draft,model,claim,draft.version,parentSha256);return draft;
}
export async function inspectV2Artifacts(bundle,model,now=Date.now()){
 const {closure,claim,baseline,revisions}=bundle;
 ok(closure!==undefined&&claim!==undefined&&baseline!==undefined&&Array.isArray(revisions)&&revisions.length<=1000,
  'Hianyos V2 munkamenet-visszaellenorzes.');
 if(!closure){ok(!claim&&!baseline&&!revisions.length,'Lezart V1 nelkuli arva V2 fajlok.');
  return {status:'V2_READY_TO_START',latest:null,revision:0};}
 await validateV1Closure(closure,model,now);
 if(!claim){ok(!baseline&&!revisions.length,'V2 foglalas nelkuli DRAFT fajlok.');
  return {status:'V2_READY_TO_START',latest:null,revision:0};}
 await validateV2Claim(claim,model,closure,now);
 if(!baseline){ok(!revisions.length,'Hianyzo V2 kiindulo DRAFT; arva reviziok.');
  return {status:'V2_START_INCOMPLETE',latest:null,revision:0};}
 await checkPilotFile(baseline.document,baseline.receipt,'Draft-Plans',V2_BASELINE);
 validateV2Draft(baseline.document,model,claim.document,0,null);
 let last=baseline;
 for(let i=0;i<revisions.length;i++){
  const r=revisions[i],rev=i+1;
  await checkPilotFile(r?.document,r?.receipt,'Draft-Plans',v2RevisionName(rev));
  validateV2Draft(r.document,model,claim.document,rev,last.receipt.sha256);
  ok(same(r.document.history.slice(0,-1),last.document.history),'A V2 parancselozmeny megvaltozott.');last=r;
 }
 return {status:'V2_ACTIVE',latest:last,revision:last.document.version};
}
export async function v2Generation(bundle){return sha(stable([
 bundle.oldClaim?.receipt.sha256,bundle.evidence?.final?.receipt.sha256,
 bundle.closure?.receipt.sha256??null,bundle.claim?.receipt.sha256??null,
 bundle.baseline?.receipt.sha256??null,(bundle.revisions||[]).map(r=>r.receipt.sha256)]));}
export async function inspectV2Report(report,editorId,createdBy,now=Date.now()){
 const model=await v2Source(report.evidence,report.oldClaim,editorId,createdBy,now);
 const state=await inspectV2Artifacts(report,model,now);
 ok(report.status===state.status&&report.generationSha256===await v2Generation(report),
  'A V2 osszesito es a visszaolvasott allapot elter.');
 return {model,...state};
}
