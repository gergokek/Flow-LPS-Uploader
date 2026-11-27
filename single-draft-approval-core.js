// One-session TEST approval: pure planning and strict schema, no Graph/Monday I/O.
// The immutable V1.X file remains the final DRAFT; Approved Plan V1 is a copy.
import {stable,fingerprint,hex} from './single-draft-session-core.js';
const requireValid=(ok,message)=>{if(!ok)throw Error(message);};
export const FREEZE_NAME='session-v1-freeze.json';
export const APPROVED_V1_NAME='approved-v1.json';
const exactIds=tasks=>tasks.map(t=>t.id);
const withoutUpdatedAt=t=>{const {updatedAt,...rest}=t;return rest;};
export function describeV1Approval({verified,v0,createdBy,editorId,at}={}){
 const draft=verified?.draft,claim=verified?.claimReceipt?.value;
 requireValid(verified?.status==='ACTIVE'&&verified.boardId==='5107075373'&&
  draft?.schemaVersion===1&&draft.format==='flow-lps-draft'&&
  draft.status==='DRAFT'&&draft.version===verified.revision&&
  verified.revision>0&&claim?.status==='ACTIVE'&&
  claim.sessionId===verified.sessionId&&
  claim.approvedV0Sha256===verified.sourceApprovedSha256&&
  claim.createdBy===createdBy&&
  draft.session?.sessionId===claim.sessionId&&
  draft.session?.revision===verified.revision&&
  hex(verified.receipt?.sha256)&&verified.receipt?.eTag&&
  verified.receipt.verification==='content-sha256-and-etag'&&
  v0?.schemaVersion===1&&v0.format==='flow-lps-approved-plan'&&
  v0.boardId===verified.boardId&&v0.draftVersion===0&&
  v0.status==='APPROVED'&&v0.plan?.base?.id===verified.boardId&&
  stable(v0.plan.base)===stable(draft.base)&&
  stable(draft.working?.map(t=>t.id))===stable(exactIds(draft.base.tasks))&&
  draft.source===fingerprint(draft.base)&&
  typeof editorId==='string'&&/^\d+$/.test(editorId)&&
  Number.isFinite(Date.parse(at)),
  'A V1.X véglegesítési előfeltétele vagy a Microsoft munkamenet eltér.');
 const changes=draft.working.filter((t,i)=>
  stable(withoutUpdatedAt(t))!==stable(withoutUpdatedAt(draft.base.tasks[i])));
 requireValid(changes.length>0,
  'Változatlan V1 nem hagyható jóvá, előbb rögzíts módosítást.');
 const changedFieldNames=new Set();
 for(const t of changes){
  const before=draft.base.tasks.find(x=>x.id===t.id);
  for(const key of new Set([...Object.keys(t),...Object.keys(before)])){
   if(key==='updatedAt')continue;
   if(stable(t[key])!==stable(before[key]))changedFieldNames.add(key);
  }
 }
 const approved={
  schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',
  isApprovedPlan:true,mondaySyncAllowed:false,syncStatus:'NOT_STARTED',
  boardId:verified.boardId,planVersion:1,draftVersion:verified.revision,
  sourceFingerprint:draft.source,
  sourceDraft:{name:verified.receipt.name,itemId:verified.receipt.id,
   eTag:verified.receipt.eTag,sha256:verified.receipt.sha256},
  finalization:{sessionId:claim.sessionId,approvedAt:at,
   approvedV0Sha256:claim.approvedV0Sha256,
   microsoftHomeAccountId:createdBy,mondayEditorIdClaim:editorId,
   changedTaskCount:changes.length,
   finalDraftRevision:verified.revision,
   note:'TEST approval: board write authorization NOT granted.'},
  plan:{base:structuredClone(draft.base),
   working:structuredClone(draft.working),
   history:structuredClone(draft.history)}
 };
 const freeze={schemaVersion:1,format:'mflow-single-draft-freeze',
  status:'APPROVAL_FROZEN',boardId:verified.boardId,planVersion:1,
  sessionId:claim.sessionId,revision:verified.revision,
  finalDraftName:verified.receipt.name,
  finalDraftSha256:verified.receipt.sha256,
  approvedV0Sha256:claim.approvedV0Sha256,
  createdBy,mondayEditorIdClaim:editorId,createdAt:at,
  mondayWrites:0,automaticResume:false};
 return Object.freeze({
  approved,freeze,review:Object.freeze({
   status:'V1_APPROVAL_REVIEWED',boardId:verified.boardId,
   planVersion:1,revision:verified.revision,
   sessionId:claim.sessionId,sourceSha256:verified.receipt.sha256,
   taskCount:draft.working.length,changedTaskCount:changes.length,
   changedFieldNames:[...changedFieldNames].sort(),
   finalDraftName:verified.receipt.name,
   mondayWrites:0,needsMondayBoardReadback:true,
   approvedPlanFile:APPROVED_V1_NAME
  })
 });
}
