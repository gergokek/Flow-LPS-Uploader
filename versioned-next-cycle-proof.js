// Read-only eligibility from an independently reconstructed approval model.
// Never a creation permit. The live board must equal the last completed plan.
import {PILOT_BOARD,pilotAssert as ok,pilotFingerprint,pilotStable}
 from './v1-pilot-contract.js';
import {versionedApprovalNames} from './versioned-approval-core.js';
import {deriveCompletedSuccessor} from './versioned-lineage-contract.js';
import {isVersionedPlan,nextReadyStatus} from './versioned-cycle-version.js';
const data=({names,...m})=>m;

export async function inspectNextCycleReadiness({
 report,verifiedSource,liveBoard,editorId,createdBy,now=Date.now()
}={}){
 const m=verifiedSource;
 ok(isVersionedPlan(m?.version)&&m.version<9999&&
    report?.model?.version===m.version&&
    pilotStable(data(report.model))===pilotStable(data(m)),
  'The completed report and independently reconstructed source do not match.');
 const model={...data(m),names:versionedApprovalNames(PILOT_BOARD,m.version)};
 const next=await deriveCompletedSuccessor({report:{...report,model},
  version:m.version+1,editorId,createdBy,now});
 ok(liveBoard?.id===PILOT_BOARD&&pilotFingerprint(liveBoard)===next.fingerprint,
  'The live Monday board does not match the final predecessor.');
 return Object.freeze({status:nextReadyStatus(next.version),nextVersion:next.version,
  boardId:next.boardId,source:next.source,base:next.base,fingerprint:next.fingerprint,
  editorId,createdBy,taskCount:next.taskCount,completedAt:next.completedAt,
  readOnly:true,mondayWrites:0,startEnabled:false});
}
// Historical public API stays exact for the already deployed V3 UI.
export async function inspectV4StartReadiness(args={}){
 ok(args.report?.model?.version===3,'V4 readiness requires V3 evidence.');
 return inspectNextCycleReadiness(args);
}
