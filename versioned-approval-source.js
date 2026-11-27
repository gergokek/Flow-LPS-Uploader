// Independent read-only V3 approval source. Never re-opens the DRAFT writer.
// Requires a complete V2 completion proof and *every* immutable V3 revision.
// A filename by itself is not evidence. Sync is deliberately unsupported here.
import {pilotAssert as ok,pilotHex,pilotFileSha,pilotStable as stable} from './v1-pilot-contract.js';
import {versionFilePath,draftFileName,lifecycleFileName} from './version-workspace-layout.js';
import {isVersionedPlan,draftRevisionPattern,syncStepPattern} from './versioned-cycle-version.js';
import {successorNames} from './version-successor-contract.js';
import {inspectVersionedApprovalSource} from './versioned-approval-sync-contract.js';

const copy=x=>structuredClone(x);
const catalog=items=>stable(items.map(({name,id,eTag})=>({name,id,eTag}))
 .sort((a,b)=>a.name.localeCompare(b.name)));
export function createVersionedApprovalSource({version=3,inspectV2,inspectSource=inspectV2,read,list,
 now=()=>new Date(),check=()=>{}}={}){
 ok(isVersionedPlan(version),'Invalid versioned approval source.');
 for(const fn of [inspectSource,read,list,now,check])
  ok(typeof fn==='function','Nem teljes a V3 jovahagyasi forras ellenorzo.');
 const n=successorNames(version),boardId='5107075373';
 const revPattern=draftRevisionPattern(version),stepPattern=syncStepPattern(version);
 const guard=()=>check();
 const path=(kind,name)=>versionFilePath({boardId,version,kind,name});
 async function inspect({editorId,createdBy}={}){
  guard();
  ok(/^\d+$/.test(editorId||'')&&typeof createdBy==='string'&&createdBy.length>0,
   'Bejelentkezett szerkeszto es Microsoft-fiok szukseges.');
  const predecessor=await inspectSource({editorId,createdBy});guard();
  const folders=[n.layout.session,n.layout.drafts,n.layout.approved,n.layout.sync];
  const initial=await Promise.all(folders.map(folder=>list(folder)));guard();
  ok(initial.every(Array.isArray),'A V3 SharePoint mappak listaja nem teljes.');
  for(const entries of initial){
   ok(entries.every(item=>item?.name&&item.id&&item.eTag)&&
    new Set(entries.map(x=>x.name)).size===entries.length&&
    new Set(entries.map(x=>x.id)).size===entries.length,
    'Duplikalt vagy ervenytelen V3 SharePoint metadata.');
  }
  const [sessions,drafts,approved,sync]=initial;
  const allowedSessions=new Set([n.manifest,n.claim,
   lifecycleFileName(version,'freeze'),lifecycleFileName(version,'approval-receipt')]);
  ok(sessions.every(x=>allowedSessions.has(x.name))&&
   drafts.every(x=>x.name===n.baseline||revPattern.test(x.name))&&
   approved.every(x=>x.name===lifecycleFileName(version,'approved'))&&
   sync.every(x=>x.name===lifecycleFileName(version,'completion')||
    stepPattern.test(x.name)),
   'Nem vart V3 fajl vagy szinkronnaplo. Ellenorzes tiltva.');
  const revs=drafts.filter(x=>x.name!==n.baseline)
   .sort((a,b)=>a.name.localeCompare(b.name));
  ok(revs.length<=1000&&revs.every((item,i)=>item.name===draftFileName(version,i+1)),
   'Hianyzo V3 DRAFT revizio.');
  const known=[new Map(sessions.map(x=>[x.name,x])),
   new Map(drafts.map(x=>[x.name,x]))];
  const pair=async(kind,name)=>{
   const i=kind==='session'?0:1,listed=known[i].get(name);
   const location=path(kind,name),file=await read(location);guard();
   if(!listed&&!file)return null;
   ok(listed&&file&&listed.id===file.id&&listed.eTag===file.eTag&&
    listed.name===file.name&&pilotHex(file.sha256)&&
    file.value&&await pilotFileSha(file.value)===file.sha256,
    'Hianyzo, modositott vagy serult V3 DRAFT/Session: '+name);
   return {document:copy(file.value),receipt:{
    name:file.name,id:file.id,eTag:file.eTag,path:location,
    sha256:file.sha256,verification:'content-sha256-and-etag'}};
  };
  const [manifest,claim,baseline]=await Promise.all([
   pair('session',n.manifest),pair('session',n.claim),
   pair('drafts',n.baseline)]);
  const revisions=[];
  for(let i=0;i<revs.length;i+=4){
   revisions.push(...await Promise.all(revs.slice(i,i+4)
    .map(item=>pair('drafts',item.name))));
  }
  const final=await Promise.all(folders.map(folder=>list(folder)));guard();
  ok(initial.every((entries,i)=>catalog(entries)===catalog(final[i])),
   'A V3 SharePoint fajlallapot olvasas kozben megvaltozott.');
  const artifacts={manifest,claim,baseline,revisions};
  // This verifies Approved V2 + the full V2 journal, and every V3 byte/receipt.
  // The independently implemented approval storage inspects freeze/Approved
  // afterward; those files may exist but are never trusted by this method.
  return inspectVersionedApprovalSource({predecessor,artifacts,
   planVersion:version,editorId,createdBy,now:now().getTime()});
 }
 return Object.freeze({inspect});
}
