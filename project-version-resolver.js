// Project-wide planning state resolver. No default "V2 -> V3" transition.
// The caller must supply a COMPLETE independently verified version catalog.
// Any invalid, missing or conflicting proof fails closed; no Graph/Monday write.
import {versionLayout} from './version-workspace-layout.js';

const STATES=new Set(['ACTIVE','START_INCOMPLETE','APPROVAL_FROZEN',
 'APPROVED_PENDING_SYNC','SYNC_IN_PROGRESS','SYNC_UNCERTAIN','SYNC_COMPLETED',
 'CLOSED','UNKNOWN']);
const safeInt=x=>Number.isSafeInteger(x)&&x>=0&&x<=9999;
const fail=reason=>Object.freeze({status:'BLOCKED',action:'MANUAL_REVIEW',
 reason,planVersion:null,nextVersion:null,readOnly:true,mondayWrites:0});
const answer=(status,action,version,reason,boardId,revision=null)=>
 Object.freeze({status,action,planVersion:version,nextVersion:action==='START_NEXT'?version:null,
 revision,reason,folder:version?versionLayout(boardId,version).versionRoot:null,
 readOnly:action!=='RESUME_DRAFT',mondayWrites:0});

export function resolvePlanningState({boardId,approvedV0,versions,
 catalogComplete,boardVerified=false}={}){
 if(typeof boardId!=='string'||!/^\d{5,20}$/.test(boardId)||
  catalogComplete!==true||!Array.isArray(versions)||versions.length>9999)
  return fail('Incomplete or invalid project version catalog.');
 if(!approvedV0||approvedV0.verified!==true||
  typeof approvedV0.sha256!=='string'||!/^[0-9a-f]{64}$/.test(approvedV0.sha256))
  return fail('Approved V0 must be verified.');
 const sorted=[...versions].sort((a,b)=>(a?.planVersion??-1)-(b?.planVersion??-1));
 if(sorted.length===0){
  if(boardVerified!==true)return fail('Current Monday board must match verified V0.');
  return answer('READY_TO_START','START_NEXT',1,'Verified V0, no planning session.',boardId);
 }
 for(let i=0;i<sorted.length;i++){
  const row=sorted[i],version=i+1;
  if(!row||row.planVersion!==version||!safeInt(row.planVersion)||
    !STATES.has(row.status)||row.verified!==true||
    typeof row.sessionId!=='string'||!/^[a-f0-9-]{36}$/i.test(row.sessionId))
   return fail('Missing, duplicate or unverified version in catalog.');
  if(version>1){
   const prior=sorted[i-1];
   if(prior.status!=='SYNC_COMPLETED'&&prior.status!=='CLOSED')
    return fail('A successor exists before predecessor completion.');
   if(row.sourceVersion!==prior.planVersion||
      row.sourceCompletionSha256!==prior.completionSha256)
    return fail('Version lineage does not match predecessor receipt.');
  }else if(row.sourceVersion!==0||row.sourceApprovedV0Sha256!==approvedV0.sha256){
   return fail('V1 lineage does not match verified Approved V0.');
  }
  if(row.status==='SYNC_COMPLETED'||row.status==='CLOSED'){
   if(typeof row.completionSha256!=='string'||
     !/^[0-9a-f]{64}$/.test(row.completionSha256)||
     row.fullBoardReadbackVerified!==true||row.remainingTaskCount!==0)
    return fail('Incomplete terminal sync evidence.');
  }
  if(row.status==='ACTIVE'&&( !safeInt(row.revision)||
    typeof row.latestDraftSha256!=='string'||
    !/^[0-9a-f]{64}$/.test(row.latestDraftSha256)))
   return fail('Active draft revisions must be fully verified.');
 }
 const latest=sorted.at(-1);
 if(latest.status==='ACTIVE')
  return answer('ACTIVE','RESUME_DRAFT',latest.planVersion,
   'Verified active DRAFT; do not allocate a new session.',boardId,latest.revision);
 if(['SYNC_COMPLETED','CLOSED'].includes(latest.status)){
  if(latest.planVersion===9999)return fail('Maximum plan version reached.');
  if(boardVerified!==true)return fail('Full Monday board must match final predecessor state.');
  return answer('READY_TO_START','START_NEXT',latest.planVersion+1,
   'Predecessor fully synchronized; new session requires consent.',boardId);
 }
 if(latest.status==='START_INCOMPLETE')
  return answer('INCOMPLETE','RECOVER_SAME_SESSION',latest.planVersion,
   'Reinspect existing manifest and session before continuing.',boardId);
 if(['APPROVAL_FROZEN','APPROVED_PENDING_SYNC','SYNC_IN_PROGRESS'].includes(latest.status))
  return answer('FINALIZING','CONTINUE_FINALIZATION',latest.planVersion,
   'Finish or verify current version; do not create successor.',boardId);
 return fail('Uncertain or unsupported current state; no automatic retry.');
}
