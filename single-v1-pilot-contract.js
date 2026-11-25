// Shared V1 pilot contract. Keep byte-identical with the Monday TEST copy.
// Pure validation: no SDK, network, authentication token or side effect.
export const PILOT_BOARD='5107075373';
export const PILOT_CHECKPOINT='sync-v1-prepared.json';
export const PILOT_AHEAD='sync-v1-pilot-ahead.json';
export const PILOT_RESULT='sync-v1-pilot-result.json';
export const PILOT_FIELDS=['forecast','actual','anchor','duration','ffLag','startPre','finishPre','note','readiness','critical','week','endWeek','status','obstacles','ledger'];
export const pilotAssert=(yes,message)=>{if(!yes)throw Error(message);};
export const pilotHex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export const pilotUuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);
export function pilotStable(v){if(Array.isArray(v))return '['+v.map(pilotStable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+pilotStable(v[k])).join(',')+'}';return JSON.stringify(v??null);}
export async function pilotSha(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');}
export const pilotFileSha=value=>pilotSha(JSON.stringify(value,null,2)+'\n');
export const pilotTask=t=>{const {updatedAt,...value}=t;return value;};
export const pilotFingerprint=s=>pilotStable({id:s.id,workspaceId:s.workspaceId,columns:s.columns,groups:s.groups,tasks:s.tasks.map(pilotTask).sort((a,b)=>a.id.localeCompare(b.id))});
const path=(folder,name)=>'Projects/'+PILOT_BOARD+'/'+folder+'/'+name;
export async function checkPilotFile(document,receipt,folder,name){
 pilotAssert(receipt?.name===name&&receipt.path===path(folder,name)&&
  typeof receipt.id==='string'&&!!receipt.id&&typeof receipt.eTag==='string'&&!!receipt.eTag&&
  receipt.verification==='content-sha256-and-etag'&&pilotHex(receipt.sha256)&&
  await pilotFileSha(document)===receipt.sha256,'V1 pilot: hibas fajlazonossag vagy SHA-256: '+name);
}
export async function pilotTarget(e,editorId){
 const a=e?.approvedPlan,c=e?.checkpoint;
 await checkPilotFile(a,e?.receipt,'Approved-Plans','approved-v1.json');
 await checkPilotFile(c,e?.checkpointReceipt,'Sync-Status',PILOT_CHECKPOINT);
 pilotAssert(a?.schemaVersion===1&&a.format==='flow-lps-approved-plan'&&a.status==='APPROVED'&&
  a.isApprovedPlan===true&&a.boardId===PILOT_BOARD&&a.planVersion===1&&a.mondaySyncAllowed===false&&
  a.syncStatus==='NOT_STARTED'&&a.plan?.base?.id===PILOT_BOARD&&Array.isArray(a.plan.working)&&
  Array.isArray(a.plan.base.tasks)&&a.plan.working.length>0&&a.plan.working.length===a.plan.base.tasks.length&&
  Number.isSafeInteger(a.draftVersion)&&a.draftVersion>0&&Array.isArray(a.plan.history)&&
  a.plan.history.length===a.draftVersion&&a.plan.history.every((h,i)=>h.revision===i+1)&&
  a.sourceFingerprint===pilotFingerprint(a.plan.base)&&pilotHex(a.sourceDraft?.sha256)&&
  pilotUuid(a.finalization?.sessionId)&&/^\d+$/.test(editorId||'')&&
  a.finalization.mondayEditorIdClaim===editorId,'V1 pilot: ervenytelen Approved Plan vagy szerkeszto.');
 pilotAssert(c?.schemaVersion===1&&c.format==='mflow-approved-v1-sync-checkpoint'&&
  c.status==='PREPARED_NO_WRITES'&&c.boardId===PILOT_BOARD&&c.planVersion===1&&
  c.approvedName==='approved-v1.json'&&c.approvedSha256===e.receipt.sha256&&
  c.approvedItemId===e.receipt.id&&c.approvedETag===e.receipt.eTag&&
  c.sourceDraftSha256===a.sourceDraft.sha256&&c.sessionId===a.finalization.sessionId&&
  c.revision===a.draftVersion&&c.sourceFingerprint===a.sourceFingerprint&&
  c.mondayBoardFingerprintSha256===await pilotSha(a.sourceFingerprint)&&
  c.editorId===editorId&&c.createdBy===a.finalization.microsoftHomeAccountId&&
  pilotUuid(c.microsoftEntraObjectId)&&c.microsoftEntraObjectId===a.finalization.microsoftEntraObjectId&&
  c.mondayWrites===0&&c.mutationAttempts===0&&c.writeAuthorization==='NOT_GRANTED'&&
  c.automaticallyRetryable===false,'V1 pilot: a checkpoint nem az eredeti 0-irasos V1 allapot.');
 const ids=new Set(),changes=[];
 for(let i=0;i<a.plan.working.length;i++){
  const before=a.plan.base.tasks[i],after=a.plan.working[i];
  pilotAssert(/^\d+$/.test(after?.id||'')&&before?.id===after.id&&!ids.has(after.id),'V1 pilot: hibas feladatsorrend.');ids.add(after.id);
  const frozen=t=>Object.fromEntries(Object.entries(pilotTask(t)).filter(([k])=>!PILOT_FIELDS.includes(k)));
  pilotAssert(pilotStable(frozen(before))===pilotStable(frozen(after)),'V1 pilot: nem irhato feladatmezo valtozott.');
  const fields=Object.fromEntries(PILOT_FIELDS.filter(k=>pilotStable(before[k])!==pilotStable(after[k])).map(k=>[k,{before:before[k]??null,after:after[k]??null}]));
  if(Object.keys(fields).length)changes.push({taskId:after.id,taskName:after.name,before:structuredClone(before),after:structuredClone(after),fields});
 }
 pilotAssert(changes.length>0,'V1 pilot: nincs modositas.');
 const first=changes[0],expected={...a.plan.base,tasks:a.plan.base.tasks.map(t=>t.id===first.taskId?first.after:t)};
 return {...first,boardId:PILOT_BOARD,planVersion:1,sessionId:c.sessionId,revision:c.revision,
  editorId,createdBy:c.createdBy,microsoftEntraObjectId:c.microsoftEntraObjectId,
  approvedSha256:e.receipt.sha256,checkpointSha256:e.checkpointReceipt.sha256,
  fieldNames:Object.keys(first.fields).sort(),sourceFingerprint:a.sourceFingerprint,
  expectedFingerprint:pilotFingerprint(expected),changedTaskCount:changes.length,
  taskCount:a.plan.working.length,mutationAllowed:false};
}
function matchJournal(d,t){
 return d?.schemaVersion===1&&d.boardId===PILOT_BOARD&&d.planVersion===1&&d.taskId===t.taskId&&
  d.sessionId===t.sessionId&&d.revision===t.revision&&d.editorId===t.editorId&&
  d.microsoftEntraObjectId===t.microsoftEntraObjectId&&d.approvedSha256===t.approvedSha256&&
  d.checkpointSha256===t.checkpointSha256&&pilotUuid(d.requestId);
}
export async function inspectPilotEvidence(e,editorId,now=Date.now()){
 const target=await pilotTarget(e,editorId),a=e.ahead,r=e.result;
 pilotAssert(e.ahead!==undefined&&e.result!==undefined,'V1 pilot: hianyzik a naplok ellenorzesi eredmenye.');
 if(!a){pilotAssert(!r,'V1 pilot: arva eredmenynaplo.');return {status:'READY_FOR_PILOT',target};}
 await checkPilotFile(a.document,a.receipt,'Sync-Status',PILOT_AHEAD);
 const d=a.document;
 pilotAssert(matchJournal(d,target)&&d.format==='mflow-v1-pilot-ahead'&&d.status==='WRITE_AHEAD'&&
  d.maximumMutationAttempts===1&&d.automaticallyRetryable===false&&
  pilotStable(d.fields)===pilotStable(target.fields)&&pilotStable(d.fieldNames)===pilotStable(target.fieldNames)&&
  pilotHex(d.mutationValuesSha256)&&d.sourceBoardSha256===await pilotSha(target.sourceFingerprint)&&
  d.expectedBoardSha256===await pilotSha(target.expectedFingerprint)&&
  Number.isFinite(Date.parse(d.createdAt))&&Date.parse(d.createdAt)<=now+5000,
  'V1 pilot: hibas elonaplo; tovabbi iras tiltva.');
 if(!r)return {status:'WRITE_AHEAD_ONLY',target};
 await checkPilotFile(r.document,r.receipt,'Sync-Status',PILOT_RESULT);
 const out=r.document;
 pilotAssert(matchJournal(out,target)&&out.format==='mflow-v1-pilot-result'&&out.requestId===d.requestId&&
  out.writeAheadSha256===a.receipt.sha256&&out.mutationValuesSha256===d.mutationValuesSha256&&
  out.automaticallyRetryable===false&&[0,1].includes(out.mutationAttempts)&&
  ['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN','ABORTED_NO_WRITE'].includes(out.status)&&
  Number.isFinite(Date.parse(out.checkedAt))&&Date.parse(out.checkedAt)>=Date.parse(d.createdAt)&&
  Date.parse(out.checkedAt)<=now+5000,
  'V1 pilot: hibas eredmenynaplo; tovabbi iras tiltva.');
 if(out.status==='ITEM_READBACK_VERIFIED'){
  pilotAssert(out.mutationAttempts===1&&out.replyConfirmed===true&&out.itemReadbackMatches===true&&
   out.fullBoardReadbackMatches===true&&out.boardReadbackSha256===await pilotSha(target.expectedFingerprint)&&
   out.itemReadbackSha256===await pilotSha(pilotStable(pilotTask(target.after)))&&!out.error,
   'V1 pilot: a sikeres eredmeny nincs teljesen igazolva.');
  return {status:'PILOT_RECORDED',target};
 }
 pilotAssert(out.status!=='ABORTED_NO_WRITE'||out.mutationAttempts===0,'V1 pilot: ellentmondo irasi darabszam.');
 return {status:'MANUAL_RECONCILIATION_REQUIRED',target};
}
export function freshPilotBoard(request,target,now=Date.now()){
 const at=Date.parse(request?.boardVerifiedAt);
 pilotAssert(request?.taskId===target.taskId&&request.editorId===target.editorId&&
  request.expectedApprovedSha256===target.approvedSha256&&request.expectedCheckpointSha256===target.checkpointSha256&&
  request.expectedSessionId===target.sessionId&&request.expectedRevision===target.revision&&
  pilotUuid(request.requestId)&&pilotHex(request.mutationValuesSha256)&&
  Number.isFinite(at)&&at<=now&&now-at<=120000,
  'V1 pilot: elavult board-ellenorzes vagy eltero feladat.');
}
