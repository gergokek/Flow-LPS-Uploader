// A single project has one immutable session claim. The claim is not a lease:
// it must not be reused, silently expired, or auto-deleted on a network error.
export const BASELINE_NAME='draft-v1.json';
export const ACTIVE_NAME='active-session.json';
export const V0_NAME='approved-v0.json';
export const MAX_DRAFT_BYTES=5_000_000;
export const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':
 v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':
 JSON.stringify(v??null);
export const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const sha256=async data=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
export const fingerprint=base=>stable({id:base.id,workspaceId:base.workspaceId,
 columns:base.columns,groups:base.groups,
 tasks:base.tasks.map(({updatedAt,...t})=>t).sort((a,b)=>a.id.localeCompare(b.id))});
export const revisionName=revision=>{
 if(!Number.isSafeInteger(revision)||revision<0||revision>999999)
  throw Error('Ervenytelen DRAFT revizio.');
 return revision===0?BASELINE_NAME:'draft-v1-r'+String(revision).padStart(6,'0')+'.json';
};
const validBoard=b=>typeof b==='string'&&/^\d{5,20}$/.test(b);
const validId=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const requireValid=(condition,message)=>{if(!condition)throw Error(message);};

export function inspectV0(value,boardId){
 const base=value?.plan?.base,working=value?.plan?.working;
 requireValid(validBoard(boardId)&&value?.schemaVersion===1&&
  value.format==='flow-lps-approved-plan'&&value.status==='APPROVED'&&
  value.isApprovedPlan===true&&value.boardId===boardId&&
  value.syncStatus==='NOT_STARTED'&&value.mondaySyncAllowed===false&&
  value.draftVersion===0&&base?.id===boardId&&
  Array.isArray(base.tasks)&&base.tasks.length>0&&
  Array.isArray(base.columns)&&Array.isArray(base.groups)&&
  Array.isArray(working)&&working.length===base.tasks.length&&
  stable(working)===stable(base.tasks)&&
  value.sourceFingerprint===fingerprint(base),
  'A manuálisan feltöltött V0 nem teljes, módosítatlan Approved Plan.');
 const ids=base.tasks.map(t=>t.id);
 requireValid(ids.every(t=>typeof t==='string'&&/^\d+$/.test(t))&&
  new Set(ids).size===ids.length,'A V0 feladatainak azonosítói érvénytelenek.');
 return structuredClone(base);
}
export function newSessionClaim({boardId,sessionId,approvedV0Sha256,createdBy,createdAt}){
 requireValid(validBoard(boardId)&&validId(sessionId)&&hex(approvedV0Sha256)&&
  typeof createdBy==='string'&&createdBy.length>0&&
  Number.isFinite(Date.parse(createdAt)),
  'A DRAFT-munkamenet azonosítói vagy forrása érvénytelen.');
 return {schemaVersion:1,format:'mflow-single-draft-session',
  status:'ACTIVE',boardId,sessionId,planVersion:1,
  approvedV0Sha256,createdBy,createdAt,
  baselineFile:BASELINE_NAME,mondayWrites:0};
}
export function makeBaseline({v0,claim}){
 const base=inspectV0(v0,claim.boardId);
 const s={schemaVersion:1,format:'flow-lps-draft',status:'DRAFT',
  isApprovedPlan:false,boardId:claim.boardId,
  source:fingerprint(base),version:0,base,working:structuredClone(base.tasks),
  history:[],
  session:{sessionId:claim.sessionId,planVersion:1,revision:0,
   approvedV0Sha256:claim.approvedV0Sha256,parentSha256:null}};
 return s;
}
export function inspectRevision(draft,claim,revision,parentSha256){
 const s=draft?.session;
 requireValid(claim?.format==='mflow-single-draft-session'&&
  claim.status==='ACTIVE'&&claim.boardId===draft?.boardId&&
  claim.planVersion===1&&validId(claim.sessionId)&&hex(claim.approvedV0Sha256)&&
  draft.schemaVersion===1&&draft.format==='flow-lps-draft'&&
  draft.status==='DRAFT'&&draft.isApprovedPlan===false&&
  draft.source===fingerprint(draft.base)&&
  draft.base?.id===claim.boardId&&
  Array.isArray(draft.base.tasks)&&Array.isArray(draft.working)&&
  draft.working.length===draft.base.tasks.length&&
  new Set(draft.working.map(t=>t.id)).size===draft.base.tasks.length&&
  draft.working.every(t=>draft.base.tasks.some(x=>x.id===t.id))&&
  draft.version===revision&&Array.isArray(draft.history)&&
  draft.history.length===revision&&
  s?.sessionId===claim.sessionId&&s.planVersion===1&&
  s.revision===revision&&s.approvedV0Sha256===claim.approvedV0Sha256&&
  s.parentSha256===(parentSha256??null),
  'A DRAFT-verzió vagy az előző állapot SHA-256 kapcsolata érvénytelen.');
 return true;
}
export function makeNextDraft({previous,claim,previousSha256,updated}){
 requireValid(hex(previousSha256)&&updated?.version===previous?.version+1,
  'A következő módosítás nem folyamatos revízió.');
 inspectRevision(previous,claim,previous.version,previous.session?.parentSha256);
 requireValid(updated?.source===previous.source&&
  stable(updated.base)===stable(previous.base)&&
  Array.isArray(updated.history)&&updated.history.length===updated.version&&
  stable(updated.history.slice(0,-1))===stable(previous.history),
  'A DRAFT kiinduló állapotát vagy előzményét megváltoztatták.');
 const result=structuredClone(updated);
 result.session={sessionId:claim.sessionId,planVersion:1,
  revision:updated.version,approvedV0Sha256:claim.approvedV0Sha256,
  parentSha256:previousSha256};
 inspectRevision(result,claim,result.version,previousSha256);
 return result;
}
