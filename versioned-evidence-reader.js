// Read-only raw SharePoint evidence for one configured version. A file name
// never becomes a verified lifecycle state; the lineage contract checks bytes,
// relationships, identities and every journal entry afterward.
import {pilotAssert as ok,pilotHex,pilotFileSha,pilotStable as stable}
 from './v1-pilot-contract.js';
import {isVersionedPlan,draftRevisionPattern,syncStepPattern}
 from './versioned-cycle-version.js';
import {versionLayout,versionFilePath,draftFileName,lifecycleFileName}
 from './version-workspace-layout.js';
const boardId='5107075373',clone=x=>structuredClone(x);
const catalog=items=>stable(items.map(({name,id,eTag})=>({name,id,eTag}))
 .sort((a,b)=>a.name.localeCompare(b.name)));
export async function readVersionedEvidence({
 version,read,list,check=()=>{},includeFinalization=true
}={}){
 ok(isVersionedPlan(version)&&[read,list,check].every(fn=>typeof fn==='function'),
  'Invalid versioned evidence reader.');
 const label='V'+version,layout=versionLayout(boardId,version);
 const kinds=['session','drafts','approved','sync'];
 const first=await Promise.all(kinds.map(kind=>list(layout[kind])));check();
 ok(first.every(Array.isArray),'A '+label+' SharePoint mappak listaja nem teljes.');
 const ids=new Set();
 for(const entries of first){
  const names=new Set();
  for(const item of entries){
   ok(item?.name&&item.id&&item.eTag&&!names.has(item.name)&&!ids.has(item.id),
    'Duplikalt vagy ervenytelen '+label+' SharePoint metadata.');
   names.add(item.name);ids.add(item.id);
  }
 }
 const [sessions,drafts,approved,sync]=first;
 const manifestName='version-info.json',claimName=lifecycleFileName(version,'claim'),
  baselineName=draftFileName(version),freezeName=lifecycleFileName(version,'freeze'),
  approvalName=lifecycleFileName(version,'approval-receipt'),
  approvedName=lifecycleFileName(version,'approved'),
  finalName=lifecycleFileName(version,'completion');
 const revPattern=draftRevisionPattern(version),stepPattern=syncStepPattern(version);
 const allowed=new Set([manifestName,claimName,freezeName,approvalName]);
 ok(sessions.every(f=>allowed.has(f.name))&&
    drafts.every(f=>f.name===baselineName||revPattern.test(f.name))&&
    approved.every(f=>f.name===approvedName)&&
    sync.every(f=>f.name===finalName||stepPattern.test(f.name)),
  'Nem vart '+label+' fajl vagy szinkronnaplo. Ellenorzes tiltva.');
 const revisionFiles=drafts.filter(f=>f.name!==baselineName).sort((a,b)=>a.name.localeCompare(b.name));
 ok(revisionFiles.length<=1000&&revisionFiles.every((f,i)=>f.name===draftFileName(version,i+1)),
  'Hianyzo '+label+' DRAFT revizio.');
 ok(sync.length<=20001,'Excessive sync journal size.');
 const maps=Object.fromEntries(kinds.map((kind,i)=>[kind,new Map(first[i].map(f=>[f.name,f]))]));
 const pair=async(kind,name)=>{
  check();
  const listed=maps[kind].get(name),p=versionFilePath({boardId,version,kind,name});
  const file=await read(p);check();
  if(!listed&&!file)return null;
  ok(listed&&file&&listed.id===file.id&&listed.eTag===file.eTag&&listed.name===file.name&&
   pilotHex(file.sha256)&&file.value&&await pilotFileSha(file.value)===file.sha256,
   'Hianyzo, modositott vagy serult '+label+' fajl: '+name);
  return {document:clone(file.value),receipt:{name:file.name,id:file.id,eTag:file.eTag,
   path:p,sha256:file.sha256,verification:'content-sha256-and-etag'}};
 };
 const [manifest,claim,baseline]=await Promise.all([
  pair('session',manifestName),pair('session',claimName),pair('drafts',baselineName)]);
 const revisions=[];
 for(let i=0;i<revisionFiles.length;i+=4)
  revisions.push(...await Promise.all(revisionFiles.slice(i,i+4).map(f=>pair('drafts',f.name))));
 const result={planVersion:version,artifacts:{manifest,claim,baseline,revisions},
  hasFinalization:maps.session.has(freezeName)||maps.session.has(approvalName)||
   approved.length>0||sync.length>0,readOnly:true,mondayWrites:0};
 if(includeFinalization){
  const [freeze,approvedPlan,approval,final]=await Promise.all([
   pair('session',freezeName),pair('approved',approvedName),
   pair('session',approvalName),pair('sync',finalName)]);
  const rows=new Map(),journal=sync.filter(f=>f.name!==finalName);
  for(let i=0;i<journal.length;i+=4){
   const parts=await Promise.all(journal.slice(i,i+4).map(async f=>({name:f.name,part:await pair('sync',f.name)})));
   for(const {name,part} of parts){
    const match=stepPattern.exec(name),step=Number(match[1]),kind=match[2];
    ok(step>0&&name===lifecycleFileName(version,kind,step),'Invalid journal step.');
    const row=rows.get(step)||{step,ahead:null,result:null};
    ok(!row[kind],'Duplicate journal entry.');row[kind]=part;rows.set(step,row);
   }
  }
  Object.assign(result,{freeze,approved:approvedPlan,approval,
   records:[...rows.values()].sort((a,b)=>a.step-b.step),final});
 }
 const last=await Promise.all(kinds.map(kind=>list(layout[kind])));check();
 ok(last.every(Array.isArray)&&first.every((entries,i)=>catalog(entries)===catalog(last[i])),
  'A '+label+' SharePoint fajlallapot olvasas kozben megvaltozott.');
 return result;
}
