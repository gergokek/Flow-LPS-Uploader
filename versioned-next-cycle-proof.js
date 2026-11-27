// V4 eligibility after a fully verified V3 terminal receipt.
// Pure inspector: does NOT allocate V4, create SharePoint folders, or write Monday.
// Re-inspect V2 predecessor, V3 DRAFT chain and all V3 Sync files before use.
import {PILOT_BOARD,pilotAssert as ok,pilotFingerprint,pilotHex}
 from './v1-pilot-contract.js';
import {inspectVersionedSyncCycle} from './versioned-sync-contract.js';
import {isVersionedPlan,completedSyncStatus,nextReadyStatus} from './versioned-cycle-version.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),copy=x=>structuredClone(x);

export async function inspectNextCycleReadiness({
 report,verifiedSource,liveBoard,editorId,createdBy,now=Date.now()
}={}){
 const s=await inspectVersionedSyncCycle(report,now),m=s.model;
 ok(isVersionedPlan(m?.version)&&m.version<9999&&s.status===completedSyncStatus(m.version)&&s.remainingTaskCount===0&&
   s.verifiedTaskCount===m.changedTaskCount&&
   m.boardId===PILOT_BOARD&&
   m.editorId===editorId&&m.createdBy===createdBy&&
   verifiedSource?.boardId===PILOT_BOARD&&verifiedSource.version===m.version&&
   verifiedSource.sessionId===m.sessionId&&
   verifiedSource.revision===m.revision&&
   verifiedSource.sourceDraftSha256===m.sourceDraftSha256&&
   verifiedSource.generationSha256===m.generationSha256&&
   verifiedSource.source?.completionSha256===m.source.completionSha256&&
   verifiedSource.sourceBoardSha256===m.sourceBoardSha256&&
   verifiedSource.finalBoardSha256===m.finalBoardSha256&&
   verifiedSource.claimSha256===m.claimSha256&&
   verifiedSource.manifestSha256===m.manifestSha256&&
   verifiedSource.changedTaskCount===m.changedTaskCount&&
   same(verifiedSource.draft,m.draft)&&
   Array.isArray(m.draft?.working)&&m.draft.working.length===m.taskCount&&
   pilotHex(report?.final?.receipt?.sha256)&&
   pilotHex(report?.approved?.receipt?.sha256)&&
   pilotHex(m.source?.completionSha256),
  'V4 nem indithato: a V3 teljes szinkronja vagy forrasa nem igazolt.');
 const base=copy(m.draft.base);
 base.tasks=copy(m.draft.working);
 ok(base.id===PILOT_BOARD&&pilotFingerprint(base)===pilotFingerprint(liveBoard)&&
   liveBoard?.id===PILOT_BOARD&&
   m.finalBoardSha256===s.expectedBoardSha256,
  'A V4 kiindulo board nem egyezik a teljes V3 vegallapottal.');
 const source={planVersion:m.version,sessionId:m.sessionId,revision:m.revision,
  approvedSha256:report.approved.receipt.sha256,
  completionSha256:report.final.receipt.sha256,
  completionBoardSha256:m.finalBoardSha256,
  sourceClaimSha256:m.claimSha256};
 return Object.freeze({status:nextReadyStatus(m.version+1),nextVersion:m.version+1,
  boardId:PILOT_BOARD,source,base,
  fingerprint:pilotFingerprint(base),
  editorId,createdBy,taskCount:m.taskCount,
  completedAt:report.final.document.createdAt,
  readOnly:true,mondayWrites:0,
  // Readiness is not authorization. The current-project coordinator owns allocation.
  startEnabled:false});
}

// Historical public API stays exact for the already deployed V3 UI.
export async function inspectV4StartReadiness(args={}){
 ok(args.report?.model?.version===3,'V4 readiness requires V3 evidence.');
 return inspectNextCycleReadiness(args);
}
