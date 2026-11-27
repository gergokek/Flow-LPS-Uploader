// V3 TEST successor session storage, create-only with verified restart.
// All file operations are injected; this module cannot call Monday/Graph itself.
import {pilotAssert as ok,pilotStable as stable,pilotHex,pilotFileSha,pilotUuid,pilotFingerprint}
 from './v1-pilot-contract.js';
import {isVersionedPlan} from './versioned-cycle-version.js';
import {versionFilePath,draftFileName,lifecycleFileName} from './version-workspace-layout.js';
import {inspectPredecessor,successorNames,makeSuccessorClaim,makeSuccessorManifest,
 makeSuccessorBaseline,inspectSuccessorArtifacts,makeNextSuccessorDraft}
 from './version-successor-contract.js';

const clone=x=>structuredClone(x);
const namespaced=(model,kind,name)=>versionFilePath({
 boardId:model.boardId,version:model.version,kind,name});
const wrap=(file,path)=>{
 if(!file)return null;
 ok(file.id&&file.name&&file.eTag&&pilotHex(file.sha256)&&
  path.endsWith('/'+file.name),'Hibas SharePoint fajlmetadata.');
 return {document:clone(file.value),receipt:{id:file.id,name:file.name,eTag:file.eTag,
  sha256:file.sha256,path,verification:'content-sha256-and-etag'}};
};
const catalog=files=>stable(files.map(f=>({id:f.id,name:f.name,eTag:f.eTag}))
 .sort((a,b)=>a.name.localeCompare(b.name)));

// The predecessor inspector validates Approved V2, its complete immutable
// sync journal and terminal receipt. V4+ cannot be enabled without an equivalent
// successor verifier, even though their storage paths are generic already.
export function createVersionedDraftStore({version=3,inspectSource,read,list,create,
 ensureFolders,readBoard,sourceVerifier=inspectPredecessor,
 now=()=>new Date(),randomUUID=()=>crypto.randomUUID(),
 check=()=>{},checkPinned=()=>{}}={}){
 for(const fn of [inspectSource,read,list,create,ensureFolders,readBoard,sourceVerifier,now,
  randomUUID,check,checkPinned])ok(typeof fn==='function','Hibas verzios tarolo fuggoseg.');
 ok(isVersionedPlan(version),'Invalid versioned DRAFT store.');
 let busy=false,blocked=false;
 const guard=()=>{check();ok(!blocked,'Bizonytalan mentes; uj kapcsolaton ujra kell ellenorizni.');};
 const entered=()=>{guard();ok(!busy,'Mar fut egy verzios munkamenet-muvelet.');busy=true;};
 const done=()=>{busy=false;};
 async function source(args){
  guard();const evidence=await inspectSource(args);guard();
  const model=await sourceVerifier({predecessor:evidence,version,
   editorId:args.editorId,createdBy:args.createdBy,now:now().getTime()});
  guard();ok(model?.version===version&&model?.boardId==='5107075373'&&
   model.source?.planVersion===version-1&&model.editorId===args.editorId&&model.createdBy===args.createdBy,
   'A verzios DRAFT forrasa masik ciklushoz tartozik.');
  return {evidence,model};
 }
 async function scan(model){
  guard();const n=successorNames(version);
  const [sessionFiles,draftFiles,approvedFiles,syncFiles]=await Promise.all([
   list(n.layout.session),list(n.layout.drafts),
   list(n.layout.approved),list(n.layout.sync)]);
  ok([sessionFiles,draftFiles,approvedFiles,syncFiles].every(Array.isArray),
   'Hibas V3 SharePoint fajllista.');
  ok(approvedFiles.length===0&&syncFiles.length===0,
   'V3 Approved/Sync fajl letezik: a DRAFT motor nem ellenorizheti, tovabblepes tiltva.');
  for(const group of [sessionFiles,draftFiles]){
   ok(new Set(group.map(f=>f.name)).size===group.length&&
    new Set(group.map(f=>f.id)).size===group.length,
    'Duplikalt verzios fajl.');
  }
  // Unknown entries fail closed. A synchronized source cannot silently ignore
  // competing V3 claims, legacy files, or an approval freeze.
  const expectedSession=new Set([n.manifest,n.claim,
   lifecycleFileName(version,'freeze'),lifecycleFileName(version,'approval-receipt'),
   lifecycleFileName(version,'closure')]);
  const allowedDraft=name=>name===n.baseline||
   new RegExp('^draft-v'+version+'-r[0-9]{6}\\.json$').test(name);
  ok(sessionFiles.every(f=>expectedSession.has(f.name))&&
    draftFiles.every(f=>allowedDraft(f.name)),
    'Ismeretlen V3 fajl; manualis ellenorzes szukseges.');
  const pair=async(kind,name)=>{
   const path=namespaced(model,kind,name);
   const file=await read(path);
   return wrap(file,path);
  };
  const [manifest,claim,baseline,freeze,approval,closure]=await Promise.all([
   pair('session',n.manifest),pair('session',n.claim),pair('drafts',n.baseline),
   pair('session',lifecycleFileName(version,'freeze')),
   pair('session',lifecycleFileName(version,'approval-receipt')),
   pair('session',lifecycleFileName(version,'closure'))]);
  const sorted=draftFiles.filter(f=>f.name!==n.baseline)
    .sort((a,b)=>a.name.localeCompare(b.name));
  ok(sorted.every((f,i)=>f.name===draftFileName(version,i+1)),
    'Hianyzo vagy valtozo V3 DRAFT-revizio.');
  const revisions=[];
  for(let i=0;i<sorted.length;i+=4){
   const group=sorted.slice(i,i+4);
   revisions.push(...await Promise.all(group.map(f=>pair('drafts',f.name))));
  }
  ok(catalog(sessionFiles)===catalog(await list(n.layout.session))&&
     catalog(draftFiles)===catalog(await list(n.layout.drafts)),
     'V3 fajllista visszaolvasas kozben megvaltozott.');
  const data={model,manifest,claim,baseline,revisions};
  const state=await inspectSuccessorArtifacts(data,now().getTime());
  // The V3 approval engine is not yet connected to this generic store.
  // A freeze or approval artifact means no new draft changes are permitted.
  return {...data,...state,
   status:(freeze||approval||closure)?'APPROVAL_FROZEN':state.status,
   hasFreeze:!!freeze,hasApproval:!!approval,
   hasClosure:!!closure,planVersion:version,taskCount:model.taskCount,
   mondayWrites:0};
 }
 async function inspect(args){
  entered();
  try{
   const {model}=await source(args),s=await scan(model);
   return clone({...s,model:undefined,readOnly:true});
  }finally{done();}
 }
 async function checkBoard(args,m){
  const at=Date.parse(args.boardVerifiedAt),t=now().getTime();
  ok(args.editorId===m.editorId&&args.createdBy===m.createdBy&&
   args.expectedPredecessorSha256===m.source.completionSha256&&
   args.boardFingerprint===m.fingerprint&&Number.isFinite(at)&&at<=t+5000&&
   t-at<=120000,'Nincs friss, egyezo board- es V2 nyugtaigazolas.');
  const board=await readBoard(args);guard();
  ok(pilotFingerprint(board)===m.fingerprint,
   'Az aktualis TEST board elter a lezart V2 vegallapottol.');
 }
 async function write(model,kind,name,document){
  guard();const path=namespaced(model,kind,name);
  const receipt=await create(path,clone(document));
  ok(receipt?.name===name&&receipt?.path===path&&
   receipt.sha256===await pilotFileSha(document)&&receipt.id&&receipt.eTag,
   'Az uj V3 fajl visszaellenorzese sikertelen.');
  return {document:clone(document),receipt:clone(receipt)};
 }
 async function begin(args){
  entered();
  try{
   ok(args.userConfirmed===true&&pilotUuid(args.executionId),
    'V3 inditas nincs kifejezetten megerositve.');
   let {model}=await source(args);
   await checkBoard(args,model);
   await checkPinned(args,model);
   let report=await scan(model);
   ok(!report.hasFreeze&&!report.hasApproval&&!report.hasClosure,
    'V3 jo vahagyas vagy lezaras alatt; DRAFT inditas tiltva.');
   if(report.status==='ACTIVE')return clone({...report,model:undefined,readOnly:false});
   const n=successorNames(version);
   // Folders can already exist, but a folder alone never allocates a session.
   await ensureFolders(model.boardId,version);guard();
   const fresh=await source(args);
   ok(stable(fresh.model.source)===stable(model.source)&&
     fresh.model.fingerprint===model.fingerprint,
     'A V2 elozmeny megvaltozott.');
   model=fresh.model;await checkBoard(args,model);
   await checkPinned(args,model);
   report=await scan(model);
   let claim=report.claim,manifest=report.manifest;
   const createdAt=manifest?.document.createdAt||now().toISOString();
   const sessionId=manifest?.document.sessionId||randomUUID();
   if(!manifest){
    const doc=makeSuccessorClaim(model,{sessionId,createdAt});
    manifest=await write(model,'session',n.manifest,makeSuccessorManifest(model,doc));
   }else{
    ok(manifest.document.planVersion===version&&
      manifest.document.sourceCompletionSha256===model.source.completionSha256&&
      manifest.document.approvedPredecessorSha256===model.source.approvedSha256&&
      manifest.document.predecessorBoardSha256===model.source.completionBoardSha256&&
      manifest.document.createdBy===model.createdBy&&
      manifest.document.editorId===model.editorId,
      'V3 manifest nem igazolt V2 elozmenybol szarmazik.');
   }
   if(!claim){
    const doc=makeSuccessorClaim(model,{sessionId,createdAt});
    ok(stable(manifest.document)===stable(makeSuccessorManifest(model,doc)),
      'Eltero vagy megszakadt V3 session.');
    claim=await write(model,'session',n.claim,doc);
   }else{
    ok(claim.document.sessionId===sessionId,
      'V3 session ID megvaltozott.');
   }
   if(!report.baseline){
    await checkPinned(args,model);await checkBoard(args,model);
    await write(model,'drafts',n.baseline,makeSuccessorBaseline(model,claim.document));
   }
   const verified=await scan(model);
   ok(verified.status==='ACTIVE'&&verified.claim.document.sessionId===sessionId,
    'A V3 munkamenet letrehozasa nem igazolt.');
   return clone({...verified,model:undefined,readOnly:false});
  }catch(error){blocked=true;throw error;}
  finally{done();}
 }
 async function append(args){
  entered();
  try{
   const {model}=await source(args);
   await checkPinned(args,model);
   const state=await scan(model);
   ok(state.status==='ACTIVE'&&!state.hasFreeze&&!state.hasApproval&&!state.hasClosure,
    'V3 DRAFT mar zarolt vagy nem letezik.');
   const latest=state.latest,claim=state.claim.document;
   ok(claim.sessionId===args.expectedSessionId&&
    latest.receipt.sha256===args.expectedParentSha256,
    'Idokozben masik V3 DRAFT mentes tortent.');
   const doc=makeNextSuccessorDraft(latest.document,args.updatedDraft,
    model,claim,args.expectedParentSha256);
   await checkPinned(args,model);
   const reread=await scan(model);
   ok(reread.status==='ACTIVE'&&!reread.hasFreeze&&
    reread.latest.receipt.sha256===args.expectedParentSha256,
    'V3 DRAFT kozben megvaltozott.');
   const pair=await write(model,'drafts',draftFileName(version,doc.version),doc);
   const after=await scan(model);
   ok(after.revision===doc.version&&after.latest.receipt.sha256===pair.receipt.sha256,
    'A V3 revizio mentese nem igazolt.');
   return {status:'SAVED',boardId:model.boardId,planVersion:version,revision:doc.version,
    versionLabel:'V'+version+'.'+doc.version,sessionId:claim.sessionId,
    draft:doc,receipt:pair.receipt,mondayWrites:0};
  }catch(error){blocked=true;throw error;}
  finally{done();}
 }
 return Object.freeze({inspect,begin,append});
}
