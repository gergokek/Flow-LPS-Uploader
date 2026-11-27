// Pure validation of the already approved immutable V1 plan.
// No access to Microsoft credentials, Graph or Monday in this module.
import {hex,stable,fingerprint} from './single-draft-session-core.js';

const check=(yes,msg)=>{if(!yes)throw Error(msg);};
export const APPROVED_V1_FILE='approved-v1.json';
export const SYNC_CHECKPOINT_FILE='sync-v1-prepared.json';
export const APPROVAL_RECEIPT_FILE='session-v1-approved.json';
export function inspectApprovedV1({verified,approved,freeze,approvalReceipt,v0,createdBy}={}){
 const p=approved?.value,f=freeze?.value,r=approvalReceipt?.value,
  d=verified?.draft,c=verified?.claimReceipt?.value;
 check(verified?.boardId==='5107075373'&&
  verified?.revision>0&&verified?.status==='ACTIVE'&&
  d?.format==='flow-lps-draft'&&c?.format==='mflow-single-draft-session'&&
  typeof createdBy==='string'&&createdBy===c?.createdBy,
  'A korábbi V1 munkamenet és a Microsoft Entra felhasználó eltér.');
 check(f?.schemaVersion===1&&f.format==='mflow-single-draft-freeze'&&
  f.status==='APPROVAL_FROZEN'&&f.boardId===verified.boardId&&
  f.sessionId===verified.sessionId&&f.revision===verified.revision&&
  f.finalDraftSha256===verified.receipt.sha256&&
  f.approvedV0Sha256===verified.sourceApprovedSha256,
  'A V1 zárolása és a jóváhagyott DRAFT nem egyezik.');
 check(p?.schemaVersion===1&&p.format==='flow-lps-approved-plan'&&
  p.isApprovedPlan===true&&p.status==='APPROVED'&&
  p.boardId===verified.boardId&&p.planVersion===1&&
  p.draftVersion===verified.revision&&p.mondaySyncAllowed===false&&
  p.syncStatus==='NOT_STARTED'&&
  p.sourceDraft?.name===verified.receipt.name&&
  p.sourceDraft.sha256===verified.receipt.sha256&&
  p.sourceDraft.itemId===verified.receipt.id&&
  p.sourceDraft.eTag===verified.receipt.eTag&&
  p.sourceFingerprint===d.source&&
  p.finalization?.sessionId===verified.sessionId&&
  p.finalization?.microsoftHomeAccountId===createdBy&&
  p.finalization?.mondayEditorIdClaim===f.mondayEditorIdClaim&&
  p.plan?.base?.id===verified.boardId&&
  stable(p.plan.base)===stable(d.base)&&
  stable(p.plan.working)===stable(d.working)&&
  stable(p.plan.history)===stable(d.history)&&
  p.sourceFingerprint===fingerprint(p.plan.base)&&
  v0?.value?.sourceFingerprint===p.sourceFingerprint&&
  stable(v0.value.plan.base)===stable(p.plan.base),
  'Az Approved Plan V1 tartalma nem az utolsó, zárolt DRAFT változat.');
 check(r?.schemaVersion===1&&
  r.format==='mflow-single-draft-approval-receipt'&&
  r.status==='APPROVED_PLAN_V1_STORED'&&
  r.boardId===verified.boardId&&r.sessionId===verified.sessionId&&
  r.revision===verified.revision&&r.finalDraftSha256===verified.receipt.sha256&&
  r.approvedPlanSha256===approved.sha256&&
  r.approvedPlanId===approved.id&&
  r.approvedPlanETag===approved.eTag&&
  r.approvedPlanName===APPROVED_V1_FILE&&
  r.frozenSha256===freeze.sha256&&r.mondayWrites===0&&
  hex(approved.sha256)&&!!approved.eTag&&
  approved.name===APPROVED_V1_FILE&&
  approved.size>0&&approved.size<=5_000_000&&
  p.plan.working.length===p.plan.base.tasks.length&&
  p.plan.working.length>0&&
  new Set(p.plan.working.map(t=>t.id)).size===p.plan.working.length,
  'Az Approved Plan V1 SharePoint-nyugtája vagy a teljes feladatlista sérült.');
 check(p.plan.base.tasks.every((t,i)=>t.id===p.plan.working[i]?.id),
  'Az Approved Plan feladatainak sorrendje vagy azonosítója eltér.');
 return Object.freeze({
  status:'APPROVED_V1_VERIFIED',boardId:verified.boardId,
  sessionId:verified.sessionId,planVersion:1,revision:verified.revision,
  sourceDraftSha256:verified.receipt.sha256,
  sourceFingerprint:p.sourceFingerprint,
  approvedPlan:structuredClone(p),
  receipt:Object.freeze({name:approved.name,id:approved.id,
   eTag:approved.eTag,size:approved.size,sha256:approved.sha256,
   verification:'content-sha256-and-etag',
   path:'Projects/'+verified.boardId+'/Approved-Plans/'+APPROVED_V1_FILE}),
  freezeSha256:freeze.sha256,
  approvalReceiptSha256:approvalReceipt.sha256,
  mondayWrites:0,mondaySyncAllowed:false
 });
}
export function makeV1SyncCheckpoint({verified,editorId,createdBy,at,
 boardVerifiedAt,boardFingerprintSha256,microsoftEntraObjectId}={}){
 const time=Date.parse(boardVerifiedAt),now=Date.parse(at);
 check(verified?.status==='APPROVED_V1_VERIFIED'&&
  verified.boardId==='5107075373'&&verified.planVersion===1&&
  /^[0-9a-f]{64}$/.test(verified.receipt?.sha256||'')&&
  /^[0-9a-f]{64}$/.test(boardFingerprintSha256||'')&&
  /^[0-9a-f-]{36}$/i.test(microsoftEntraObjectId||'')&&
  /^\d+$/.test(editorId||'')&&
  verified.approvedPlan.finalization.mondayEditorIdClaim===editorId&&
  verified.approvedPlan.finalization.microsoftHomeAccountId===createdBy&&
  Number.isFinite(time)&&Number.isFinite(now)&&time<=now&&
  now-time<=120000,
  'A V1 szinkron-előkészítéshez friss Monday-board-ellenőrzés szükséges.');
 return Object.freeze({
  schemaVersion:1,format:'mflow-approved-v1-sync-checkpoint',
  status:'PREPARED_NO_WRITES',boardId:verified.boardId,planVersion:1,
  approvedName:APPROVED_V1_FILE,approvedSha256:verified.receipt.sha256,
  approvedItemId:verified.receipt.id,approvedETag:verified.receipt.eTag,
  sourceDraftSha256:verified.sourceDraftSha256,
  sessionId:verified.sessionId,revision:verified.revision,
  sourceFingerprint:verified.sourceFingerprint,
  mondayBoardFingerprintSha256:boardFingerprintSha256,
  mondayBoardVerifiedAt:boardVerifiedAt,editorId,
  createdBy,microsoftEntraObjectId,createdAt:at,
  mondayWrites:0,mutationAttempts:0,
  writeAuthorization:'NOT_GRANTED',nextStep:'SEPARATE_TEST_PILOT',
  automaticallyRetryable:false
 });
}
