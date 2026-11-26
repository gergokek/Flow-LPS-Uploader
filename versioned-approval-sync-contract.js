// Shared TEST-only V3+ approval contract. Keep byte-identical in Monday and Uploader.
// Pure data, fingerprints and validation; this module grants NO Monday/Graph write capability.
// The V2 historical implementation and its old SharePoint paths are deliberately untouched.
import {PILOT_BOARD,PILOT_FIELDS,pilotAssert as ok,pilotStable as stable,
 pilotSha as sha,pilotFileSha,pilotHex,pilotUuid,pilotFingerprint,pilotTask}
 from './v1-pilot-contract.js';
import {versionLayout,versionFilePath,lifecycleFileName} from './version-workspace-layout.js';
import {inspectPredecessor,inspectSuccessorArtifacts} from './version-successor-contract.js';

const clone=x=>structuredClone(x);
const same=(a,b)=>stable(a)===stable(b);
function checkedVersion(boardId,version){
 ok(boardId===PILOT_BOARD&&Number.isSafeInteger(version)&&version>=3&&version<=9999,
  'Csak az izolalt TEST board V3+ verzioja engedelyezett.');
 const layout=versionLayout(boardId,version);
 ok(!layout.legacy,'A V1/V2 torteneti SharePoint helye valtozatlan.');
 return layout;
}
export function versionedApprovalNames(boardId,version){
 const layout=checkedVersion(boardId,version);
 return Object.freeze({layout,freeze:lifecycleFileName(version,'freeze'),
  approved:lifecycleFileName(version,'approved'),
  approval:lifecycleFileName(version,'approval-receipt'),
  completed:lifecycleFileName(version,'completion'),
  ahead:step=>lifecycleFileName(version,'ahead',step),
  result:step=>lifecycleFileName(version,'result',step)});
}
export async function checkVersionedApprovalFile(pair,boardId,version,kind,name){
 checkedVersion(boardId,version);
 ok(pair&&pair.document&&pair.receipt&&
  pair.receipt.name===name&&
  pair.receipt.path===versionFilePath({boardId,version,kind,name})&&
  typeof pair.receipt.id==='string'&&!!pair.receipt.id&&
  typeof pair.receipt.eTag==='string'&&!!pair.receipt.eTag&&
  pair.receipt.verification==='content-sha256-and-etag'&&
  pilotHex(pair.receipt.sha256)&&
  await pilotFileSha(pair.document)===pair.receipt.sha256,
  'Nem igazolt verzios fajlazonossag, utvonal vagy SHA-256: '+name);
 return pair.document;
}
function verifiedTime(value,now){
 return typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+5000;
}
function freshFreezeTime(d,now){
 const made=Date.parse(d.createdAt),board=Date.parse(d.boardVerifiedAt);
 return verifiedTime(d.createdAt,now)&&verifiedTime(d.boardVerifiedAt,now)&&
  board<=made+5000&&made-board<=120000;
}
// Pure artifact-to-model converter. Its caller must ALSO verify the predecessor.
// Only inspectVersionedApprovalSource below performs both independent inspections.
export async function buildVersionedApprovalModelFromArtifacts({model,artifacts,now=Date.now()}){
 const boardId=model?.boardId,version=model?.version;
 checkedVersion(boardId,version);
 ok(model.base?.id===boardId&&model.source?.planVersion===version-1&&
  pilotHex(model.source?.completionSha256)&&pilotHex(model.source?.approvedSha256)&&
  pilotHex(model.source?.completionBoardSha256)&&pilotHex(model.source?.sourceClaimSha256)&&
  pilotFingerprint(model.base)===model.fingerprint&&
  await sha(model.fingerprint)===model.source.completionBoardSha256,
  'Nem igazolt megelozo ciklus vagy board forras.');
 const a=artifacts||{};
 const verified=await inspectSuccessorArtifacts({model,manifest:a.manifest,
  claim:a.claim,baseline:a.baseline,revisions:a.revisions||[]},now);
 ok(verified.status==='ACTIVE'&&verified.latest?.receipt&&a.claim?.receipt&&a.manifest?.receipt,
  'Csak teljesen ellenorzott aktiv DRAFT hagyhato jova.');
 const d=verified.latest.document;
 ok(d.session?.planVersion===version&&d.session.sessionId===a.claim.document.sessionId&&
  d.boardId===boardId&&d.source===model.fingerprint&&
  d.version===verified.revision&&d.base?.id===boardId&&
  d.working.length===model.base.tasks.length,
  'A jovahagyando DRAFT es az aktiv munkamenet nem egyezik.');
 const names=versionedApprovalNames(boardId,version);
 let expected=clone(model.base),fieldCount=0;
 const targets=[];
 for(let i=0;i<d.working.length;i++){
  const before=model.base.tasks[i],after=d.working[i];
  ok(after?.id===before?.id,'Megvaltozott feladatsorrend.');
  const fields=Object.fromEntries(PILOT_FIELDS.filter(k=>!same(before[k],after[k]))
   .map(k=>[k,{before:clone(before[k]??null),after:clone(after[k]??null)}]));
  if(!Object.keys(fields).length)continue;
  if(Object.hasOwn(fields,'note'))
   ok(typeof after.note==='string'&&!/ +$/.test(after.note),
    'Zaro szokozos megjegyzes: a DRAFT-ban kell javitani.');
  const sourceFingerprint=pilotFingerprint(expected);
  expected={...expected,tasks:expected.tasks.map(t=>t.id===after.id?clone(after):t)};
  const expectedFingerprint=pilotFingerprint(expected);
  targets.push({step:targets.length+1,taskId:after.id,taskName:after.name,
   before:clone(before),after:clone(after),fields,
   sourceBoardSha256:await sha(sourceFingerprint),
   expectedBoardSha256:await sha(expectedFingerprint),
   expectedItemSha256:await sha(stable(pilotTask(after)))});
  fieldCount+=Object.keys(fields).length;
 }
 const last=verified.latest.receipt;
 const generationSha256=await sha(stable([version,model.source.completionSha256,
  a.manifest.receipt.sha256,a.claim.receipt.sha256,last.sha256,d.version]));
 return {boardId,version,revision:d.version,sessionId:a.claim.document.sessionId,
  editorId:model.editorId,createdBy:model.createdBy,source:clone(model.source),
  sourceDraftSha256:last.sha256,draftReceipt:clone(last),
  claimSha256:a.claim.receipt.sha256,manifestSha256:a.manifest.receipt.sha256,
  generationSha256,sourceFingerprint:model.fingerprint,
  sourceBoardSha256:await sha(model.fingerprint),
  finalBoardSha256:await sha(pilotFingerprint(expected)),taskCount:d.working.length,
  changedTaskCount:targets.length,fieldCount,targets,
  draft:clone(d),names};
}
export async function inspectVersionedApprovalSource({predecessor,artifacts,
 planVersion=3,editorId,createdBy,now=Date.now()}){
 // V4+ remains fail-closed until its complete predecessor inspector exists.
 const model=await inspectPredecessor({predecessor,version:planVersion,
  editorId,createdBy,now});
 return buildVersionedApprovalModelFromArtifacts({model,artifacts,now});
}
export function versionedApprovalCommon(m){
 checkedVersion(m.boardId,m.version);
 return {schemaVersion:1,boardId:m.boardId,planVersion:m.version,
  sessionId:m.sessionId,revision:m.revision,editorId:m.editorId,
  createdBy:m.createdBy,sourceDraftSha256:m.sourceDraftSha256,
  claimSha256:m.claimSha256,manifestSha256:m.manifestSha256,
  predecessorCompletionSha256:m.source.completionSha256};
}
export function requireVersionedApprovalBoard(args,m,now=Date.now()){
 const at=Date.parse(args?.boardVerifiedAt);
 ok(args?.editorId===m.editorId&&args.createdBy===m.createdBy&&
  args.expectedSessionId===m.sessionId&&args.expectedRevision===m.revision&&
  args.expectedDraftSha256===m.sourceDraftSha256&&
  args.expectedGenerationSha256===m.generationSha256&&
  args.expectedPredecessorSha256===m.source.completionSha256&&
  args.boardFingerprintSha256===m.sourceBoardSha256&&
  Number.isFinite(at)&&at<=now+5000&&now-at<=120000,
  'Elavult vagy eltero verzios jovahagyasi board-bizonyitek.');
}
export function makeVersionedApprovalFreeze(m,args,now=Date.now()){
 requireVersionedApprovalBoard(args,m,now);
 ok(args.userConfirmed===true&&pilotUuid(args.executionId)&&
  verifiedTime(args.createdAt,now)&&
  freshFreezeTime({createdAt:args.createdAt,boardVerifiedAt:args.boardVerifiedAt},now),
  'Hianyzo vagy elavult fuggetlen jovahagyas.');
 return {...versionedApprovalCommon(m),format:'mflow-versioned-approval-freeze',
  status:'APPROVAL_FROZEN',draftName:m.draftReceipt.name,
  sourceGenerationSha256:m.generationSha256,
  sourceBoardSha256:m.sourceBoardSha256,finalBoardSha256:m.finalBoardSha256,
  changedTaskCount:m.changedTaskCount,fieldChangeCount:m.fieldCount,
  executionId:args.executionId,createdAt:args.createdAt,
  boardVerifiedAt:args.boardVerifiedAt,userConfirmed:true,
  mondayWrites:0,automaticallyRetryable:false};
}
export async function validateVersionedApprovalFreeze(pair,m,now=Date.now()){
 await checkVersionedApprovalFile(pair,m.boardId,m.version,'session',m.names.freeze);
 const d=pair.document;
 ok(d?.format==='mflow-versioned-approval-freeze'&&d.status==='APPROVAL_FROZEN'&&
  d.userConfirmed===true&&pilotUuid(d.executionId)&&freshFreezeTime(d,now)&&
  d.mondayWrites===0&&d.automaticallyRetryable===false&&
  same(d,{...versionedApprovalCommon(m),format:'mflow-versioned-approval-freeze',
   status:'APPROVAL_FROZEN',draftName:m.draftReceipt.name,
   sourceGenerationSha256:m.generationSha256,
   sourceBoardSha256:m.sourceBoardSha256,finalBoardSha256:m.finalBoardSha256,
   changedTaskCount:m.changedTaskCount,fieldChangeCount:m.fieldCount,
   executionId:d.executionId,createdAt:d.createdAt,
   boardVerifiedAt:d.boardVerifiedAt,userConfirmed:true,
   mondayWrites:0,automaticallyRetryable:false}),
  'Nem igazolt verzios DRAFT zarolas.');
 return d;
}
export function makeVersionedApprovedPlan(m,freeze){
 ok(freeze?.document?.status==='APPROVAL_FROZEN'&&pilotHex(freeze?.receipt?.sha256),
  'Az Approved Plan elott zarolasi nyugta kell.');
 return {schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',
  isApprovedPlan:true,mondaySyncAllowed:false,syncStatus:'NOT_STARTED',
  boardId:m.boardId,planVersion:m.version,draftVersion:m.revision,
  sourceFingerprint:m.sourceFingerprint,
  sourceDraft:{name:m.draftReceipt.name,id:m.draftReceipt.id,
   eTag:m.draftReceipt.eTag,sha256:m.sourceDraftSha256},
  predecessor:clone(m.source),claimSha256:m.claimSha256,
  manifestSha256:m.manifestSha256,changedTaskCount:m.changedTaskCount,
  fieldChangeCount:m.fieldCount,totalTaskCount:m.taskCount,
  finalBoardSha256:m.finalBoardSha256,
  finalization:{sessionId:m.sessionId,mondayEditorIdClaim:m.editorId,
   microsoftHomeAccountId:m.createdBy,freezeSha256:freeze.receipt.sha256,
   executionId:freeze.document.executionId,userConfirmed:true,
   createdAt:freeze.document.createdAt,
   boardVerifiedAt:freeze.document.boardVerifiedAt,
   boardFingerprintSha256:m.sourceBoardSha256},
  plan:{base:clone(m.draft.base),working:clone(m.draft.working),
   history:clone(m.draft.history),session:clone(m.draft.session)}};
}
export async function validateVersionedApprovedPlan(pair,m,freeze,now=Date.now()){
 await validateVersionedApprovalFreeze(freeze,m,now);
 await checkVersionedApprovalFile(pair,m.boardId,m.version,'approved',m.names.approved);
 ok(same(pair.document,makeVersionedApprovedPlan(m,freeze)),
  'Az Approved Plan nem egyezik a zarolt verzios DRAFT-tal.');
 return pair.document;
}
export function makeVersionedApprovalReceipt(m,freeze,approved){
 ok(pilotHex(freeze?.receipt?.sha256)&&pilotHex(approved?.receipt?.sha256),
  'Hianyzo Approved vagy zarolasi forras.');
 return {...versionedApprovalCommon(m),format:'mflow-versioned-approval-receipt',
  status:'APPROVED_PLAN_STORED',approvedName:m.names.approved,
  approvedSha256:approved.receipt.sha256,approvedItemId:approved.receipt.id,
  approvedETag:approved.receipt.eTag,freezeSha256:freeze.receipt.sha256,
  approvedAt:freeze.document.createdAt,mondayWrites:0,
  automaticallyRetryable:false};
}
export async function validateVersionedApprovalReceipt(pair,m,freeze,approved,now=Date.now()){
 await validateVersionedApprovedPlan(approved,m,freeze,now);
 await checkVersionedApprovalFile(pair,m.boardId,m.version,'session',m.names.approval);
 ok(same(pair.document,makeVersionedApprovalReceipt(m,freeze,approved)),
  'A verzios jovahagyasi nyugta elter.');
 return pair.document;
}
export async function inspectVersionedApprovalState({model,freeze,approved,approval},
 now=Date.now()){
 ok(model&&freeze!==undefined&&approved!==undefined&&approval!==undefined,
  'Hianyos verzios jovahagyasi nyilvantartas.');
 if(!freeze){
  ok(!approved&&!approval,'Arva Approved vagy jovahagyasi nyugta.');
  return {status:'DRAFT_READY',readOnly:true,mondayWrites:0,
   changedTaskCount:model.changedTaskCount};
 }
 await validateVersionedApprovalFreeze(freeze,model,now);
 if(!approved){
  ok(!approval,'Jovahagyasi nyugta Approved Plan nelkul.');
  return {status:'APPROVAL_INCOMPLETE',readOnly:true,mondayWrites:0};
 }
 await validateVersionedApprovedPlan(approved,model,freeze,now);
 if(!approval)return {status:'APPROVAL_INCOMPLETE',readOnly:true,mondayWrites:0};
 await validateVersionedApprovalReceipt(approval,model,freeze,approved,now);
 return {status:model.changedTaskCount?'READY_TO_SYNC':'READY_TO_CLOSE',
  readOnly:true,mondayWrites:0,changedTaskCount:model.changedTaskCount,
  approvedSha256:approved.receipt.sha256,
  approvalReceiptSha256:approval.receipt.sha256};
}
