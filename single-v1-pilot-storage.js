import {PILOT_BOARD,PILOT_CHECKPOINT,PILOT_AHEAD,PILOT_RESULT,
 pilotAssert,pilotSha,pilotFileSha,pilotStable,inspectPilotEvidence,freshPilotBoard} from './single-v1-pilot-contract.js';

// All writes go through the existing create-only, SHA/eTag-verified store.
// No Monday token, SDK call or general-purpose overwrite is available here.
export function createV1PilotStore({readApproved,readSync,createSync,identify,
 check=()=>{},now=()=>new Date()}={}){
 for(const f of [readApproved,readSync,createSync,identify,check,now])
  pilotAssert(typeof f==='function','V1 pilot: hibas tarolo adapter.');
 let aheadAttempted=false,resultAttempted=false;
 const wrap=f=>f?{document:f.value,receipt:{name:f.name,id:f.id,eTag:f.eTag,
  sha256:f.sha256,path:'Projects/'+PILOT_BOARD+'/Sync-Status/'+f.name,
  verification:'content-sha256-and-etag'}}:null;
 async function inspect({createdBy,editorId}={}){
  check();
  const approved=await readApproved({createdBy});
  const [cp,ahead,result]=await Promise.all([readSync(PILOT_CHECKPOINT),readSync(PILOT_AHEAD),readSync(PILOT_RESULT)]);
  pilotAssert(cp,'V1 pilot: a mar letrehozott sync-v1-prepared.json szukseges.');
  const evidence={approvedPlan:approved.approvedPlan,receipt:approved.receipt,
   checkpoint:cp.value,checkpointReceipt:wrap(cp).receipt,
   ahead:wrap(ahead),result:wrap(result)};
  const state=await inspectPilotEvidence(evidence,editorId,now().getTime());
  pilotAssert(state.target.createdBy===createdBy,'V1 pilot: eltero Microsoft munkamenet.');
  const me=await identify();check();
  pilotAssert(me?.id?.toLowerCase()===state.target.microsoftEntraObjectId.toLowerCase()&&
   createdBy.split('.')[0].toLowerCase()===me.id.toLowerCase(),
   'V1 pilot: a Graph /me nem a V1 eredeti letrehozoja.');
  return {status:state.status,evidence,taskId:state.target.taskId,taskName:state.target.taskName,
   checkedAt:now().toISOString(),mondayWrites:0};
 }
 async function writeAhead({createdBy,userConfirmed,...request}={}){
  pilotAssert(userConfirmed===true&&!aheadAttempted,'V1 pilot: ujraprobalas vagy hianyzo megerosites.');
  aheadAttempted=true; // Terminal even when a create response is lost.
  const initial=await inspect({createdBy,editorId:request.editorId});
  const {target}=await inspectPilotEvidence(initial.evidence,request.editorId,now().getTime());
  pilotAssert(initial.status==='READY_FOR_PILOT','V1 pilot: mar letezik naplo; nincs ujrairas.');
  freshPilotBoard(request,target,now().getTime());
  pilotAssert(request.boardFingerprintSha256===await pilotSha(target.sourceFingerprint),
   'V1 pilot: a Monday nem a V0 forrast igazolta.');
  const document={schemaVersion:1,format:'mflow-v1-pilot-ahead',status:'WRITE_AHEAD',
   boardId:PILOT_BOARD,planVersion:1,sessionId:target.sessionId,revision:target.revision,
   taskId:target.taskId,taskName:target.taskName,editorId:target.editorId,
   microsoftEntraObjectId:target.microsoftEntraObjectId,
   approvedSha256:target.approvedSha256,checkpointSha256:target.checkpointSha256,
   requestId:request.requestId,fields:target.fields,fieldNames:target.fieldNames,
   mutationValuesSha256:request.mutationValuesSha256,
   sourceBoardSha256:request.boardFingerprintSha256,
   expectedBoardSha256:await pilotSha(target.expectedFingerprint),
   boardVerifiedAt:request.boardVerifiedAt,createdAt:now().toISOString(),
   maximumMutationAttempts:1,automaticallyRetryable:false};
  check();const receipt=await createSync(PILOT_AHEAD,document);
  const after=await inspect({createdBy,editorId:request.editorId});
  pilotAssert(after.status==='WRITE_AHEAD_ONLY'&&
   after.evidence.ahead.receipt.sha256===receipt.sha256&&
   after.evidence.checkpointReceipt.sha256===target.checkpointSha256&&
   pilotStable(after.evidence.ahead.document)===pilotStable(document),
   'V1 pilot: bizonytalan elonaplo; Monday-iras tiltva.');
  return after.evidence.ahead;
 }
 async function saveResult({createdBy,result}={}){
  pilotAssert(!resultAttempted,'V1 pilot: az eredmenymentes nem ismetelheto.');resultAttempted=true;
  const initial=await inspect({createdBy,editorId:result?.editorId});
  pilotAssert(initial.status==='WRITE_AHEAD_ONLY','V1 pilot: hianyzo elonaplo vagy mar letezo eredmeny.');
  // Validate every result claim before any Graph write. The temporary local
  // proof below only runs pure validation; it is never sent to Monday.
  const candidate={document:structuredClone(result),receipt:{name:PILOT_RESULT,
   id:'validation-only',eTag:'validation-only',path:'Projects/'+PILOT_BOARD+'/Sync-Status/'+PILOT_RESULT,
   sha256:await pilotFileSha(result),verification:'content-sha256-and-etag'}};
  await inspectPilotEvidence({...initial.evidence,result:candidate},result.editorId,now().getTime());
  check();const saved=await createSync(PILOT_RESULT,result);
  const after=await inspect({createdBy,editorId:result.editorId});
  pilotAssert(after.evidence.result?.receipt.sha256===saved.sha256&&
   after.evidence.ahead.receipt.sha256===initial.evidence.ahead.receipt.sha256,
   'V1 pilot: nem igazolt az eredmenynaplo.');
  return after.evidence.result;
 }
 return Object.freeze({inspect,writeAhead,saveResult});
}
