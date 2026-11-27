// V3 TEST immutable per-item Sync journal. There is no Monday mutation client.
// Graph creates require conflictBehavior=fail, SHA/eTag readback, and never overwrite.
// A lost create acknowledgement blocks this instance. A new inspection discovers it.
import {pilotAssert as ok,pilotUuid,pilotHex,pilotFileSha,pilotStable as stable,
 pilotFingerprint,pilotSha} from './v1-pilot-contract.js';
import {versionFilePath,lifecycleFileName} from './version-workspace-layout.js';
import {inspectNextCycleReadiness} from './versioned-next-cycle-proof.js';
import {isVersionedPlan,completedSyncStatus,syncStepPattern} from './versioned-cycle-version.js';
import {checkVersionedApprovalFile} from './versioned-approval-sync-contract.js';
import {inspectVersionedSyncCycle,requireVersionedSyncBoard,
 makeVersionedSyncAhead,makeVersionedSyncFinal,
 validateVersionedSyncAhead,validateVersionedSyncResult}
 from './versioned-sync-contract.js';
const same=(a,b)=>stable(a)===stable(b),copy=x=>structuredClone(x);
const plainModel=m=>copy({...m,names:undefined});
const publicReport=r=>copy({...r,model:plainModel(r.model)});
const publicState=s=>copy({...s,model:plainModel(s.model)});
const index=files=>stable(files.map(f=>({name:f.name,id:f.id,eTag:f.eTag}))
 .sort((a,b)=>a.name.localeCompare(b.name)));

export function createVersionedSyncStore({
 version=3,inspectModel,read,list,create,readBoard,checkPinned,
 check=()=>{},now=()=>new Date()}={}){
 ok(isVersionedPlan(version),'Invalid versioned sync store.');
 const stepPattern=syncStepPattern(version);
 for(const fn of [inspectModel,read,list,create,readBoard,checkPinned,check,now])
  ok(typeof fn==='function','Hianyzo V3 szinkronfuggoseg.');
 let busy=false,blocked=false,authorization=null,cached=null;
 const guard=()=>{check();ok(!blocked,'Bizonytalan V3 szinkron: csak uj munkamenettel ellenorizheto.');};
 const enter=()=>{guard();ok(!busy,'Parhuzamos V3 szinkronmuvelet.');busy=true;};
 const leave=()=>{busy=false;};
 const path=(m,kind,name)=>versionFilePath({
  boardId:m.boardId,version:m.version,kind,name});
 async function pair(m,kind,name){
  guard();const p=path(m,kind,name),file=await read(p);guard();
  if(!file)return null;
  const result={document:copy(file.value),receipt:{
   name:file.name,id:file.id,eTag:file.eTag,path:p,
   sha256:file.sha256,verification:'content-sha256-and-etag'}};
  await checkVersionedApprovalFile(result,m.boardId,m.version,kind,name);
  return result;
 }
 async function scan(m){
  guard();ok(m?.version===version&&m.boardId==='5107075373',
   'V4+ szinkronra nem kiterjesztett motor.');
  const n=m.names,folders=[n.layout.session,n.layout.approved,n.layout.sync];
  const first=await Promise.all(folders.map(p=>list(p)));guard();
  ok(first.every(Array.isArray),'Hianyzo V3 fajlkatalogus.');
  const [sessions,approvedFiles,syncFiles]=first;
  const sessionAllowed=new Set(['version-info.json',lifecycleFileName(version,'claim'),
   n.freeze,n.approval]);
  ok(sessions.every(f=>sessionAllowed.has(f.name))&&
   approvedFiles.every(f=>f.name===n.approved)&&
   syncFiles.every(f=>f.name===n.completed||
    stepPattern.test(f.name)),
   'Ismeretlen V3 session/Approved/Sync fajl.');
  for(const files of first){
   ok(files.every(f=>f?.id&&f.name&&f.eTag)&&
    new Set(files.map(f=>f.name)).size===files.length&&
    new Set(files.map(f=>f.id)).size===files.length,
    'Duplikalt vagy ervenytelen V3 fajllista.');
  }
  const [freeze,approved,approval,final]=await Promise.all([
   pair(m,'session',n.freeze),pair(m,'approved',n.approved),
   pair(m,'session',n.approval),pair(m,'sync',n.completed)]);
  const rows=new Map();
  for(let i=0;i<syncFiles.length;i+=4){
   const group=syncFiles.slice(i,i+4);
   const parts=await Promise.all(group.map(async f=>
    ({meta:f,pair:await pair(m,'sync',f.name)})));
   for(const {meta,pair:part} of parts){
    ok(part?.receipt.id===meta.id&&part.receipt.eTag===meta.eTag,
     'A V3 naplo listaja es tartalma elter.');
    if(meta.name===n.completed){
     ok(final?.receipt.sha256===part.receipt.sha256,'Eltero V3 vegnyugta.');
     continue;
    }
    const match=stepPattern.exec(meta.name);
    const step=Number(match[1]);
    ok(step>0&&step<=m.changedTaskCount,'Idegen V3 naplosorszam.');
    const entry=rows.get(step)||{step,ahead:null,result:null};
    ok(entry[match[2]]===null,'Duplikalt V3 naplotipus.');
    entry[match[2]]=part;rows.set(step,entry);
   }
  }
  ok(sessions.find(f=>f.name===n.freeze)?.id===freeze?.receipt.id&&
     sessions.find(f=>f.name===n.approval)?.id===approval?.receipt.id&&
     approvedFiles.find(f=>f.name===n.approved)?.id===approved?.receipt.id&&
     syncFiles.find(f=>f.name===n.completed)?.id===final?.receipt.id,
   'A V3 kulcsnyugtak es a katalogus elternek.');
  const last=await Promise.all(folders.map(p=>list(p)));guard();
  ok(first.every((files,i)=>index(files)===index(last[i])),
   'A V3 szinkronnaplo olvasas kozben megvaltozott.');
  const report={model:m,freeze,approved,approval,
   records:[...rows.values()].sort((a,b)=>a.step-b.step),final};
  const state=await inspectVersionedSyncCycle(report,now().getTime());guard();
  return {report,state};
 }
 async function current(args){
  guard();const m=await inspectModel(args);guard();
  return scan(m);
 }
 async function inspect(args={}){
  enter();try{
   const out=await current(args);
   cached=out;
   return {report:publicReport(out.report),state:publicState(out.state),readOnly:true,mondayWrites:0};
  }finally{leave();}
 }
 async function board(args,s){
  requireVersionedSyncBoard(args,s,now().getTime());
  await checkPinned(args,s.model);guard();
  const actual=await readBoard(args);guard();
  ok(actual?.id===s.model.boardId&&
   await pilotSha(pilotFingerprint(actual))===s.expectedBoardSha256,
   'A teljes Monday-board elter a V3 naplo utolso igazolt allapotatol.');
 }
 async function createChecked(m,name,doc){
  const location=path(m,'sync',name);
  guard();ok(await read(location)===null,'V3 naplo mar letezik; feluliras tiltva.');
  const receipt=await create(location,copy(doc));guard();
  ok(receipt?.path===location&&receipt.name===name&&
     receipt.sha256===await pilotFileSha(doc),
    'V3 SharePoint create nem egyezik.');
  const reread=await pair(m,'sync',name);
  ok(reread?.receipt.id===receipt.id&&reread.receipt.eTag===receipt.eTag&&
   reread.receipt.sha256===receipt.sha256,
   'V3 naplo SHA/eTag visszaellenorzese sikertelen.');
  return reread;
 }
 async function begin(args={}){
  enter();try{
   ok(!authorization&&args.userConfirmed===true&&
    args.mondayConfirmed===true&&args.uploaderConfirmed===true&&
    pilotUuid(args.executionId),
    'Kifejezett ketoldali V3 szinkroninditas szukseges.');
   const value=await current(args),s=value.state;
   ok(['READY_TO_SYNC','READY_TO_CLOSE'].includes(s.status),
    'A V3 szinkron bizonytalan vagy mar lezart.');
   await board(args,s);
   authorization={executionId:args.executionId,
    editorId:args.editorId,createdBy:args.createdBy,
    approvedSha256:s.approvedSha256,expires:now().getTime()+3600000,
    inFlight:null,spent:new Set()};
   cached=value;
   return {report:publicReport(value.report),state:publicState(s),mondayWrites:0};
  }catch(e){blocked=true;throw e;}finally{leave();}
 }
 function authorised(args){
  guard();const a=authorization;
  ok(a&&a.executionId===args?.executionId&&a.editorId===args.editorId&&
   a.createdBy===args.createdBy&&a.approvedSha256===cached?.state.approvedSha256&&
   now().getTime()<a.expires,'Elavult vagy felhasznalt V3 futas.');
  return a;
 }
 async function exclusive(args,action){
  const a=authorised(args);enter();
  try{return await action(a);}catch(e){blocked=true;throw e;}finally{leave();}
 }
 async function fresh(args){
  const r=await current(args),prev=cached?.state;
  ok(prev&&r.state.model.sourceDraftSha256===prev.model.sourceDraftSha256&&
   r.state.approvedSha256===prev.approvedSha256&&
   r.state.approvalReceiptSha256===prev.approvalReceiptSha256,
   'A V3 jovahagyott terv idokozben megvaltozott.');
  cached=r;return r;
 }
 async function ahead(args={}){
  return exclusive(args,async a=>{
   ok(!a.inFlight,'A V3 feladat elonaploja mar fuggoben van.');
   const {state:s,report:r}=await fresh(args),t=s.next;
   await board(args,s);
   ok(t&&s.status==='READY_TO_SYNC'&&
    !a.spent.has('ahead:'+t.step),
    'A V3 kovetkezo feladat nem folytathato.');
   a.spent.add('ahead:'+t.step);
   const doc=makeVersionedSyncAhead(s.model,r,s,args,now().getTime());
   const receipt=await createChecked(s.model,s.model.names.ahead(t.step),doc);
   await validateVersionedSyncAhead(receipt,s.model,r,t,
    s.previousResultSha256,now().getTime());
   a.inFlight=receipt;
   return copy(receipt);
  });
 }
 async function result(args={}){
  return exclusive(args,async a=>{
   ok(a.inFlight&&a.inFlight.document.requestId===args.result?.requestId&&
    a.inFlight.document.executionId===a.executionId,
    'A V3 feladat eredmenye idegen elonaplohoz tartozik.');
   const {state:s,report:r}=await fresh(args),t=s.next;
   ok(s.status==='MANUAL_REVIEW_REQUIRED'&&t&&
    r.records.length===s.verifiedTaskCount+1&&
    r.records.at(-1).ahead.receipt.sha256===a.inFlight.receipt.sha256&&
    r.records.at(-1).result===null,
    'Az elonaplo nem pontosan az egyetlen fuggoben levo V3 feladat.');
   ok(!a.spent.has('result:'+t.step),
    'V3 eredmenynaplo mar elindult.');
   a.spent.add('result:'+t.step);
   const doc=copy(args.result);
   const candidate={document:doc,receipt:{name:s.model.names.result(t.step),
    path:path(s.model,'sync',s.model.names.result(t.step)),
    sha256:await pilotFileSha(doc),id:'candidate',eTag:'candidate',
    verification:'content-sha256-and-etag'}};
   await validateVersionedSyncResult(candidate,a.inFlight,s.model,r,t,now().getTime());
   const saved=await createChecked(s.model,s.model.names.result(t.step),doc);
   await validateVersionedSyncResult(saved,a.inFlight,s.model,r,t,now().getTime());
   a.inFlight=null;
   const after=await fresh(args);
   if(after.state.status==='MANUAL_REVIEW_REQUIRED')blocked=true;
   return saved;
  });
 }
 async function finish(args={}){
  return exclusive(args,async a=>{
   ok(!a.inFlight&&!a.spent.has('finish'),'V3 zaras elonaplo mellett tiltva.');
   a.spent.add('finish');
   const {state:s,report:r}=await fresh(args);
   await board(args,s);
   ok(s.status==='READY_TO_CLOSE','A V3 teljes naploja meg nem igazolt.');
   const doc=makeVersionedSyncFinal(s.model,r,s,args,now().getTime());
   const saved=await createChecked(s.model,s.model.names.completed,doc);
   const after=await fresh(args);
   ok(after.state.status===completedSyncStatus(version),'V3 teljes lezaro ellenorzes sikertelen.');
   // Terminal completion stays read-only inspectable by this instance.
   // Further writes are impossible: final exists, finish is spent and no next step.
   return saved;
  });
 }
 async function readiness(args={}){
  enter();try{
   const {report,state}=await current(args);
   ok(state.status===completedSyncStatus(version)&&args.editorId===state.model.editorId&&
    args.createdBy===state.model.createdBy,
    'V4: V3 szinkron nincs teljesen lezarva.');
   await checkPinned(args,state.model);guard();
   const board=await readBoard(args);guard();
   return inspectNextCycleReadiness({
    report,verifiedSource:await inspectModel(args),liveBoard:board,
    editorId:args.editorId,createdBy:args.createdBy,now:now().getTime()});
  }finally{leave();}
 }
 return Object.freeze({inspect,begin,ahead,result,finish,readiness});
}
