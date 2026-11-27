import {pilotFileSha,pilotSha,pilotStable,pilotFingerprint,pilotTask,pilotTarget,
 PILOT_BOARD,PILOT_CHECKPOINT,PILOT_AHEAD,PILOT_RESULT} from '../single-v1-pilot-contract.js';
export const at='2026-11-25T12:00:00.000Z',editorId='96423073';
export const objectId='11111111-1111-4111-8111-111111111111';
export const createdBy=objectId+'.22222222-2222-4222-8222-222222222222';
export async function file(document,folder,name){return {document:structuredClone(document),receipt:{
 name,id:'item-'+name,eTag:'etag-'+name,path:'Projects/'+PILOT_BOARD+'/'+folder+'/'+name,
 sha256:await pilotFileSha(document),verification:'content-sha256-and-etag'}};}
export async function fixture(base={id:PILOT_BOARD,workspaceId:'7145773',columns:[],groups:[],tasks:[
 {id:'101',name:'First',note:'',updatedAt:''},{id:'102',name:'Second',note:'',updatedAt:''}]}){
 base=structuredClone(base);const working=structuredClone(base.tasks);
 working[0].note='Approved first';working[1].note='Approved second';
 const approvedPlan={schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',isApprovedPlan:true,
  boardId:PILOT_BOARD,planVersion:1,draftVersion:1,mondaySyncAllowed:false,syncStatus:'NOT_STARTED',
  sourceFingerprint:pilotFingerprint(base),sourceDraft:{sha256:'a'.repeat(64)},
  finalization:{sessionId:'33333333-3333-4333-8333-333333333333',mondayEditorIdClaim:editorId,
   microsoftHomeAccountId:createdBy,microsoftEntraObjectId:objectId},
  plan:{base,working,history:[{revision:1,type:'edit'}]}};
 const receipt=(await file(approvedPlan,'Approved-Plans','approved-v1.json')).receipt;
 const checkpoint={schemaVersion:1,format:'mflow-approved-v1-sync-checkpoint',status:'PREPARED_NO_WRITES',
  boardId:PILOT_BOARD,planVersion:1,approvedName:receipt.name,approvedSha256:receipt.sha256,
  approvedItemId:receipt.id,approvedETag:receipt.eTag,sourceDraftSha256:approvedPlan.sourceDraft.sha256,
  sessionId:approvedPlan.finalization.sessionId,revision:1,sourceFingerprint:approvedPlan.sourceFingerprint,
  mondayBoardFingerprintSha256:await pilotSha(approvedPlan.sourceFingerprint),editorId,createdBy,
  microsoftEntraObjectId:objectId,createdAt:at,mondayWrites:0,mutationAttempts:0,
  writeAuthorization:'NOT_GRANTED',automaticallyRetryable:false};
 const checkpointReceipt=(await file(checkpoint,'Sync-Status',PILOT_CHECKPOINT)).receipt;
 return {approvedPlan,receipt,checkpoint,checkpointReceipt,ahead:null,result:null};
}
export async function aheadFor(e,mutationValuesSha256='d'.repeat(64)){
 const t=await pilotTarget(e,editorId);
 return file({schemaVersion:1,format:'mflow-v1-pilot-ahead',status:'WRITE_AHEAD',boardId:PILOT_BOARD,
  planVersion:1,sessionId:t.sessionId,revision:t.revision,taskId:t.taskId,taskName:t.taskName,editorId,
  microsoftEntraObjectId:objectId,approvedSha256:t.approvedSha256,checkpointSha256:t.checkpointSha256,
  requestId:'44444444-4444-4444-8444-444444444444',fields:t.fields,fieldNames:t.fieldNames,
  mutationValuesSha256,sourceBoardSha256:await pilotSha(t.sourceFingerprint),
  expectedBoardSha256:await pilotSha(t.expectedFingerprint),boardVerifiedAt:at,createdAt:at,
  maximumMutationAttempts:1,automaticallyRetryable:false},'Sync-Status',PILOT_AHEAD);
}
export async function resultFor(e,patch={}){
 const t=await pilotTarget(e,editorId),a=e.ahead;
 return file({schemaVersion:1,format:'mflow-v1-pilot-result',status:'ITEM_READBACK_VERIFIED',
  boardId:PILOT_BOARD,planVersion:1,sessionId:t.sessionId,revision:t.revision,taskId:t.taskId,editorId,
  microsoftEntraObjectId:objectId,approvedSha256:t.approvedSha256,checkpointSha256:t.checkpointSha256,
  requestId:a.document.requestId,writeAheadSha256:a.receipt.sha256,
  mutationValuesSha256:a.document.mutationValuesSha256,mutationAttempts:1,replyConfirmed:true,
  itemReadbackMatches:true,fullBoardReadbackMatches:true,
  itemReadbackSha256:await pilotSha(pilotStable(pilotTask(t.after))),
  boardReadbackSha256:await pilotSha(t.expectedFingerprint),error:null,checkedAt:at,
  automaticallyRetryable:false,...patch},'Sync-Status',PILOT_RESULT);
}
