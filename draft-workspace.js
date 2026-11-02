// Read-only restoration of a SharePoint DRAFT into a local browser session.
// Does not mutate Monday, SharePoint, or the uploaded file.
export function inspectStoredDraft(text,expectedBoardId){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>5_000_000)throw new Error('Hibas vagy tul nagy DRAFT fajl.');
 const draft=JSON.parse(text);
 if(!/^\d+$/.test(expectedBoardId||'')||draft?.boardId!==expectedBoardId||draft?.base?.id!==expectedBoardId)throw new Error('A munkaterv projektazonositoja elter.');
 if(draft.schemaVersion!==1||draft.format!=='flow-lps-draft'||draft.status!=='DRAFT'||draft.isApprovedPlan!==false)throw new Error('A fajl nem nem-jovahagyott Flow LPS DRAFT.');
 if(!Number.isSafeInteger(draft.version)||draft.version<0||!Array.isArray(draft.history)||draft.history.length!==draft.version)throw new Error('Hibas verzio tortenet.');
 const base=draft.base?.tasks,working=draft.working;
 if(!Array.isArray(base)||!base.length||!Array.isArray(working)||base.length!==working.length)throw new Error('Hianyos DRAFT feladatlista.');
 const ids=base.map(t=>t?.id);
 if(ids.some(x=>typeof x!=='string'||!/^\d+$/.test(x))||new Set(ids).size!==ids.length)throw new Error('Duplikalt vagy ervenytelen feladat.');
 const current=working.map(t=>t?.id);
 if(current.some(x=>!ids.includes(x))||new Set(current).size!==ids.length)throw new Error('A feladatlista megvaltozott.');
 const tasks=working.map(t=>({id:t.id,name:typeof t.name==='string'?t.name:'',forecast:t.forecast??null}));
 return Object.freeze({boardId:draft.boardId,version:draft.version,taskCount:tasks.length,tasks:Object.freeze(tasks)});
}
