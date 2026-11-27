// Verify every preceding cycle from the historical V2 root. Each version's
// model is rebuilt from its predecessor and immutable artifacts, not accepted
// from a caller's "verified" flag or serialized model. No live board writes.
import {PILOT_BOARD,pilotAssert as ok,pilotFingerprint,pilotSha,pilotHex,pilotUuid}
 from './v1-pilot-contract.js';
import {inspectLegacyV2Predecessor} from './versioned-draft-contract.js';
import {buildVersionedApprovalModelFromArtifacts} from './versioned-approval-core.js';
import {inspectVersionedSyncCycle} from './versioned-sync-contract.js';
import {isVersionedPlan,completedSyncStatus} from './versioned-cycle-version.js';

export async function deriveCompletedSuccessor({report,version,editorId,createdBy,now=Date.now()}={}){
 ok(isVersionedPlan(version)&&version>=4&&report?.model?.version===version-1,
  'The predecessor must be the immediately previous version.');
 const s=await inspectVersionedSyncCycle(report,now),m=s.model;
 ok(s.status===completedSyncStatus(version-1)&&s.remainingTaskCount===0&&
  s.verifiedTaskCount===m.changedTaskCount&&m.boardId===PILOT_BOARD&&
  m.source?.planVersion===m.version-1&&pilotHex(m.source?.completionSha256)&&
  m.editorId===editorId&&m.createdBy===createdBy&&
  pilotUuid(m.sessionId)&&m.draft?.session?.sessionId===m.sessionId&&
  m.draft.session.planVersion===m.version&&
  pilotHex(m.claimSha256)&&pilotHex(report.approved?.receipt?.sha256)&&
  pilotHex(report.final?.receipt?.sha256)&&m.finalBoardSha256===s.expectedBoardSha256,
  'The predecessor approval, journal, identity or final receipt is incomplete.');
 const base=structuredClone(m.draft.base);
 base.tasks=structuredClone(m.draft.working);
 const fingerprint=pilotFingerprint(base);
 ok(base.id===PILOT_BOARD&&base.tasks.length===m.taskCount&&
  await pilotSha(fingerprint)===m.finalBoardSha256,
  'The predecessor final board does not match the approved working state.');
 const source={planVersion:m.version,sessionId:m.sessionId,revision:m.revision,
  approvedSha256:report.approved.receipt.sha256,completionSha256:report.final.receipt.sha256,
  completionBoardSha256:m.finalBoardSha256,sourceClaimSha256:m.claimSha256};
 return {version,boardId:PILOT_BOARD,source,base,fingerprint,editorId,createdBy,
  taskCount:m.taskCount,completedAt:report.final.document.createdAt};
}

// V3 accepts the original V2 report. V4+ requires a complete, ordered bundle:
// { legacyV2, cycles: [{planVersion, artifacts, freeze, approved, approval,
//                      records, final}, ...] }.
// This deliberate data boundary prevents a forged model from authorizing a
// new version. Historical cycles are verified without comparing them to the
// *current* Monday board; the prospective successor store checks that board.
export async function inspectVersionedPredecessor({predecessor,version,editorId,createdBy,now=Date.now()}={}){
 ok(isVersionedPlan(version),'Invalid successor version.');
 if(version===3)return inspectLegacyV2Predecessor({predecessor,version,editorId,createdBy,now});
 ok(predecessor?.legacyV2&&Array.isArray(predecessor.cycles)&&
  predecessor.cycles.length===version-3,
  'V'+version+' requires the complete ordered predecessor evidence from V2.');
 let model=await inspectLegacyV2Predecessor({
  predecessor:predecessor.legacyV2,version:3,editorId,createdBy,now});
 const sessions=new Set([model.source.sessionId]);
 for(let i=0;i<predecessor.cycles.length;i++){
  const cycle=predecessor.cycles[i],v=i+3;
  ok(cycle?.planVersion===v&&cycle.artifacts&&model.version===v,
   'Missing, duplicate or out-of-order predecessor cycle V'+v+'.');
  const verified=await buildVersionedApprovalModelFromArtifacts({model,artifacts:cycle.artifacts,now});
  ok(!sessions.has(verified.sessionId),'Reused session identifier in predecessor chain.');
  sessions.add(verified.sessionId);
  const report={model:verified,freeze:cycle.freeze,approved:cycle.approved,
   approval:cycle.approval,records:cycle.records,final:cycle.final};
  model=await deriveCompletedSuccessor({report,version:v+1,editorId,createdBy,now});
 }
 ok(model.version===version,'Incomplete predecessor chain.');
 return model;
}

export async function inspectVersionedApprovalSource({predecessor,artifacts,
 planVersion=3,editorId,createdBy,now=Date.now()}){
 // Rebuild every predecessor cycle, including all historical journals.
 const model=await inspectVersionedPredecessor({predecessor,version:planVersion,
  editorId,createdBy,now});
 return buildVersionedApprovalModelFromArtifacts({model,artifacts,now});
}
