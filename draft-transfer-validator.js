// Strict local validation for portable, unapproved Flow LPS transfers.
// Never executes input or interprets its contents as instructions.
export async function validateDraftTransfer(text,{expectedBoardId}={}){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>5_000_000)throw new Error('Hibas vagy 5 MB-nal nagyobb atadas.');
 const envelope=JSON.parse(text);
 if(envelope?.schemaVersion!==1||envelope?.format!=='flow-lps-draft-transfer'||envelope.status!=='DRAFT'||envelope.isApprovedPlan!==false)throw new Error('Nem DRAFT atadasi fajl.');
 if(!/^\d+$/.test(envelope.boardId)||envelope.boardId!==expectedBoardId)throw new Error('A board azonosito elter.');
 if(typeof envelope.sha256!=='string'||!/^[a-f0-9]{64}$/.test(envelope.sha256)||typeof envelope.payload!=='string')throw new Error('Hibas hash vagy tartalom.');
 const bytes=new TextEncoder().encode(envelope.payload);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==envelope.sha256)throw new Error('A DRAFT tartalma megvaltozott (SHA-256 elteres).');
 const draft=JSON.parse(envelope.payload);
 if(draft?.schemaVersion!==1||draft?.format!=='flow-lps-draft'||draft?.status!=='DRAFT'||draft?.isApprovedPlan!==false||draft.boardId!==expectedBoardId||draft.base?.id!==expectedBoardId||draft.version!==0||!Array.isArray(draft.history)||draft.history.length!==0)throw new Error('Nem ervenyes eredeti DRAFT pillanatkep.');
 if(!Array.isArray(draft.base?.tasks)||!draft.base.tasks.length||!Array.isArray(draft.working)||draft.working.length!==draft.base.tasks.length)throw new Error('Hianyos feladatlista.');
 const ids=draft.base.tasks.map(t=>t?.id),workingIds=draft.working.map(t=>t?.id);
 if(ids.some(x=>typeof x!=='string'||!/^\d+$/.test(x))||new Set(ids).size!==ids.length||workingIds.some(x=>!ids.includes(x))||new Set(workingIds).size!==ids.length)throw new Error('Idegen vagy duplikalt feladat.');
 return Object.freeze({boardId:draft.boardId,taskCount:ids.length,sha256:actual,status:'DRAFT',isApprovedPlan:false});
}
