// Isolated TEST V3 approval storage, intentionally NOT wired to a Monday writer.
// All network operations are injected. Only immutable SharePoint creates are allowed.
// An ambiguous create locks this instance; recovery must re-inspect in a new instance.
import {pilotAssert as ok,pilotFingerprint,pilotSha,pilotStable,pilotUuid}
 from './v1-pilot-contract.js';
import {versionFilePath} from './version-workspace-layout.js';
import {makeVersionedApprovalFreeze,makeVersionedApprovedPlan,
 makeVersionedApprovalReceipt,inspectVersionedApprovalState,
 requireVersionedApprovalBoard,checkVersionedApprovalFile}
 from './versioned-approval-sync-contract.js';

const clone=x=>structuredClone(x);
const index=items=>pilotStable(items.map(({name,id,eTag})=>({name,id,eTag}))
 .sort((a,b)=>a.name.localeCompare(b.name)));

export function createVersionedApprovalStore({
 inspectModel,read,list,create,readBoard,checkPinned,
 check=()=>{},now=()=>new Date()
}={}){
 for(const dependency of [inspectModel,read,list,create,readBoard,checkPinned,check,now])
  ok(typeof dependency==='function','Hianyzo verzios jovahagyasi fuggoseg.');
 let busy=false,blocked=false;
 const guard=()=>{check();ok(!blocked,'Bizonytalan verzios jovahagyas: uj ellenorzes kell.');};
 const enter=()=>{guard();ok(!busy,'Parhuzamos jovahagyasi muvelet tiltva.');busy=true;};
 const finish=()=>{busy=false;};
 const path=(m,kind,name)=>versionFilePath({boardId:m.boardId,version:m.version,kind,name});
 const pair=async(m,kind,name)=>{
  const location=path(m,kind,name);
  guard();
  const file=await read(location);guard();
  if(!file)return null;
  const receipt={name:file.name,id:file.id,eTag:file.eTag,path:location,
   sha256:file.sha256,verification:'content-sha256-and-etag'};
  const value={document:clone(file.value),receipt};
  await checkVersionedApprovalFile(value,m.boardId,m.version,kind,name);
  return value;
 };
 async function scan(model){
  guard();
  ok(model?.boardId==='5107075373'&&model?.version===3,
   'A kovetkezo verzio Approved motorja nincs igazolva.');
  const n=model.names;
  const [sessions,approvedFiles,syncFiles]=await Promise.all([
   list(n.layout.session),list(n.layout.approved),list(n.layout.sync)]);
  guard();
  ok([sessions,approvedFiles,syncFiles].every(Array.isArray),
   'Hibas SharePoint fajllista.');
  const sessionAllowed=new Set(['version-info.json','active-session-v3.json',
   n.freeze,n.approval,'session-v3-closed.json']);
  ok(sessions.every(x=>sessionAllowed.has(x.name))&&
   approvedFiles.every(x=>x.name===n.approved)&&syncFiles.length===0,
   'Ismeretlen vagy mar megkezdett V3 Approved/Sync ciklus.');
  for(const files of [sessions,approvedFiles,syncFiles])
   ok(files.every(f=>f?.name&&f?.id&&f?.eTag)&&
    new Set(files.map(f=>f.name)).size===files.length&&
    new Set(files.map(f=>f.id)).size===files.length,
    'Duplikalt vagy erdektelen SharePoint fajl.');
  const [freeze,approved,approval]=await Promise.all([
   pair(model,'session',n.freeze),pair(model,'approved',n.approved),
   pair(model,'session',n.approval)]);
  const matching=(listed,record,name)=>{
   const file=listed.find(x=>x.name===name);
   return file?record?.receipt?.id===file.id&&record.receipt.eTag===file.eTag:
    record===null;
  };
  ok(matching(sessions,freeze,n.freeze)&&
     matching(sessions,approval,n.approval)&&
     matching(approvedFiles,approved,n.approved),
   'A V3 Approved/Session lista es a tartalmi visszaolvasas elter.');
  const [s2,a2,y2]=await Promise.all([
   list(n.layout.session),list(n.layout.approved),list(n.layout.sync)]);
  guard();
  ok(index(sessions)===index(s2)&&index(approvedFiles)===index(a2)&&
   index(syncFiles)===index(y2),
   'SharePoint fajllista ellenorzes kozben megvaltozott.');
  const state=await inspectVersionedApprovalState({model,freeze,approved,approval},now().getTime());
  return {model,state,freeze,approved,approval};
 }
 async function getModel(args){
  guard();
  const m=await inspectModel(args);guard();
  ok(m?.version===3&&m?.boardId==='5107075373',
   'A megelozo ciklus vagy V3 DRAFT nem igazolt.');
  return m;
 }
 async function current(args){
  const m=await getModel(args);
  const s=await scan(m);
  return s;
 }
 async function inspect(args={}){
  enter();try{
   const s=await current(args);
   return clone({...s,model:undefined,readOnly:true,mondayWrites:0,
    planVersion:s.model.version,boardId:s.model.boardId,
    sessionId:s.model.sessionId,revision:s.model.revision,
    sourceDraftSha256:s.model.sourceDraftSha256,
    generationSha256:s.model.generationSha256,
    predecessorCompletionSha256:s.model.source.completionSha256,
    sourceBoardSha256:s.model.sourceBoardSha256,
    changedTaskCount:s.model.changedTaskCount,
    fieldChangeCount:s.model.fieldCount,taskCount:s.model.taskCount});
  }finally{finish();}
 }
 async function requireBoard(args,m){
  requireVersionedApprovalBoard(args,m,now().getTime());
  await checkPinned(args,m);guard();
  const board=await readBoard(args);guard();
  const fp=pilotFingerprint(board);
  ok(await pilotSha(fp)===m.sourceBoardSha256&&fp===m.sourceFingerprint,
   'A friss Monday-board nem egyezik a lezart megelozo ciklussal.');
 }
 async function createChecked(m,kind,name,document){
  guard();const destination=path(m,kind,name);
  ok(await read(destination)===null,'A verzios nyugta mar letezik. Nincs feluliras.');
  // The underlying Graph implementation must use conflictBehavior=fail and
  // require 201 Created followed by independent content/eTag readback.
  const receipt=await create(destination,clone(document));
  guard();
  ok(receipt?.path===destination&&receipt.name===name,
   'A SharePoint create nyugtaja nem egyezik.');
  const reread=await pair(m,kind,name);
  ok(reread?.receipt.id===receipt.id&&reread.receipt.eTag===receipt.eTag&&
   reread.receipt.sha256===receipt.sha256,
   'Az uj SharePoint fajl visszaellenorzese sikertelen.');
  return reread;
 }
 async function approve(args={}){
  enter();
  try{
   ok(args.mondayConfirmed===true&&args.uploaderConfirmed===true&&
    args.userConfirmed===true&&pilotUuid(args.executionId),
    'Ket fuggetlen, aktualis jovahagyas szukseges.');
   let state=await current(args),m=state.model;
   ok(['DRAFT_READY','APPROVAL_INCOMPLETE'].includes(state.state.status),
    'A verzio mar jovahagyott vagy blokkolt.');
   await requireBoard(args,m);
   // A new instance may resume from an immutable, fully validated prefix,
   // but never silently create a second freeze or approval receipt.
   const frozenDraft=m.sourceDraftSha256,gen=m.generationSha256;
   const checkModel=async()=>{
    const fresh=await current(args);
    ok(fresh.model.sourceDraftSha256===frozenDraft&&
     fresh.model.generationSha256===gen&&
     fresh.model.sessionId===m.sessionId&&
     fresh.model.revision===m.revision,
     'A DRAFT vagy a megelozo ciklus megvaltozott.');
    await requireBoard(args,fresh.model);
    return fresh;
   };
   const names=m.names;
   if(!state.freeze){
    state=await checkModel();m=state.model;
    const document=makeVersionedApprovalFreeze(m,{
     ...args,createdAt:now().toISOString()},now().getTime());
    await createChecked(m,'session',names.freeze,document);
   }
   state=await checkModel();m=state.model;
   if(!state.approved){
    ok(!!state.freeze,'Hianyzik az ellenorzott zarolas.');
    await createChecked(m,'approved',names.approved,
     makeVersionedApprovedPlan(m,state.freeze));
   }
   state=await checkModel();m=state.model;
   if(!state.approval){
    ok(!!state.freeze&&!!state.approved,'Hianyzo Approved vagy zarolas.');
    await createChecked(m,'session',names.approval,
     makeVersionedApprovalReceipt(m,state.freeze,state.approved));
   }
   state=await checkModel();
   ok(['READY_TO_SYNC','READY_TO_CLOSE'].includes(state.state.status),
    'Az Approved Plan vagy nyugta nincs teljesen igazolva.');
   return clone({...state,model:undefined,readOnly:true,mondayWrites:0,
    planVersion:state.model.version,boardId:state.model.boardId,
    sessionId:state.model.sessionId,revision:state.model.revision,
    sourceDraftSha256:state.model.sourceDraftSha256,
    generationSha256:state.model.generationSha256,
    predecessorCompletionSha256:state.model.source.completionSha256,
    sourceBoardSha256:state.model.sourceBoardSha256,
    changedTaskCount:state.model.changedTaskCount,
    fieldChangeCount:state.model.fieldCount,taskCount:state.model.taskCount});
  }catch(e){blocked=true;throw e;}
  finally{finish();}
 }
 return Object.freeze({inspect,approve});
}
