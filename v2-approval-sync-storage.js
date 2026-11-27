import {pilotAssert as ok,pilotUuid,pilotFileSha,pilotStable as stable} from './v1-pilot-contract.js';
import {V2_FREEZE,V2_APPROVED,V2_APPROVAL,V2_FINAL,v2StepName,inspectV2Cycle,
 makeV2Freeze,makeV2Approved,makeV2ApprovalReceipt,v2SyncCommon,requireV2CycleBoard,
 validateV2Ahead,validateV2Result} from './v2-approval-sync-contract.js';
const clone=x=>structuredClone(x);
const wrap=(f,folder)=>f?{document:f.value,receipt:{name:f.name,id:f.id,eTag:f.eTag,
 sha256:f.sha256,path:'Projects/5107075373/'+folder+'/'+f.name,verification:'content-sha256-and-etag'}}:null;
const catalog=files=>stable(files.map(({name,id,eTag})=>({name,id,eTag})).sort((a,b)=>a.name.localeCompare(b.name)));
// No Monday client is accepted here. Only bounded, create-only SharePoint storage.
export function createV2ApprovalSyncStore({inspectSession,refreshSession,read,listSync,create,
 checkPinned,check=()=>{},now=()=>new Date()}={}){
 for(const f of [inspectSession,refreshSession,read,listSync,create,checkPinned,check,now])ok(typeof f==='function','Invalid V2 flow dependency.');
 let cached=null,authorization=null,blocked=false,busy=false;
 const readPair=async(folder,name)=>wrap(await read(folder,name),folder);
 async function scan(session,editorId,createdBy){
  check();const first=await listSync();
  ok(Array.isArray(first)&&first.every(f=>f.name===V2_FINAL||/^sync-v2-step-\d{6}-(ahead|result)\.json$/.test(f.name))&&
   new Set(first.map(f=>f.name)).size===first.length&&new Set(first.map(f=>f.id)).size===first.length,
   'Ismeretlen vagy duplikalt V2 szinkronnaplo.');
  const [freeze,approved,approval,final]=await Promise.all([
   readPair('Draft-Plans',V2_FREEZE),readPair('Approved-Plans',V2_APPROVED),
   readPair('Draft-Plans',V2_APPROVAL),readPair('Sync-Status',V2_FINAL)]);
  const rows=new Map();
  for(let i=0;i<first.length;i+=4){
   const group=first.slice(i,i+4),files=await Promise.all(group.map(f=>readPair('Sync-Status',f.name)));
   for(let k=0;k<group.length;k++){
    const meta=group[k],pair=files[k];ok(pair&&pair.receipt.id===meta.id&&pair.receipt.eTag===meta.eTag,'A V2 naplolista megvaltozott.');
    if(meta.name===V2_FINAL){ok(pair.receipt.sha256===final?.receipt.sha256,'Valtozo V2 zaronyugta.');continue;}
    const match=/^sync-v2-step-(\d{6})-(ahead|result)\.json$/.exec(meta.name),step=Number(match[1]);
    const row=rows.get(step)||{step,ahead:null,result:null};ok(!row[match[2]],'Duplikalt V2 naplo.');row[match[2]]=pair;rows.set(step,row);
   }
  }
  ok(catalog(first)===catalog(await listSync()),'A V2 naplok olvasas kozben megvaltoztak.');
  const report={session,freeze,approved,approval,records:[...rows.values()].sort((a,b)=>a.step-b.step),final};
  const state=await inspectV2Cycle(report,editorId,createdBy,now().getTime());check();
  cached={report:clone(report),state,editorId,createdBy,at:now().getTime()};
  return report;
 }
 async function inspect(args={}){check();ok(!busy,'Mar fut V2 muvelet.');
  return scan(await inspectSession(args),args.editorId,args.createdBy);}
 async function refresh(args){
  check();ok(cached&&cached.editorId===args.editorId&&cached.createdBy===args.createdBy,'A V2 azonossag megvaltozott.');
  await checkPinned(cached.report,args.createdBy);
  return scan(await refreshSession(args),args.editorId,args.createdBy);
 }
 async function begin(args={}){
  ok(!blocked&&!authorization&&args.userConfirmed===true&&pilotUuid(args.executionId),'Hianyzo vagy mar felhasznalt V2 jovahagyas.');
  const report=await refresh(args),state=cached.state,m=state.model;
  ok(!['MANUAL_REVIEW_REQUIRED','V2_SYNC_COMPLETED'].includes(state.status)&&
   args.generationSha256===state.generationSha256&&args.expectedDraftSha256===m.sourceDraftSha256&&
   args.expectedV2SessionId===m.sessionId&&args.expectedV2Revision===m.revision,
   'A V2 jovahagyas ota valtozas vagy bizonytalan naplo tortent.');
  authorization={executionId:args.executionId,editorId:args.editorId,createdBy:args.createdBy,
   draftSha256:m.sourceDraftSha256,expires:now().getTime()+3600000,inFlight:null,spent:new Set()};
  return report; // Explicit consent alone has no persistent write side effect.
 }
 function current(args){check();const a=authorization;
  ok(!blocked&&a&&a.executionId===args.executionId&&a.editorId===args.editorId&&a.createdBy===args.createdBy&&
   a.draftSha256===cached?.state.model.sourceDraftSha256&&now().getTime()<a.expires,
   'Lejart, megvaltozott vagy megszakadt V2 futas.');return a;}
 async function exclusive(args,fn){const a=current(args);ok(!busy,'Parhuzamos V2 muvelet tiltva.');busy=true;
  try{return await fn(a);}catch(error){blocked=true;throw error;}finally{busy=false;}}
 async function approve(args={}){return exclusive(args,async a=>{
  ok(!a.spent.has('approve'),'A V2 jovahagyas mar elindult.');a.spent.add('approve');
  let report=await refresh(args),state=cached.state,m=state.model;
  requireV2CycleBoard(args,state,now().getTime());
  ok(!['MANUAL_REVIEW_REQUIRED','V2_SYNC_COMPLETED'].includes(state.status),'V2 iras blokkolt.');
  if(report.approval)return report; // Existing approved snapshot never recreated.
  const initialDraft=m.sourceDraftSha256,sourceGeneration=m.generationSha256;
  const fresh=()=>{const at=Date.parse(args.boardVerifiedAt);ok(now().getTime()-at<=120000,'Elavult V2 board-ellenorzes.');check();};
  if(!report.freeze){fresh();const document=makeV2Freeze(m,{...args,createdAt:now().toISOString()});
   await create('Draft-Plans',V2_FREEZE,document);}
  report=await refresh(args);state=cached.state;m=state.model;
  ok(m.sourceDraftSha256===initialDraft&&m.generationSha256===sourceGeneration,'A V2 a zarolas alatt megvaltozott.');
  if(!report.approved){fresh();const document=makeV2Approved(m,report.freeze);await create('Approved-Plans',V2_APPROVED,document);}
  report=await refresh(args);state=cached.state;m=state.model;
  ok(m.sourceDraftSha256===initialDraft,'A V2 a jovahagyas alatt megvaltozott.');
  if(!report.approval){fresh();await create('Draft-Plans',V2_APPROVAL,makeV2ApprovalReceipt(m,report.freeze,report.approved));}
  report=await refresh(args);ok(['READY_TO_SYNC','READY_TO_CLOSE'].includes(cached.state.status),'Nem igazolt az Approved V2.');
  return report;
 });}
 async function ahead(args={}){return exclusive(args,async a=>{
  ok(!a.inFlight,'Fuggoben levo V2 feladat.');
  await refresh(args);const state=cached.state,m=state.model,t=state.next;
  requireV2CycleBoard(args,state,now().getTime());
  ok(state.status==='READY_TO_SYNC'&&t&&args.step===t.step&&args.taskId===t.taskId&&pilotUuid(args.requestId)&&
   !a.spent.has('ahead:'+t.step),'Eltero vagy mar elkezdett V2 feladat.');a.spent.add('ahead:'+t.step);
  const document={...v2SyncCommon(m,cached.report),format:'mflow-v2-sync-ahead',status:'WRITE_AHEAD',
   step:t.step,taskId:t.taskId,taskName:t.taskName,fields:clone(t.fields),executionId:a.executionId,
   requestId:args.requestId,previousResultSha256:state.previousResultSha256,mutationValuesSha256:args.mutationValuesSha256,
   sourceBoardSha256:t.sourceBoardSha256,expectedBoardSha256:t.expectedBoardSha256,
   boardVerifiedAt:args.boardVerifiedAt,createdAt:now().toISOString(),maximumMutationAttempts:1,automaticallyRetryable:false};
  // Validate BEFORE any persistent create, using a computed synthetic receipt.
  const candidate=await candidatePair(document,'Sync-Status',v2StepName(t.step,'ahead'));
  await validateV2Ahead(candidate,m,cached.report,t,state.previousResultSha256,now().getTime());
  const pair={document,receipt:await create('Sync-Status',v2StepName(t.step,'ahead'),document)};
  await validateV2Ahead(pair,m,cached.report,t,state.previousResultSha256,now().getTime());a.inFlight=clone(pair);return pair;
 });}
 async function candidatePair(document,folder,name){
  return {document,receipt:{name,path:'Projects/5107075373/'+folder+'/'+name,id:'validation',eTag:'validation',
   sha256:await pilotFileSha(document),verification:'content-sha256-and-etag'}};}
 async function result(args={}){return exclusive(args,async a=>{
  const state=cached.state,m=state.model,t=state.next,d=args.result;
  ok(a.inFlight&&t&&d?.step===t.step&&!a.spent.has('result:'+t.step),'Hianyzo vagy mar lezart V2 feladat.');
  a.spent.add('result:'+t.step);await checkPinned(cached.report,args.createdBy);
  const aheadPair=await readPair('Sync-Status',v2StepName(t.step,'ahead'));
  ok(aheadPair?.receipt.sha256===a.inFlight.receipt.sha256&&aheadPair.receipt.eTag===a.inFlight.receipt.eTag,'A V2 elonaplo megvaltozott.');
  await validateV2Result(await candidatePair(d,'Sync-Status',v2StepName(t.step,'result')),aheadPair,m,cached.report,t,now().getTime());
  const pair={document:clone(d),receipt:await create('Sync-Status',v2StepName(t.step,'result'),d)};
  await validateV2Result(pair,aheadPair,m,cached.report,t,now().getTime());
  a.inFlight=null;
  cached.report.records.push({step:t.step,ahead:aheadPair,result:pair});
  cached.state=await inspectV2Cycle(cached.report,m.editorId,m.createdBy,now().getTime());
  if(cached.state.status==='MANUAL_REVIEW_REQUIRED')blocked=true;
  return pair;
 });}
 async function finish(args={}){return exclusive(args,async a=>{
  ok(!a.inFlight&&!a.spent.has('finish'),'V2 zaras mar elkezdodott vagy feladat fuggoben.');a.spent.add('finish');
  const report=await refresh(args),state=cached.state,m=state.model;
  requireV2CycleBoard(args,state,now().getTime());
  ok(['READY_TO_CLOSE','V2_SYNC_COMPLETED'].includes(state.status),'A V2 naplosor nem teljes.');
  if(report.final)return report.final;
  const document={...v2SyncCommon(m,report),format:'mflow-v2-sync-final',status:'V2_SYNC_COMPLETED',
   verifiedTaskCount:m.changedTaskCount,totalTaskCount:m.taskCount,remainingTaskCount:0,
   ledgerSha256:state.ledgerSha256,lastResultSha256:state.previousResultSha256,
   boardReadbackSha256:m.finalBoardSha256,fullBoardReadbackMatches:true,approvedExactMatch:true,
   inheritedReconciliations:clone(m.inheritedReconciliations),checkedAt:args.boardVerifiedAt,
   createdAt:now().toISOString(),automaticallyRetryable:false};
  const pair={document,receipt:await create('Sync-Status',V2_FINAL,document)};
  const finalState=await inspectV2Cycle({...report,final:pair},m.editorId,m.createdBy,now().getTime());
  ok(finalState.status==='V2_SYNC_COMPLETED','V2 zaras nem igazolt.');blocked=true;return pair;
 });}
 return Object.freeze({inspect,begin,approve,ahead,result,finish});
}
