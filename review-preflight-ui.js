import {inspectSavedDraftForReview} from './review-ready-preflight.js';

// UI-only, opt-in, fail-closed control. Neither the evidence nor identity check
// is an approval, and no postMessage or Monday write is performed here.
export function mountSavedDraftReview({
 button,output,getCurrent,getAccessToken,tenantId,driveId,
 inspect=inspectSavedDraftForReview
}={}){
 if(!button||!output||typeof getCurrent!=='function'||
    typeof getAccessToken!=='function'||typeof inspect!=='function')
  throw Error('Missing review UI configuration');
 let last=null,version=0,busy=false;
 const pendingMessage='Nincs aktuális, újraellenőrzésre előkészített DRAFT-mentés.';
 function clear(){
  version++;
  last=null;
  button.disabled=true;
  output.textContent=pendingMessage;
 }
 const matches=(current,proof)=>!!current?.content&&!!current?.validated&&
  !!current?.account&&proof&&current.boardId===proof.boardId&&
  current.validated.version===proof.version&&
  current.validated.sha256===proof.sha256&&
  current.validated.bytes===proof.bytes;
 function record(saved,revision,hash,content){
  const current=getCurrent();
  if(!saved||current.content!==content||!current.account||
     current.validated?.version!==revision||current.validated?.sha256!==hash||
     saved.boardId!==current.boardId||saved.sha256!==hash||
     saved.bytes!==current.validated.bytes||saved.verification!=='content-sha256-and-etag')
   return false;
  const proof=Object.freeze({...saved,version:revision});
  if(!matches(current,proof))return false;
  version++;
  last=proof;
  output.textContent='DRAFT v'+revision+' mentési visszaigazolása megvan. A független Graph és Entra ellenőrzés indítható.';
  button.disabled=busy;
  return true;
 }
 async function run(){
  if(busy||!last)return;
  const current=getCurrent(),proof=last,requestVersion=version;
  const account=current.account;
  const accountId=account?.homeAccountId,accountTenantId=account?.tenantId;
  if(!matches(current,proof)){clear();return;}
  busy=true;button.disabled=true;
  output.textContent='Friss SharePoint Graph és Microsoft Entra ellenőrzés folyamatban...';
  try{
   const result=await inspect({
    draftText:current.content,saved:proof,boardId:current.boardId,driveId,
    tenantId,accountTenantId,
    getAccessToken:()=>getAccessToken(account)
   });
   const next=getCurrent();
   if(requestVersion!==version||last!==proof||!matches(next,proof)||
      next.content!==current.content||
      next.account?.homeAccountId!==accountId||
      next.account?.tenantId!==accountTenantId)
    throw Error('A DRAFT vagy a Microsoft-munkamenet időközben megváltozott.');
   output.textContent='DRAFT v'+result.version+' – független Graph-visszaellenőrzés: SIKERES.'+
    '\nSHA-256 és eTag ellenőrzött. SHA-256: '+result.sha256+
    '\nMicrosoft Entra /me: '+result.identity.userPrincipalName+
    ' ('+result.identity.objectId+')'+
    '\nKülön jóváhagyói csoport nem szükséges. A véglegesítésre a Monday-ben jogosult szerkesztő jogosult.'+
    '\nJóváhagyás: TILTVA. Monday-szinkron: TILTVA.'+
    '\nA böngészős ellenőrzés nem szerveroldali jogosultsági bizonyíték.';
  }catch(e){
   if(requestVersion===version)
    output.textContent='Graph/Entra ellenőrzés sikertelen: '+(e?.message||e)+
     '. Jóváhagyás és Monday-szinkron továbbra is tiltva.';
  }finally{
   busy=false;
   button.disabled=!last||!getCurrent().account;
  }
 }
 button.addEventListener('click',run);
 clear();
 return Object.freeze({record,clear});
}
