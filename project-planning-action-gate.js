// Generic authenticated planning command gate, independent of a fixed Vn -> Vn+1.
// Caller supplies only verified live-state readers and version-specific stores.
// No mutation is possible on the inspect route. This must not be exposed to
// browser callers until its explicit Monday+Uploader consent UX is connected.
const ok=(c,m)=>{if(!c)throw Error(m);};
const actions=new Set(['RESUME_DRAFT','START_NEXT','RECOVER_SAME_SESSION']);
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export function createPlanningActionGate({inspectCurrent,storeForVersion,
 check=()=>{},now=()=>Date.now()}={}){
 ok([inspectCurrent,storeForVersion,check,now].every(x=>typeof x==='function'),
  'Invalid generic planning gate dependencies.');
 let busy=false,uncertain=false;
 async function snapshot(args){
  check();const result=await inspectCurrent(args);check();
  ok(result?.readOnly===true&&result.mondayWrites===0&&
   Number.isSafeInteger(result.verifiedVersionCount)&&result.verifiedVersionCount>=0&&
   Number.isSafeInteger(result.planVersion)&&
   result.planVersion>0&&result.planVersion<=9999&&
   typeof result.action==='string',
   'Unverified project planning state.');
  return result;
 }
 function equalState(a,b){
  return a.action===b.action&&a.planVersion===b.planVersion&&
   a.status===b.status&&a.revision===b.revision&&
   a.verifiedVersionCount===b.verifiedVersionCount&&
   a.boardMatches===b.boardMatches&&
   a.predecessorCompletionSha256===b.predecessorCompletionSha256&&
   a.sessionId===b.sessionId&&a.latestDraftSha256===b.latestDraftSha256;
 }
 async function inspect(args={}){
  ok(!busy,'A planning operation is in progress.');
  return snapshot(args);
 }
 async function execute(args={}){
  ok(!busy&&!uncertain,'Uncertain planning write; reconnect and inspect.');
  busy=true;
  try{
   const first=await snapshot(args);
   ok(args.expectedPlanVersion===undefined||args.expectedPlanVersion===first.planVersion,
    'The requested plan version changed.');
   ok(args.expectedPredecessorSha256===undefined||
    args.expectedPredecessorSha256===first.predecessorCompletionSha256,
    'The approved predecessor receipt changed.');
   ok(actions.has(first.action),'The current planning cycle must be verified before continuing.');
   if(first.action==='START_NEXT'){
    ok(first.boardMatches===true&&args.mondayConfirmed===true&&
     args.uploaderConfirmed===true&&uuid(args.executionId),
     'A new planning cycle requires two explicit consents and an unchanged board.');
    const verifiedAt=Date.parse(args.boardVerifiedAt),time=now();
    ok(Number.isFinite(verifiedAt)&&verifiedAt<=time+5000&&
     time-verifiedAt<=120000,'The Monday board verification expired.');
   }
   const executor=await storeForVersion(first.planVersion);check();
   ok(executor&&typeof executor.inspect==='function'&&
    typeof executor.begin==='function',
    'No fully verified session engine for the selected plan version.');
   const second=await snapshot(args);
   ok(equalState(first,second),'Project planning state changed during consent.');
   if(first.action==='RESUME_DRAFT'){
    const current=await executor.inspect(args);check();
    ok(current?.status==='ACTIVE'&&current.planVersion===first.planVersion&&
      current.revision===first.revision&&
      (first.sessionId===undefined||current.claim?.document?.sessionId===first.sessionId)&&
      (first.latestDraftSha256===undefined||current.latest?.receipt?.sha256===first.latestDraftSha256),
      'The active DRAFT was changed or not verified.');
    return Object.freeze({action:first.action,planVersion:first.planVersion,
     revision:current.revision,report:current,mondayWrites:0});
   }
   if(first.action==='RECOVER_SAME_SESSION'){
    ok(typeof executor.recover==='function',
     'Incomplete session requires a verified recover method; no new allocation.');
    const current=await executor.recover(args);check();
    ok(current?.planVersion===first.planVersion,
      'Recovered a different planning version.');
    return Object.freeze({action:first.action,planVersion:first.planVersion,
     report:current,mondayWrites:0});
   }
   // No version number from a browser payload is used to select the engine.
   const verifiedAt=Date.parse(args.boardVerifiedAt),time=now();
   ok(Number.isFinite(verifiedAt)&&verifiedAt<=time+5000&&time-verifiedAt<=120000,
    'The Monday board verification expired during inspection.');
   const result=await executor.begin({...args,userConfirmed:true});check();
   ok(result?.planVersion===first.planVersion&&result.status==='ACTIVE'&&
    result.mondayWrites===0,
    'The session creation was not independently verified.');
   return Object.freeze({action:first.action,planVersion:first.planVersion,
    report:result,mondayWrites:0});
  }catch(error){
   // An earlier create may have succeeded when an acknowledgement was lost.
   // Never automatically rerun any mutating path on this gate instance.
   uncertain=true;throw error;
  }finally{busy=false;}
 }
 return Object.freeze({inspect,execute});
}
