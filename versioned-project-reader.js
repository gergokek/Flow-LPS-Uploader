// Generalized read-only project resolver for the TEST V2 historical root.
// Reads actual immutable per-version files through a version-pinned Graph
// adapter. No caller-supplied "completed" model, no mutation or authorization.
import {pilotAssert as ok,pilotSha,pilotStable,pilotHex}
 from './v1-pilot-contract.js';
import {inspectLegacyV2Predecessor,inspectSuccessorArtifacts}
 from './versioned-draft-contract.js';
import {deriveCompletedSuccessor,inspectVersionedPredecessor}
 from './versioned-lineage-contract.js';
import {buildVersionedApprovalModelFromArtifacts,inspectVersionedApprovalState}
 from './versioned-approval-core.js';
import {inspectVersionedSyncCycle} from './versioned-sync-contract.js';
import {completedSyncStatus,isVersionedPlan} from './versioned-cycle-version.js';
import {readVersionedEvidence} from './versioned-evidence-reader.js';
const clone=x=>structuredClone(x);
export function createVersionedProjectReader({
 inspectLegacyV2,graphForVersion,inspectCatalog,now=()=>new Date(),check=()=>{}
}={}){
 ok([inspectLegacyV2,graphForVersion,inspectCatalog,now,check].every(fn=>typeof fn==='function'),
  'Invalid Vn project reader dependencies.');
 async function catalog(){
  check();const c=await inspectCatalog();check();
  ok(c?.complete===true&&Array.isArray(c.versions)&&c.versions.length>=2&&
    c.versions.length<=9999&&c.versions.every((v,i)=>v===i+1)&&
    Array.isArray(c.preparedFolders||[])&&
    (c.preparedFolders||[]).every(isVersionedPlan)&&
    new Set(c.preparedFolders||[]).size===(c.preparedFolders||[]).length&&
    (c.preparedFolders||[]).every(v=>!c.versions.includes(v)),
   'The complete, contiguous version catalog is required.');
  return c;
 }
 async function stableCatalog(first){
  const last=await catalog();
  ok(pilotStable([first.versions,first.preparedFolders||[]])===
     pilotStable([last.versions,last.preparedFolders||[]]),
   'The project version catalog changed during inspection.');
 }
 async function root(args){
  const first=await catalog();
  const legacyV2=await inspectLegacyV2({editorId:args.editorId,createdBy:args.createdBy});check();
  const model=await inspectLegacyV2Predecessor({predecessor:legacyV2,version:3,
   editorId:args.editorId,createdBy:args.createdBy,now:now().getTime()});
  return {first,legacyV2,model};
 }
 async function readCycle(version){
  const graph=await graphForVersion(version);check();
  ok(graph&&typeof graph.read==='function'&&typeof graph.list==='function',
   'No read-only evidence adapter for V'+version+'.');
  return readVersionedEvidence({version,read:graph.read,list:graph.list,check});
 }
 async function completedPredecessor({version,editorId,createdBy}={}){
  ok(isVersionedPlan(version),'Invalid target version.');
  const {first,legacyV2}=await root({editorId,createdBy});
  ok(first.versions.length>=version-1,'The predecessor version does not exist.');
  const cycles=[];
  for(let v=3;v<version;v++)cycles.push(await readCycle(v));
  const evidence=version===3?legacyV2:{legacyV2,cycles};
  const model=await inspectVersionedPredecessor({predecessor:evidence,version,editorId,createdBy,now:now().getTime()});
  await stableCatalog(first);
  return {evidence:clone(evidence),model:clone(model),readOnly:true,mondayWrites:0};
 }
 async function inspectCurrent({editorId,createdBy,boardFingerprint}={}){
  ok(typeof boardFingerprint==='string'&&boardFingerprint.length>0,
   'A fresh complete Monday board fingerprint is required.');
  const {first,model:initial}=await root({editorId,createdBy});
  const last=first.versions.at(-1),boardSha=await pilotSha(boardFingerprint);
  let model=initial,verifiedCount=2;
  const sessions=new Set([model.source.sessionId]);
  const finish=async fields=>{
   await stableCatalog(first);
   return Object.freeze({...fields,verifiedVersionCount:verifiedCount,
    preparedFolders:[...(first.preparedFolders||[])],readOnly:true,mondayWrites:0,
    // Eligibility is not a browser permit. The application still decides
    // whether its full trigger/consent/transport exists for this version.
    startEnabled:false});
  };
  const block=(version,reason,extras={})=>finish({status:'BLOCKED',action:'MANUAL_REVIEW',
   planVersion:version,revision:null,boardMatches:false,
   predecessorCompletionSha256:model.source.completionSha256,reason,...extras});
  for(let v=3;v<=last;v++){
   const raw=await readCycle(v);check();
   const draft=await inspectSuccessorArtifacts({model,...raw.artifacts},now().getTime());
   if(draft.status!=='ACTIVE'){
    ok(v===last,'A later version follows an incomplete session.');
    return block(v,'Incomplete '+draft.status+' session; never allocate a new version.');
   }
   const sessionId=raw.artifacts.claim.document.sessionId;
   ok(!sessions.has(sessionId),'Reused session identifier.');sessions.add(sessionId);
   verifiedCount=v;
   if(!raw.hasFinalization){
    ok(v===last,'A later version follows an unapproved DRAFT.');
    const boardMatches=boardFingerprint===model.fingerprint;
    if(!boardMatches)return block(v,'The live board differs from the DRAFT source.',{
     revision:draft.revision,sessionId,latestDraftSha256:draft.latest.receipt.sha256});
    return finish({status:'ACTIVE',action:'RESUME_DRAFT',planVersion:v,
     revision:draft.revision,sessionId,latestDraftSha256:draft.latest.receipt.sha256,
     predecessorCompletionSha256:model.source.completionSha256,boardMatches:true});
   }
   const m=await buildVersionedApprovalModelFromArtifacts({model,artifacts:raw.artifacts,now:now().getTime()});
   const report={model:m,freeze:raw.freeze,approved:raw.approved,approval:raw.approval,
    records:raw.records,final:raw.final};
   const approval=await inspectVersionedApprovalState(report,now().getTime());
   if(!['READY_TO_SYNC','READY_TO_CLOSE'].includes(approval.status)){
    ok(v===last&&!raw.final&&!raw.records.length,'A later or orphan sync follows incomplete approval.');
    return block(v,'The approval is incomplete; read-only manual review is required.',{
     revision:m.revision,sessionId});
   }
   const state=await inspectVersionedSyncCycle(report,now().getTime());
   const pins={revision:m.revision,sessionId,approvedVerified:true,
    latestDraftSha256:m.sourceDraftSha256,approvedSha256:state.approvedSha256,
    approvalReceiptSha256:state.approvalReceiptSha256,
    verifiedTaskCount:state.verifiedTaskCount,remainingTaskCount:state.remainingTaskCount,
    predecessorCompletionSha256:model.source.completionSha256};
   if(state.status!==completedSyncStatus(v)){
    ok(v===last,'A later version follows incomplete sync.');
    const boardMatches=boardSha===state.expectedBoardSha256;
    if(!boardMatches||state.status==='MANUAL_REVIEW_REQUIRED')
     return block(v,'The Approved/sync evidence requires manual review.',{...pins,boardMatches});
    return finish({status:state.status,action:'CONTINUE_FINALIZATION',planVersion:v,
     boardMatches:true,...pins});
   }
   if(v===9999){
    return finish({status:state.status,action:'VERSION_LIMIT_REACHED',planVersion:v,
     boardMatches:boardSha===state.expectedBoardSha256,...pins});
   }
   model=await deriveCompletedSuccessor({report,version:v+1,editorId,createdBy,now:now().getTime()});
  }
  const boardMatches=boardFingerprint===model.fingerprint;
  if(!boardMatches)return block(model.version,'The live board differs from the completed predecessor.');
  return finish({status:'READY_TO_START',action:'START_NEXT',planVersion:model.version,
   revision:null,boardMatches:true,predecessorCompletionSha256:model.source.completionSha256,
   predecessorVersion:model.source.planVersion,previousSessionId:model.source.sessionId});
 }
 return Object.freeze({completedPredecessor,inspectCurrent});
}
