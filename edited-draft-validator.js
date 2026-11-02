const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
const fingerprint=s=>stable({id:s.id,workspaceId:s.workspaceId,columns:s.columns,groups:s.groups,tasks:s.tasks.map(({updatedAt,...t})=>t).sort((a,b)=>a.id.localeCompare(b.id))});
export async function validateEditedDraft(text,boardId){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>5_000_000)throw new Error('Invalid or oversized DRAFT');
 const d=JSON.parse(text);
 if(!/^\d+$/.test(boardId||'')||d?.schemaVersion!==1||d.format!=='flow-lps-draft'||d.status!=='DRAFT'||d.isApprovedPlan!==false||d.boardId!==boardId||d.base?.id!==boardId)throw new Error('Invalid DRAFT project or status');
 if(!Number.isSafeInteger(d.version)||d.version<1||!Array.isArray(d.history)||d.history.length!==d.version||d.history.some((h,i)=>h?.revision!==i+1||typeof h.type!=='string'))throw new Error('Invalid DRAFT revision history');
 if(d.source!==fingerprint(d.base))throw new Error('DRAFT source fingerprint differs');
 const base=d.base.tasks,working=d.working;
 if(!Array.isArray(base)||!base.length||!Array.isArray(working)||working.length!==base.length)throw new Error('Invalid DRAFT task list');
 const ids=base.map(t=>t?.id),edited=working.map(t=>t?.id);
 if(ids.some(x=>typeof x!=='string'||!/^\d+$/.test(x))||new Set(ids).size!==ids.length||edited.some(x=>!ids.includes(x))||new Set(edited).size!==ids.length)throw new Error('Invalid or duplicate task identifiers');
 const bytes=new TextEncoder().encode(text);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 return Object.freeze({boardId,version:d.version,taskCount:ids.length,sha256,bytes:bytes.length});
}
