// Immutable, readback-verified V3+ session report -> existing editor handoff.
// Does not allocate a session or authorize Monday writes.
import {pilotAssert as ok,pilotHex,pilotUuid,pilotFileSha,pilotFingerprint}
 from './v1-pilot-contract.js';
import {versionLayout,draftFileName} from './version-workspace-layout.js';
export async function verifiedVersionedSelection(report,{boardId='5107075373'}={}){
 const version=report?.planVersion,claim=report?.claim?.document,
  latest=report?.latest,receipt=latest?.receipt,draft=latest?.document;
 const layout=versionLayout(boardId,version);
 ok(!layout.legacy&&report?.status==='ACTIVE'&&
  !report.hasFreeze&&!report.hasApproval&&!report.hasClosure&&
  pilotUuid(claim?.sessionId)&&claim.boardId===boardId&&
  claim.planVersion===version&&
  draft?.boardId===boardId&&draft.session?.planVersion===version&&
  draft.session.sessionId===claim.sessionId&&
  report.revision===draft.version&&draft.session.revision===draft.version&&
  pilotHex(receipt?.sha256)&&receipt?.eTag&&receipt?.id&&
  receipt?.verification==='content-sha256-and-etag'&&
  receipt.path===layout.drafts+'/'+draftFileName(version,draft.version)&&
  draft.source===pilotFingerprint(draft.base)&&
  await pilotFileSha(draft)===receipt.sha256,
  'Nem igazolt verzios DRAFT-atadas: munkamenet, fajl vagy SHA-256 elter.');
 return Object.freeze({status:'ACTIVE',boardId,sessionId:claim.sessionId,
  planVersion:version,revision:draft.version,
  versionLabel:'V'+version+(draft.version?'.'+draft.version:''),
  receipt:structuredClone(receipt),draft:structuredClone(draft),
  mondayWrites:0});
}
