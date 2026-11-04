import {saveApprovedPlan} from './approved-plan-save.js';

// Only a fresh, one-time, explicitly confirmed action can create a plan.
// The DRAFT is verified directly with Graph again by saveApprovedPlan.
export function mountApprovedPlanAction({
 button,output,getCurrent,getAccessToken,confirm,
 driveId,tenantId,save=saveApprovedPlan
}={}){
 if(!button||!output||typeof getCurrent!=='function'||typeof getAccessToken!=='function'||
    typeof confirm!=='function'||typeof save!=='function')
  throw Error('Hibas Approved Plan felulet.');
 let pending=null,busy=false,completed=null,sequence=0;
 const matching=(c,p)=>!!c?.content&&!!c?.saved&&!!c?.validated&&!!c?.account&&
  c.boardId===p.intent.boardId&&c.content===p.content&&
  c.validated.version===p.intent.version&&
  c.validated.sha256===p.intent.sha256&&
  c.validated.bytes===p.intent.bytes&&
  c.saved.id===p.saved.id&&c.saved.eTag===p.saved.eTag&&
  c.saved.sha256===p.saved.sha256&&
  c.account.homeAccountId===p.accountId&&
  c.account.tenantId===p.tenantId;
 function clear(){
  sequence++;
  pending=null;
  button.disabled=true;
  if(!busy)output.textContent='Nincs aktív, jóváhagyásra előkészített DRAFT.';
 }
 function receive(intent){
  if(busy||pending||completed?.boardId===intent?.boardId&&
    completed?.version>=intent?.version)return false;
  const current=getCurrent(),saved=current?.saved,account=current?.account;
  if(!account?.homeAccountId||!account.tenantId||
   !saved||intent?.schemaVersion!==1||
   intent.format!=='flow-lps-draft-finalization-intent'||intent.status!=='INTENT_ONLY'||
   intent.isApprovedPlan!==false||intent.mondaySyncAllowed!==false||
   intent.approvalEligible!==false||intent.boardId!==current.boardId||
   intent.version!==saved.version||intent.sha256!==saved.sha256||
   intent.bytes!==saved.bytes||
   current.validated?.version!==intent.version||
   current.validated?.sha256!==intent.sha256||
   saved.verification!=='content-sha256-and-etag')
   return false;
  const context={intent,saved,content:current.content,
   accountId:account.homeAccountId,tenantId:account.tenantId};
  if(!matching(current,context))return false;
  pending=context;sequence++;button.disabled=false;
  output.textContent='DRAFT v'+intent.version+' véglegesítési kérelme megérkezett.'+
   '\nSharePoint-fájl: '+saved.name+
   '\nAz Approved Plan létrehozásához külön megerősítés szükséges.'+
   '\nMonday-szinkron: TILTVA.';
  return true;
 }
 async function run(){
  if(!pending||busy||completed?.boardId===pending.intent.boardId&&
    completed?.version>=pending.intent.version)return;
  const p=pending,current=getCurrent(),requestVersion=sequence;
  if(!matching(current,p)){clear();return;}
  if(!confirm('A DRAFT v'+p.intent.version+
    ' verziójából jóváhagyott munkatervet hozunk létre a SharePoint Approved-Plans mappában. '+
    'A művelet nem módosítja a Monday-boardot. A mentéshez friss Graph-visszaellenőrzés történik. Folytatod?'))
   return;
  busy=true;button.disabled=true;
  output.textContent='SharePoint DRAFT ismételt Graph-ellenőrzése, majd Approved Plan mentése és teljes visszaolvasása...';
  try{
   const result=await save({
    draftText:p.content,saved:p.saved,intent:p.intent,
    boardId:p.intent.boardId,driveId,tenantId,accountTenantId:p.tenantId,
    getAccessToken:()=>getAccessToken(current.account),
    assertCurrent:()=>sequence===requestVersion&&matching(getCurrent(),p)
   });
   completed={boardId:p.intent.boardId,version:p.intent.version};pending=null;
   if(!matching(getCurrent(),p)||sequence!==requestVersion){
    output.textContent='Az Approved Plan mentése megtörténhetett, de a munkamenet közben változott. '+
     'Ellenőrizd közvetlenül a SharePoint Approved-Plans mappát. Fájl: '+result.name;
    return;
   }
   output.textContent='Approved Plan létrehozva és Graph SHA-256/eTag visszaellenőrizve.'+
    '\nFájl: '+result.path+
    '\nSHA-256: '+result.sha256+'\neTag: '+result.eTag+
    '\nForrás DRAFT SHA-256: '+result.sourceDraftSha256+
    '\nMonday-szinkron: NEM INDULT EL.';
  }catch(error){
   pending=null;completed={boardId:p.intent.boardId,version:p.intent.version}; // Unknown upload result must not be retried from this tab.
   if(sequence===requestVersion)
    output.textContent='Approved Plan mentése nem igazolt: '+(error?.message||error)+
     '\nNe próbáld automatikusan újra! Ellenőrizd az Approved-Plans mappát.';
  }finally{
   busy=false;button.disabled=true;
  }
 }
 button.addEventListener('click',run);
 clear();
 return Object.freeze({receive,clear,hasPending:()=>!!pending});
}
