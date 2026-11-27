import {pilotAssert as ok,pilotFileSha,pilotUuid,pilotStable as stable} from './v1-pilot-contract.js';
import {V1_CLOSED,V2_ACTIVE,V2_BASELINE,v2RevisionName,v2Source,requireV2Board,
 makeV1Closure,makeV2Claim,makeV2Baseline,makeNextV2Draft,inspectV2Artifacts,v2Generation} from './v2-session-contract.js';
const clone=x=>structuredClone(x);
const pair=f=>f?{document:f.value,receipt:{name:f.name,id:f.id,eTag:f.eTag,sha256:f.sha256,
 path:'Projects/5107075373/Draft-Plans/'+f.name,verification:'content-sha256-and-etag'}}:null;
const key=files=>stable(files.map(({id,name,eTag})=>({id,name,eTag})).sort((a,b)=>a.name.localeCompare(b.name)));
// Create-only successor records; the immutable V1 claim is never deleted or reused.
// An uncertain create stops THIS instance. A new explicit inspection may resume the
// same proven claim; it cannot allocate another session ID or overwrite a revision.
export function createV2SessionStore({inspectCompleted,readDraft,listDraft,createDraft,
 checkPinned,check=()=>{},now=()=>new Date(),randomUUID=()=>crypto.randomUUID()}={}){
 for(const f of [inspectCompleted,readDraft,listDraft,createDraft,checkPinned,check,now,randomUUID])
  ok(typeof f==='function','Invalid V2 store dependency.');
 let cached=null,authorization=null,blocked=false;
 const catalog=async()=>{
  const files=await listDraft();ok(Array.isArray(files),'Invalid DRAFT listing.');
  const selected=files.filter(f=>f.name===V1_CLOSED||f.name===V2_ACTIVE||/^draft-v2(?:[-.]|$)/.test(f.name||''));
  ok(!files.some(f=>/^active-session-v\d+\.json$/.test(f.name||'')&&f.name!==V2_ACTIVE),
   'Masik tervverzio foglalasa talalhato; V2 inditas tiltva.');
  ok(new Set(selected.map(f=>f.name)).size===selected.length&&new Set(selected.map(f=>f.id)).size===selected.length,
   'Duplikalt V2 fajl.');
  for(const f of selected)ok(f.id&&f.eTag&&(f.name===V1_CLOSED||f.name===V2_ACTIVE||
   f.name===V2_BASELINE||/^draft-v2-r\d{6}\.json$/.test(f.name)), 'Ismeretlen V2 fajl; kezi ellenorzes szukseges.');
  return selected;
 };
 async function scan(){
  check();ok(cached,'Elobb V1/V2 teljes visszaellenorzes szukseges.');
  const first=await catalog(),byName=new Map();
  for(let i=0;i<first.length;i+=4){
   const group=first.slice(i,i+4),read=await Promise.all(group.map(f=>readDraft(f.name)));
   for(let k=0;k<group.length;k++){
    const f=read[k],meta=group[k];ok(f&&f.id===meta.id&&f.eTag===meta.eTag,'A V2 fajl megvaltozott olvasas kozben.');
    byName.set(meta.name,pair(f));
   }
  }
  ok(key(first)===key(await catalog()),'A V2 fajllista megvaltozott.');
  const bundle={evidence:clone(cached.evidence),oldClaim:clone(cached.oldClaim),
   closure:byName.get(V1_CLOSED)||null,claim:byName.get(V2_ACTIVE)||null,baseline:byName.get(V2_BASELINE)||null,
   revisions:[...byName].filter(([name])=>/^draft-v2-r/.test(name)).sort(([a],[b])=>a.localeCompare(b)).map(([,f])=>f)};
  const state=await inspectV2Artifacts(bundle,cached.model,now().getTime());
  check();return { ...bundle,status:state.status,generationSha256:await v2Generation(bundle),
   planVersion:2,boardId:'5107075373',revision:state.revision,
   taskCount:cached.model.taskCount,mondayWrites:0,draftFilesDeleted:0};
 }
 async function inspect(args={}){
  check();ok(!blocked,'A V2 mentes bizonytalan; uj kapcsolatban olvasd vissza a fajlokat.');
  const report=await inspectCompleted(args),oldClaim=pair(await readDraft('active-session.json'));
  const model=await v2Source(report.evidence,oldClaim,args.editorId,args.createdBy,now().getTime());
  cached={evidence:clone(report.evidence),oldClaim,model,editorId:args.editorId,createdBy:args.createdBy};
  return scan();
 }
 function identity(args){check();ok(!blocked&&cached&&args.editorId===cached.editorId&&args.createdBy===cached.createdBy,
  'A V2 fiok vagy munkamenet megvaltozott.');}
 async function begin(args={}){
  identity(args);ok(args.userConfirmed===true&&pilotUuid(args.executionId)&&!authorization,
   'A V2 inditas nincs kifejezetten jovahagyva vagy mar elkezdodott.');
  await checkPinned(cached.evidence,cached.oldClaim,args.createdBy);
  const report=await scan();
  ok(report.status!=='V2_ACTIVE'&&args.generationSha256===report.generationSha256,
   'A V2 foglalas megvaltozott; uj visszaolvasas szukseges.');
  authorization={executionId:args.executionId,generationSha256:report.generationSha256,
   expires:now().getTime()+300000,spent:false};
  return report; // Consent does not yet create any file.
 }
 async function open(args={}){
  identity(args);
  try{
   await checkPinned(cached.evidence,cached.oldClaim,args.createdBy);
   const report=await scan(),model=cached.model;
   ok(!await readDraft('session-v2-freeze.json'),'A V2 mar jovahagyasra zarolt. A 7. V2 ellenorzes/szinkron gombbal folytasd.');
   requireV2Board(args,model,now().getTime());
   ok(args.generationSha256===report.generationSha256,'A V2 revizio megvaltozott.');
   if(report.status==='V2_ACTIVE')return report; // Verified resume, zero creates.
   ok(authorization&&!authorization.spent&&authorization.executionId===args.executionId&&
    authorization.generationSha256===report.generationSha256&&now().getTime()<authorization.expires,
    'Hianyzo vagy lejart V2 jovahagyas.');authorization.spent=true;
   let closure=report.closure,claim=report.claim;
   if(!closure){
    requireV2Board(args,model,now().getTime());
    const document=makeV1Closure(model,{createdAt:now().toISOString(),boardVerifiedAt:args.boardVerifiedAt});
    closure={document,receipt:await createDraft(V1_CLOSED,document)};
   }
   if(!claim){
    requireV2Board(args,model,now().getTime());
    const document=makeV2Claim(model,closure,{sessionId:randomUUID(),createdAt:now().toISOString()});
    claim={document,receipt:await createDraft(V2_ACTIVE,document)};
   }
   requireV2Board(args,model,now().getTime());
   await checkPinned(cached.evidence,cached.oldClaim,args.createdBy);
   requireV2Board(args,model,now().getTime());
   const baseline=makeV2Baseline(model,claim.document);
   await createDraft(V2_BASELINE,baseline);
   const done=await scan();
   ok(done.status==='V2_ACTIVE'&&done.claim.document.sessionId===claim.document.sessionId&&
    done.revision===0,'A V2 kezdofajlok mentese nem igazolt.');return done;
  }catch(error){blocked=true;throw error;}
 }
 async function append({updatedDraft,expectedSessionId,expectedParentSha256}={}){
  check();ok(cached&&!blocked,'A V2 menteshez uj visszaellenorzes szukseges.');
  try{
   ok(!await readDraft('session-v2-freeze.json'),'A V2 jovahagyasra zarolt; DRAFT-mentes tiltva.');
   await checkPinned(cached.evidence,cached.oldClaim,cached.createdBy);
   const report=await scan();ok(report.status==='V2_ACTIVE','A V2 meg nem szerkesztheto.');
   const last=report.revisions.at(-1)||report.baseline;
   ok(report.claim.document.sessionId===expectedSessionId&&last.receipt.sha256===expectedParentSha256,
    'Masik V2 modositas tortent; a mentes nem irhat felul korabbi verziot.');
   const draft=makeNextV2Draft(last.document,updatedDraft,cached.model,report.claim.document,expectedParentSha256);
   ok(!await readDraft('session-v2-freeze.json'),'A V2 kozben jovahagyasra zarult.');
   const receipt=await createDraft(v2RevisionName(draft.version),draft);
   ok(!await readDraft('session-v2-freeze.json'),'Parhuzamos V2 jovahagyas tortent; a mentest ellenorizni kell.');
   ok(receipt.sha256===await pilotFileSha(draft),'A V2 mentes ellenorzoosszege elter.');check();
   return {status:'SAVED',boardId:'5107075373',planVersion:2,sessionId:expectedSessionId,
    revision:draft.version,versionLabel:'V2.'+draft.version,draft,receipt,mondayWrites:0};
  }catch(error){blocked=true;throw error;}
 }
 async function refresh(args={}){identity(args);await checkPinned(cached.evidence,cached.oldClaim,args.createdBy);return scan();}
 return Object.freeze({inspect,refresh,begin,open,append});
}
