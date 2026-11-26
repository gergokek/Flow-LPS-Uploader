// V4 eligibility after a fully verified V3 terminal receipt.
// Pure inspector: does NOT allocate V4, create SharePoint folders, or write Monday.
// Re-inspect V2 predecessor, V3 DRAFT chain and all V3 Sync files before use.
import {PILOT_BOARD,pilotAssert as ok,pilotFingerprint,pilotHex}
 from './v1-pilot-contract.js';
import {inspectVersionedSyncCycle} from './versioned-sync-contract.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),copy=x=>structuredClone(x);

export async function inspectV4StartReadiness({
 report,verifiedSource,liveBoard,editorId,createdBy,now=Date.now()
}={}){
 const s=await inspectVersionedSyncCycle(report,now),m=s.model;
 ok(s.status==='V3_SYNC_COMPLETED'&&s.remainingTaskCount===0&&
   s.verifiedTaskCount===m.changedTaskCount&&
   m?.version===3&&m.boardId===PILOT_BOARD&&
   m.editorId===editorId&&m.createdBy===createdBy&&
   verifiedSource?.boardId===PILOT_BOARD&&verifiedSource.version===3&&
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
 const source={planVersion:3,sessionId:m.sessionId,revision:m.revision,
  approvedSha256:report.approved.receipt.sha256,
  completionSha256:report.final.receipt.sha256,
  completionBoardSha256:m.finalBoardSha256,
  sourceClaimSha256:m.claimSha256};
 return Object.freeze({status:'V4_READY_TO_START',nextVersion:4,
  boardId:PILOT_BOARD,source,base,
  fingerprint:pilotFingerprint(base),
  editorId,createdBy,taskCount:m.taskCount,
  completedAt:report.final.document.createdAt,
  readOnly:true,mondayWrites:0,
  // V4 creation remains separately gated until its versioned Graph store exists.
  startEnabled:false});
}
