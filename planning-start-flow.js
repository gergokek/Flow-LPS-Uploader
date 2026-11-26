// Visible, fail-closed V3 planning-start workflow. All persistence is injected.
// No retries: an execute failure may have created a manifest/claim/baseline.
const ok=(v,message)=>{if(!v)throw Error(message);};
export async function runPlanningStartFlow({
 inspected,isCurrent,consent,execute,select,attach,onPhase=()=>{}
}={}){
 ok(inspected?.action==='START_NEXT'&&inspected.planVersion===3&&
    inspected.boardMatches===true&&inspected.readOnly===true&&
    inspected.mondayWrites===0&&
    /^[a-f0-9]{64}$/.test(inspected.predecessorCompletionSha256||'')&&
    [isCurrent,consent,execute,select,attach,onPhase].every(fn=>typeof fn==='function'),
    'V3 inditashoz nem teljes a hitelesitett elozmeny.');
 let phase='NOT_STARTED',writeMayHaveStarted=false,confirmationGranted=false;
 const stage=(next,details)=>{
  phase=next;try{onPhase(next,details);}catch{}
 };
 const guard=()=>ok(isCurrent()===true,
  'A Microsoft/Monday kapcsolat megvaltozott. A V3 allapotot ujra kell ellenorizni.');
 try{
  guard();
  stage('WAITING_FOR_UPLOADER_CONFIRMATION');
  const confirmed=await consent(inspected);
  if(confirmed!==true){
   stage('CANCELLED');
   throw Error('A V3.0 Uploader jovahagyasat megszakitottak.');
  }
  confirmationGranted=true;guard();
  stage('UPLOADER_CONFIRMED');
  // No work is allowed to continue without the same account + board + session.
  guard();stage('CREATING_OR_VERIFYING_SHAREPOINT');
  writeMayHaveStarted=true;
  const run=await execute();
  guard();
  ok(run?.action==='START_NEXT'&&run.planVersion===inspected.planVersion&&
     run.mondayWrites===0&&run.report?.status==='ACTIVE',
     'A V3 SharePoint letrehozasi eredmeny nem igazolt.');
  stage('READBACK_OF_V3_RECEIPTS');
  const selected=await select(run);
  guard();
  ok(selected?.status==='ACTIVE'&&selected.planVersion===inspected.planVersion&&
     selected.revision===0&&selected.mondayWrites===0&&
     /^[a-f0-9]{64}$/.test(selected.receipt?.sha256||''),
     'A V3.0 mentesi nyugta nem igazolt.');
  stage('ACTIVATING_MONDAY_EDITOR');
  // After attach(), the original isCurrent() intentionally becomes false:
  // a selected DRAFT now exists. Do not recheck the pre-attach predicate.
  await attach(selected);
  stage('ACTIVE_V3',selected);
  return selected;
 }catch(error){
  const message=String(error?.message||error).slice(0,300);
  stage('FAILED',{phase,confirmationGranted,writeMayHaveStarted,message});
  const suffix=writeMayHaveStarted?
   ' SharePoint V3 fajlok reszben vagy teljesen letrejohettek. Ne inditsd ujra! '+
   'Zard be a kapcsolatot, majd uj, csak olvaso tervellenorzessel ellenorizd a V3 allapotat.':
   ' Nem indult V3 SharePoint letrehozas ebben a muveletben.';
  throw Error('V3.0 inditas ('+phase+'): '+message+'.'+suffix,{cause:error});
 }
}
