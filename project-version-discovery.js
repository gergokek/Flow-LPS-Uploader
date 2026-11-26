// Read-only discovery: storage adapters enumerate ALL known session versions,
// version inspectors validate immutable receipts and board readbacks. The
// resolver then decides whether to resume, finalize, recover or start next.
// Listing folder names alone NEVER proves a version is complete or active.
import {resolvePlanningState} from './project-version-resolver.js';

const ok=(x,m)=>{if(!x)throw Error(m);};
export function createProjectVersionDiscovery({boardId,listVersions,
 inspectVersion,inspectV0,inspectBoard,check=()=>{}}={}){
 ok(typeof boardId==='string'&&/^\d{5,20}$/.test(boardId)&&
  [listVersions,inspectVersion,inspectV0,inspectBoard,check]
   .every(fn=>typeof fn==='function'),'Invalid version discovery dependencies.');
 async function inspect(){
  check();const [catalog,v0,board]=await Promise.all([
   listVersions(),inspectV0(),inspectBoard()]);check();
  ok(catalog?.complete===true&&Array.isArray(catalog.versions),
    'SharePoint version enumeration incomplete.');
  const ids=catalog.versions;
  ok(ids.every(v=>Number.isSafeInteger(v)&&v>=1&&v<=9999)&&
   new Set(ids).size===ids.length,'Invalid or duplicate SharePoint versions.');
  const ordered=[...ids].sort((a,b)=>a-b);
  ok(ordered.every((v,i)=>v===i+1),
   'Version gap detected; migration/cleanup must be reviewed.');
  const versions=[];
  for(const v of ordered){
   check();
   const proof=await inspectVersion(v);check();
   ok(proof?.planVersion===v,'Version inspector returned a different plan.');
   versions.push(proof);
  }
  const decision=resolvePlanningState({boardId,approvedV0:v0,versions,
   catalogComplete:true,boardVerified:board?.verified===true});
  return Object.freeze({...decision,boardId,catalogVersionCount:ordered.length});
 }
 return Object.freeze({inspect});
}
