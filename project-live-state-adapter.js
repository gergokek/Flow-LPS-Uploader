// Project-state projection from ALREADY VERIFIED V1/V2/V3 source inspectors.
// Never infer an active session from a folder name or draft filename.
// No Graph or Monday mutation, no implicit authorization.
import {resolvePlanningState} from './project-version-resolver.js';
const ok=(v,m)=>{if(!v)throw Error(m);};
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const completed=(p,sessionId,sourceVersion,sourceFields,completionSha256)=>({
 planVersion:p,status:'SYNC_COMPLETED',verified:true,sessionId,sourceVersion,
 ...sourceFields,completionSha256,fullBoardReadbackVerified:true,remainingTaskCount:0});
export function projectVerifiedCycleState({boardId,approvedV0,oldV1Claim,
 v1Report,v1State,v2Report,v2State,v3Report,folderCatalog,boardFingerprint}={}){
 ok(boardId==='5107075373'&&hex(approvedV0?.sha256)&&
  folderCatalog?.complete===true&&Array.isArray(folderCatalog.versions)&&
  folderCatalog.versions.includes(1)&&folderCatalog.versions.includes(2),
  'Verified V0 and complete SharePoint catalog are required.');
 const v1=v1State?.model?.pilot,final1=v1Report?.evidence?.final;
 const claim=oldV1Claim?.value,closure=v2Report?.session?.closure;
 ok(v1State?.status==='V1_SYNC_COMPLETED'&&v1State.remainingTaskCount===0&&
  uuid(v1?.sessionId)&&hex(final1?.receipt?.sha256)&&
  claim?.sessionId===v1.sessionId&&claim?.planVersion===1&&
  claim?.approvedV0Sha256===approvedV0.sha256&&
  oldV1Claim.sha256===closure?.document?.lineage?.sourceClaimSha256,
  'V1 is not fully verified against V0 and its closure.');
 const a1=completed(1,v1.sessionId,0,{sourceApprovedV0Sha256:approvedV0.sha256},
  final1.receipt.sha256);
 const m=v2State?.model,claim2=v2Report?.session?.claim?.document;
 ok(uuid(m?.sessionId)&&claim2?.sessionId===m.sessionId&&
  m.completionV1Sha256===final1.receipt.sha256&&
  [2].includes(claim2.planVersion)&&
  m.draft?.session?.planVersion===2,
  'V2 source lineage is not fully verified.');
 let a2,boardExpected=m.sourceFingerprint;
 if(v2State.status==='V2_SYNC_COMPLETED'){
  ok(v2State.remainingTaskCount===0&&
    v2Report?.final?.document?.fullBoardReadbackMatches===true&&
    hex(v2Report.final.receipt.sha256),
    'V2 final receipt is incomplete.');
  a2=completed(2,m.sessionId,1,{sourceCompletionSha256:final1.receipt.sha256},
    v2Report.final.receipt.sha256);
  boardExpected=m.finalFingerprint;
 }else if(v2State.status==='DRAFT_READY'){
  ok(hex(m.sourceDraftSha256)&&Number.isSafeInteger(m.revision),
   'Unverified active V2 draft revision.');
  a2={planVersion:2,status:'ACTIVE',verified:true,sessionId:m.sessionId,sourceVersion:1,
   sourceCompletionSha256:final1.receipt.sha256,revision:m.revision,
   latestDraftSha256:m.sourceDraftSha256};
 }else{
  // A partial approval/sync must never increment the version; force review.
  return Object.freeze({status:'BLOCKED',action:'CONTINUE_FINALIZATION',
   planVersion:2,reason:'V2 approval/sync is not complete.',readOnly:true,mondayWrites:0});
 }
 const versions=[a1,a2];
 if(folderCatalog.versions.includes(3)){
  ok(a2.status==='SYNC_COMPLETED'&&v3Report?.status==='ACTIVE'&&
   v3Report?.planVersion===3&&
   uuid(v3Report.claim?.document?.sessionId)&&
   v3Report.claim.document.source.completionSha256===a2.completionSha256&&
   hex(v3Report.latest?.receipt?.sha256)&&
   Number.isSafeInteger(v3Report.revision),
   'V3 directory is not a completely verified active session.');
  versions.push({planVersion:3,status:'ACTIVE',verified:true,
   sessionId:v3Report.claim.document.sessionId,sourceVersion:2,
   sourceCompletionSha256:a2.completionSha256,
   revision:v3Report.revision,latestDraftSha256:v3Report.latest.receipt.sha256});
 }
 // Later versions must have their own verified inspector before they can be
 // selected. Never silently ignore an unknown higher version.
 ok(folderCatalog.versions.every(v=>v>=1&&v<=3),
  'A higher plan version lacks a verified inspector.');
 const state=resolvePlanningState({boardId,approvedV0:{verified:true,sha256:approvedV0.sha256},
  versions,catalogComplete:true,
  boardVerified:boardFingerprint===boardExpected});
 return Object.freeze({...state,verifiedVersionCount:versions.length,
  preparedFolders:[...(folderCatalog.preparedFolders||[])],
  predecessorCompletionSha256:a2.status==='SYNC_COMPLETED'?a2.completionSha256:null,
  boardMatches:boardFingerprint===boardExpected,readOnly:true,mondayWrites:0});
}
