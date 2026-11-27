// C3: connection-scoped Vn stores. Version selection is internal, not an RPC
// authorization. The caller must keep the existing V3 browser gate until the
// dynamic consent, bridge and editor routes have been independently verified.
import {isVersionedPlan} from './versioned-cycle-version.js';
import {createVersionedProjectReader} from './versioned-project-reader.js';
import {createVersionedDraftStore} from './versioned-draft-storage.js';
import {createVersionedApprovalSource} from './versioned-approval-source.js';
import {createVersionedApprovalStore} from './versioned-approval-storage.js';
import {createVersionedSyncStore} from './versioned-sync-storage.js';
import {lifecycleFileName} from './version-workspace-layout.js';

const ok=(v,m)=>{if(!v)throw Error(m);};
export function createVersionedStoreFactory({graphForVersion,inspectLegacyV2,inspectCatalog,
 check=()=>{},now=()=>new Date(),randomUUID=()=>crypto.randomUUID()}={}){
 ok([graphForVersion,inspectLegacyV2,inspectCatalog,check,now,randomUUID].every(
  fn=>typeof fn==='function'),'Invalid Vn store factory dependencies.');
 const graphs=new Map(),stores=new Map();
 function graph(version){
  check();ok(isVersionedPlan(version),'Invalid Vn store version.');
  if(!graphs.has(version)){
   const g=graphForVersion(version);
   ok(g&&[g.read,g.list,g.create,g.ensureFolders].every(fn=>typeof fn==='function'),
    'Invalid version-pinned Graph adapter.');
   graphs.set(version,g);
  }
  return graphs.get(version);
 }
 const reader=createVersionedProjectReader({inspectLegacyV2,inspectCatalog,now,check,
  graphForVersion:version=>{const g=graph(version);return {read:g.read,list:g.list};}});
 async function predecessor(version,args){
  check();
  // Preserve the deployed V3 historical source and its exact artifact format.
  const evidence=version===3?await inspectLegacyV2(args):
   (await reader.completedPredecessor({...args,version})).evidence;
  check();return evidence;
 }
 async function pinPredecessor(version,args,model){
  check();
  ok(model?.version===version&&args?.createdBy===model.createdBy&&
   args?.editorId===model.editorId,'Vn source identity or version changed.');
  const source=version===3?await inspectLegacyV2(args):
   (await reader.completedPredecessor({...args,version})).model;
  check();
  const approved=version===3?source?.approved?.receipt?.sha256:source?.source?.approvedSha256;
  const completed=version===3?source?.final?.receipt?.sha256:source?.source?.completionSha256;
  ok(approved&&completed&&approved===model.source.approvedSha256&&
   completed===model.source.completionSha256,'Vn predecessor receipt changed.');
 }
 function forVersion(version){
  check();ok(isVersionedPlan(version),'Invalid Vn store version.');
  // Reuse one instance per connection/version: an uncertain write must not
  // be cleared by simply asking the factory for the same version again.
  if(stores.has(version))return stores.get(version);
  const g=graph(version),inspectSource=args=>predecessor(version,args);
  const common={version,read:g.read,list:g.list,create:g.create,check,now,
   readBoard:async args=>args.boardSnapshot};
  const draft=createVersionedDraftStore({...common,inspectSource,
   ensureFolders:g.ensureFolders,randomUUID,checkPinned:(args,m)=>pinPredecessor(version,args,m)});
  const source=createVersionedApprovalSource({version,inspectSource,read:g.read,list:g.list,now,check});
  const checkPinned=async(args,m)=>{
   await pinPredecessor(version,args,m);
   for(const [folder,name,sha] of [
    [m.names.layout.session,'version-info.json',m.manifestSha256],
    [m.names.layout.session,lifecycleFileName(version,'claim'),m.claimSha256],
    [m.names.layout.drafts,m.draftReceipt.name,m.sourceDraftSha256]]){
    const f=await g.read(folder+'/'+name);check();
    ok(f?.sha256===sha&&f.id&&f.eTag,'Vn source artifact changed.');
   }
  };
  const finalization={...common,inspectModel:args=>source.inspect(args),checkPinned};
  const result=Object.freeze({version,draft,approval:createVersionedApprovalStore(finalization),
   sync:createVersionedSyncStore(finalization)});
  stores.set(version,result);return result;
 }
 return Object.freeze({forVersion,inspectCurrent:reader.inspectCurrent});
}
