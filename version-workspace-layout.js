// Versioned SharePoint paths. All plan versions share one naming contract.
// Legacy V1/V2 locations are immutable; NO migration or silent fallback.
export const LEGACY_PLAN_VERSIONS=Object.freeze([1,2]);
export const VERSION_FOLDERS=Object.freeze(['Session','Drafts','Approved','Sync']);
export const VERSION_ROOT='Versions';
export const FORMAT_VERSION=1;
const requireVersion=v=>{
 if(!Number.isSafeInteger(v)||v<1||v>9999)throw Error('Invalid plan version.');
 return v;
};
export function versionFolder(v){
 requireVersion(v);return 'V'+String(v).padStart(4,'0');
}
export function versionLayout(boardId,version){
 if(typeof boardId!=='string'||!/^\d{5,20}$/.test(boardId))
  throw Error('Invalid Monday board ID.');
 requireVersion(version);
 const root='Projects/'+boardId;
 if(version<=2){
  return Object.freeze({boardId,version,legacy:true,root,
   session:root+'/Draft-Plans',drafts:root+'/Draft-Plans',
   approved:root+'/Approved-Plans',sync:root+'/Sync-Status',
   manifest:null,versionRoot:null});
 }
 const versionRoot=root+'/'+VERSION_ROOT+'/'+versionFolder(version);
 return Object.freeze({boardId,version,legacy:false,root,versionRoot,
  session:versionRoot+'/Session',drafts:versionRoot+'/Drafts',
  approved:versionRoot+'/Approved',sync:versionRoot+'/Sync',
  manifest:versionRoot+'/Session/version-info.json'});
}
export function versionFilePath({boardId,version,kind,name}){
 const l=versionLayout(boardId,version);
 if(!['session','drafts','approved','sync'].includes(kind))throw Error('Invalid file class.');
 if(typeof name!=='string'||!/^[-a-zA-Z0-9_.]{1,120}\.json$/.test(name)||
  name==='.'||name==='..'||name.includes('..'))
  throw Error('Invalid SharePoint filename.');
 return l[kind]+'/'+name;
}
export function draftFileName(version,revision=0){
 requireVersion(version);
 if(!Number.isSafeInteger(revision)||revision<0||revision>999999)
  throw Error('Invalid DRAFT revision.');
 return 'draft-v'+version+(revision?'-r'+String(revision).padStart(6,'0'):'')+'.json';
}
export function lifecycleFileName(version,kind,step){
 requireVersion(version);
 if(kind==='claim')return 'active-session-v'+version+'.json';
 if(kind==='closure')return 'session-v'+version+'-closed.json';
 if(kind==='freeze')return 'session-v'+version+'-freeze.json';
 if(kind==='approval-receipt')return 'session-v'+version+'-approved.json';
 if(kind==='approved')return 'approved-v'+version+'.json';
 if(kind==='completion')return 'sync-v'+version+'-completed.json';
 if(['ahead','result'].includes(kind)&&Number.isSafeInteger(step)&&step>=1&&step<=999999)
  return 'sync-v'+version+'-step-'+String(step).padStart(6,'0')+'-'+kind+'.json';
 throw Error('Invalid lifecycle artifact.');
}
export function versionIndex(boardId,highestVersion=2){
 if(!Number.isSafeInteger(highestVersion)||highestVersion<2||highestVersion>9999)
  throw Error('Invalid version index range.');
 return Object.freeze(Array.from({length:highestVersion},(_,i)=>versionLayout(boardId,i+1)));
}
// The manifest is created only after a verified predecessor completion receipt,
// never by folder provisioning or by inspecting old version files.
export function makeVersionInfo({boardId,version,sessionId,source,createdAt}){
 const layout=versionLayout(boardId,version);
 if(layout.legacy||typeof sessionId!=='string'||!(/^[a-f0-9-]{36}$/i).test(sessionId)||
  typeof source!=='object'||!source||source.planVersion!==version-1||
  typeof source.completionSha256!=='string'||!(/^[0-9a-f]{64}$/i).test(source.completionSha256)||
  Number.isNaN(Date.parse(createdAt)))
  throw Error('A version manifest must reference a verified predecessor.');
 return Object.freeze({schemaVersion:FORMAT_VERSION,format:'mflow-plan-version-index',
  boardId,planVersion:version,sessionId,status:'ACTIVE',
  sourcePlanVersion:source.planVersion,sourceCompletionSha256:source.completionSha256,
  createdAt,legacy:false,paths:{session:layout.session,drafts:layout.drafts,
   approved:layout.approved,sync:layout.sync},
  writesToMonday:0});
}
