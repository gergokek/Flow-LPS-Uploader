// Shared successor artifacts for isolated TEST; V2 is the historical root.
// The Vn lineage inspector rebuilds all later predecessors from raw evidence.
// Versioned V3+ SharePoint paths are derived, never submitted by the browser.
import {PILOT_BOARD,PILOT_FIELDS,pilotAssert as ok,pilotStable as stable,
 pilotSha as sha,pilotFileSha,pilotUuid,pilotHex,pilotTask,pilotFingerprint}
 from './v1-pilot-contract.js';
import {inspectV2Cycle} from './v2-approval-sync-contract.js';
import {isVersionedPlan} from './versioned-cycle-version.js';
import {versionLayout,draftFileName,lifecycleFileName,makeVersionInfo}
 from './version-workspace-layout.js';

const same=(a,b)=>stable(a)===stable(b),clone=x=>structuredClone(x);
const validDate=(s,now)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&
 Date.parse(s)<=now+5000;
function receipt(pair,folder,name){
 const r=pair?.receipt,d=pair?.document;
 ok(d&&r&&r.name===name&&typeof r.id==='string'&&!!r.id&&
  typeof r.eTag==='string'&&!!r.eTag&&pilotHex(r.sha256)&&
  r.path===folder+'/'+name&&r.verification==='content-sha256-and-etag',
  'Hibas vagy eltero SharePoint utvonal/nyugta.');
 return pilotFileSha(d).then(hash=>ok(hash===r.sha256,
  'A SharePoint fajl tartalmi lenyomata elter.'));
}
export function successorNames(version){
 const layout=versionLayout(PILOT_BOARD,version);
 ok(!layout.legacy,'The legacy version must keep its historical storage.');
 return {layout,manifest:'version-info.json',claim:lifecycleFileName(version,'claim'),
  baseline:draftFileName(version),closure:lifecycleFileName(version,'closure')};
}
export async function inspectLegacyV2Predecessor({predecessor,version,editorId,createdBy,now=Date.now()}){
 ok(version===3,'V4+ elozo ciklus teljes ellenorzese meg nincs bekotve.');
 const checked=await inspectV2Cycle(predecessor,editorId,createdBy,now);
 ok(checked.status==='V2_SYNC_COMPLETED'&&checked.remainingTaskCount===0&&
  checked.model.draft.session.planVersion===2,
  'V3 csak teljesen lezart, visszaellenorzott V2 szinkronbol indulhat.');
 const m=checked.model,final=predecessor.final,approved=predecessor.approved,
  claim=predecessor.session.claim;
 ok(approved?.receipt&&final?.receipt&&claim?.receipt&&
  pilotHex(approved.receipt.sha256)&&pilotHex(final.receipt.sha256)&&
  pilotUuid(m.sessionId)&&final.document.boardReadbackSha256===m.finalBoardSha256,
  'Hianyzo V2 vegallapot-bizonyitek.');
 const base=clone(m.draft.base);
 base.tasks=clone(m.draft.working);
 ok(pilotFingerprint(base)===m.finalFingerprint&&
  base.tasks.length===m.taskCount,
  'A V3 kiindulasa nem az igazolt V2 board-vegallapot.');
 const source={planVersion:2,sessionId:m.sessionId,revision:m.revision,
  approvedSha256:approved.receipt.sha256,completionSha256:final.receipt.sha256,
  completionBoardSha256:m.finalBoardSha256,sourceClaimSha256:claim.receipt.sha256};
 return {version,boardId:PILOT_BOARD,base,source,
  fingerprint:pilotFingerprint(base),editorId,createdBy,
  taskCount:base.tasks.length,completedAt:final.document.createdAt};
}
export function makeSuccessorClaim(model,{sessionId,createdAt}){
 ok(isVersionedPlan(model?.version)&&model.boardId===PILOT_BOARD&&
  model.source?.planVersion===model.version-1&&pilotUuid(sessionId)&&sessionId!==model.source.sessionId&&
  validDate(createdAt,Date.now()),'Hibas V3 munkamenet-foglalas.');
 return {schemaVersion:1,format:'mflow-versioned-session',status:'ACTIVE',
  boardId:PILOT_BOARD,planVersion:model.version,sessionId,
  baselineFile:draftFileName(model.version),source:clone(model.source),
  sourceFingerprint:model.fingerprint,createdBy:model.createdBy,
  editorId:model.editorId,createdAt,mondayWrites:0};
}
export function makeSuccessorManifest(model,claim){
 return {...makeVersionInfo({boardId:PILOT_BOARD,version:model.version,
   sessionId:claim.sessionId,source:{planVersion:model.source.planVersion,
     completionSha256:model.source.completionSha256},createdAt:claim.createdAt}),
  approvedPredecessorSha256:model.source.approvedSha256,
  predecessorBoardSha256:model.source.completionBoardSha256,
  predecessorSessionId:model.source.sessionId,createdBy:model.createdBy,
  editorId:model.editorId};
}
function sessionFor(model,claim,revision,parentSha256){
 return {sessionId:claim.sessionId,planVersion:model.version,revision,
  source:clone(model.source),sourceFingerprint:model.fingerprint,parentSha256};
}
export function makeSuccessorBaseline(model,claim){
 return {schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',isApprovedPlan:false,
  boardId:PILOT_BOARD,source:model.fingerprint,version:0,base:clone(model.base),
  working:clone(model.base.tasks),history:[],session:sessionFor(model,claim,0,null)};
}
export function validateSuccessorDraft(d,model,claim,revision,parentSha256){
 ok(d?.schemaVersion===1&&d.format==='flow-lps-draft'&&d.status==='DRAFT'&&
  d.isApprovedPlan===false&&d.boardId===PILOT_BOARD&&d.source===model.fingerprint&&
  same(d.base,model.base)&&d.version===revision&&
  same(d.session,sessionFor(model,claim,revision,parentSha256))&&
  Array.isArray(d.history)&&d.history.length===revision&&
  d.history.every((h,i)=>h?.revision===i+1&&
   ['edit','weekly','obstacle','recalculate'].includes(h.type)&&
   Number.isFinite(Date.parse(h.at)))&&Array.isArray(d.working)&&
  same(d.working.map(t=>t.id),model.base.tasks.map(t=>t.id)),
  'A V3 DRAFT forras-, munkamenet- vagy reviziolanca elter.');
 const frozen=t=>Object.fromEntries(Object.entries(pilotTask(t)).
  filter(([k])=>!PILOT_FIELDS.includes(k)));
 for(let i=0;i<d.working.length;i++){
  ok(same(frozen(d.working[i]),frozen(model.base.tasks[i])),
   'A V3 DRAFT vedett feladatmezot modositott.');
 }
 if(revision===0)ok(same(d.working,model.base.tasks),
  'A V3 kiindulo DRAFT modositott.');
 return d;
}
export function makeNextSuccessorDraft(previous,updated,model,claim,parentSha256){
 ok(pilotHex(parentSha256)&&updated?.version===previous.version+1&&
  same(updated.base,previous.base)&&updated.source===previous.source&&
  same(updated.session,previous.session)&&same(updated.history?.slice(0,-1),previous.history),
  'A V3 mentese nem az utolso visszaellenorzott DRAFT folytatasa.');
 const d=clone(updated);
 d.session=sessionFor(model,claim,d.version,parentSha256);
 return validateSuccessorDraft(d,model,claim,d.version,parentSha256);
}
export async function inspectSuccessorArtifacts({model,manifest,claim,baseline,revisions=[]},now=Date.now()){
 const {layout}=successorNames(model.version);
 ok(Array.isArray(revisions)&&revisions.length<=1000,
  'Hibas V3 reviziolista.');
 if(!manifest){ok(!claim&&!baseline&&!revisions.length,
  'V3 foglalas manifest nelkul; kezi egyeztetes kell.');
  return {status:'READY_TO_START',latest:null,revision:0};}
 await receipt(manifest,layout.session,'version-info.json');
 if(!claim){ok(!baseline&&!revisions.length,
  'V3 DRAFT foglalas nelkul; nincs folytatas.');
  return {status:'START_INCOMPLETE',latest:null,revision:0};}
 await receipt(claim,layout.session,lifecycleFileName(model.version,'claim'));
 const c=claim.document;
 ok(c.format==='mflow-versioned-session'&&c.status==='ACTIVE'&&
  c.planVersion===model.version&&c.boardId===PILOT_BOARD&&
  pilotUuid(c.sessionId)&&c.sessionId!==model.source.sessionId&&
  c.createdBy===model.createdBy&&c.editorId===model.editorId&&
  c.baselineFile===draftFileName(model.version)&&
  c.sourceFingerprint===model.fingerprint&&same(c.source,model.source)&&
  c.mondayWrites===0&&validDate(c.createdAt,now)&&
  Date.parse(c.createdAt)>=Date.parse(model.completedAt),
  'A V3 munkamenet foglalasa elter a lezart V2-tol.');
 ok(same(manifest.document,makeSuccessorManifest(model,c)),
  'A V3 mappamanifest forrasa elter.');
 if(!baseline){ok(!revisions.length,'Hianyzo V3 baseline melletti reviziok.');
  return {status:'START_INCOMPLETE',latest:null,revision:0};}
 await receipt(baseline,layout.drafts,draftFileName(model.version));
 validateSuccessorDraft(baseline.document,model,c,0,null);
 let latest=baseline;
 for(let i=0;i<revisions.length;i++){
  const r=revisions[i],version=i+1;
  await receipt(r,layout.drafts,draftFileName(model.version,version));
  validateSuccessorDraft(r.document,model,c,version,latest.receipt.sha256);
  ok(same(r.document.history.slice(0,-1),latest.document.history),
   'A V3 szerkesztes elozmenye megvaltozott.');
  latest=r;
 }
 return {status:'ACTIVE',latest,revision:latest.document.version};
}
