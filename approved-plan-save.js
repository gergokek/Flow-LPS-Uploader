import {validateEditedDraft} from './edited-draft-validator.js';
import {inspectSavedDraftForReview} from './review-ready-preflight.js';

const root='https://graph.microsoft.com/v1.0/drives/';
const maxBytes=5_000_000;
const safeHosts=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
const hex64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sha256=async bytes=>Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function safeUrl(text){
 let url;
 try{url=new URL(text);}catch{throw Error('Graph upload/download URL hianyzik vagy ervenytelen.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||
    !safeHosts.some(host=>url.hostname.toLowerCase().endsWith(host)))
  throw Error('Nem megbizhato Graph feltoltesi vagy letoltesi URL.');
 return url.href;
}
function checkIntent(intent,summary,saved,boardId,now){
 if(intent?.schemaVersion!==1||intent.format!=='flow-lps-draft-finalization-intent'||
  intent.status!=='INTENT_ONLY'||intent.isApprovedPlan!==false||
  intent.mondaySyncAllowed!==false||intent.approvalEligible!==false||
  intent.boardId!==boardId||intent.version!==summary.version||
  intent.sha256!==summary.sha256||intent.bytes!==summary.bytes||
  typeof intent.editorId!=='string'||!/^\d+$/.test(intent.editorId)||
  saved?.boardId!==boardId||saved.version!==summary.version||
  saved.sha256!==summary.sha256||saved.bytes!==summary.bytes||
  saved.verification!=='content-sha256-and-etag'||
  !saved.id||!saved.eTag||!saved.name)
  throw Error('A veglegesitesi szandek es a SharePoint DRAFT nem egyezik.');
 const confirmed=Date.parse(intent.confirmedAt);
 if(typeof intent.confirmedAt!=='string'||!/Z$/.test(intent.confirmedAt)||
  !Number.isFinite(confirmed)||Math.abs(now-confirmed)>15*60*1000)
  throw Error('A veglegesitesi szandek lejart; uj Monday megerosites szukseges.');
}
async function graph(fetcher,rootUrl,path,getAccessToken,options={}){
 const token=await getAccessToken();
 if(typeof token!=='string'||!token)throw Error('Microsoft Graph token hianyzik.');
 const response=await fetcher(rootUrl+path,{
  method:'GET',cache:'no-store',redirect:'error',...options,
  headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}
 });
 return response;
}
export async function saveApprovedPlan({
 draftText,saved,intent,boardId,driveId,tenantId,accountTenantId,
 getAccessToken,fetcher=fetch,now=()=>new Date(),inspect=inspectSavedDraftForReview,
 assertCurrent=()=>true
}={}){
 if(typeof fetcher!=='function'||typeof getAccessToken!=='function'||typeof inspect!=='function'||
    typeof assertCurrent!=='function'||
    !/^b![-_A-Za-z0-9]+$/.test(driveId||'')||!/^\d{5,20}$/.test(boardId||''))
  throw Error('Hibas SharePoint kapcsolat vagy boardazonosito.');
 const requireCurrent=()=>{if(assertCurrent()!==true)
  throw Error('A DRAFT vagy a Microsoft-munkamenet idokozben megvaltozott; nincs jovahagyasi iras.');};
 requireCurrent();
 const time=now(),millis=time instanceof Date?time.getTime():Date.parse(time);
 if(!Number.isFinite(millis))throw Error('Ervenytelen veglegesitesi ido.');
 const summary=await validateEditedDraft(draftText,boardId);
 checkIntent(intent,summary,saved,boardId,millis);
 // A postMessage receipt never authorizes a write: independently verify the
 // actual saved bytes/eTag with delegated Graph and identify the Microsoft user.
 const report=await inspect({draftText,saved,boardId,driveId,tenantId,
  accountTenantId,getAccessToken,fetcher});
 if(report?.boardId!==boardId||report.version!==summary.version||
  report.sha256!==summary.sha256||report.bytes!==summary.bytes||
  report.file?.id!==saved.id||report.file?.eTag!==saved.eTag||
  report.checks?.graphContent!=='verified-sha256-and-etag'||
  report.checks?.entraIdentity!=='verified-graph-me'||
  !/^[0-9a-f-]{36}$/i.test(report.identity?.objectId||''))
  throw Error('A friss Graph DRAFT-visszaolvasas vagy Entra azonossag nem igazolt.');
 checkIntent(intent,summary,saved,boardId,Date.now());
 requireCurrent();
 const draft=JSON.parse(draftText);
 const approvedAt=new Date(millis).toISOString();
 const plan={
  schemaVersion:1,format:'flow-lps-approved-plan',status:'APPROVED',
  isApprovedPlan:true,mondaySyncAllowed:false,syncStatus:'NOT_STARTED',
  boardId,draftVersion:summary.version,
  sourceFingerprint:draft.source,
  sourceDraft:{
   name:saved.name,itemId:saved.id,eTag:saved.eTag,
   sha256:summary.sha256,bytes:summary.bytes,driveId
  },
  finalization:{
   confirmedAt:intent.confirmedAt,approvedAt,
   mondayEditorIdClaim:intent.editorId,
   microsoftEntraTenantId:tenantId,
   microsoftEntraObjectId:report.identity.objectId,
   microsoftUserPrincipalName:report.identity.userPrincipalName,
   note:'Monday editor ID is from an origin-bound browser request, not a server-issued identity token.'
  },
  plan:{base:draft.base,working:draft.working,history:draft.history}
 };
 const bytes=new TextEncoder().encode(JSON.stringify(plan,null,2)+'\n');
 if(bytes.byteLength>maxBytes)throw Error('A veglegesitett terv tul nagy; nem indul SharePoint-iras.');
 const hash=await sha256(bytes);
 // Stable name: the same DRAFT cannot silently produce a second approval file.
 const name='approved-v'+summary.version+'-'+summary.sha256.slice(0,24)+'.json';
 const path='Projects/'+boardId+'/Approved-Plans/'+name;
 const base=root+encodeURIComponent(driveId);
 const folderPath='/root:/Projects/'+boardId+'/Approved-Plans';
 const folderRes=await graph(fetcher,base,folderPath+'?$select=id,name,folder,parentReference',getAccessToken);
 if(!folderRes.ok)throw Error('Approved-Plans mappa ellenorzese HTTP '+folderRes.status);
 const folder=await folderRes.json();
 if(!folder?.id||folder.name!=='Approved-Plans'||!folder.folder||
    folder.parentReference?.driveId!==driveId)
  throw Error('Hibas vagy eltero Approved-Plans SharePoint mappa.');
 const targetPath='/root:/'+path.split('/').map(encodeURIComponent).join('/');
 const existing=await graph(fetcher,base,targetPath+'?$select=id,name,size',getAccessToken);
 if(existing.status!==404){
  if(existing.ok)throw Error('Ehhez a DRAFT-hoz mar letezik Approved Plan. Nincs feluliras.');
  throw Error('Approved Plan nevellenorzes HTTP '+existing.status);
 }
 // Graph upload session with conflictBehavior=fail protects the destination.
 // A failed or uncertain upload is NEVER automatically retried.
 requireCurrent();
 const sessionRes=await graph(fetcher,base,
  '/items/'+encodeURIComponent(folder.id)+':/'+encodeURIComponent(name)+':/createUploadSession',
  getAccessToken,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',name}})});
 if(!sessionRes.ok)throw Error('Approved Plan feltoltesi munkamenet HTTP '+sessionRes.status);
 const session=await sessionRes.json();
 const uploadUrl=safeUrl(session?.uploadUrl);
 const expiry=Date.parse(session?.expirationDateTime);
 if(!Number.isFinite(expiry)||expiry<=Date.now())
  throw Error('A Graph feltoltesi munkamenet lejart.');
 requireCurrent();
 let created;
 try{
  const uploaded=await fetcher(uploadUrl,{method:'PUT',mode:'cors',cache:'no-store',
   redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/octet-stream',
    'Content-Range':'bytes 0-'+(bytes.byteLength-1)+'/'+bytes.byteLength},body:bytes});
  if(uploaded.status!==201)
   throw Error('A Graph nem igazolt uj fajlletrehozast: HTTP '+uploaded.status);
  created=await uploaded.json();
 }catch(err){
  const failure=new Error('A feltoltes allapota bizonytalan. NE probald ujra, ellenorizd az Approved-Plans mappat: '+(err?.message||err));
  failure.maybeUploaded={path,name};
  throw failure;
 }
 if(!created?.id||created.name!==name||created.size!==bytes.byteLength||
    !created.file)
  throw Error('Approved Plan feltoltes visszajelzese elter; ellenorizd a fajlt, ne probald automatikusan ujra.');
 const readMetadata=async()=>{
  const response=await graph(fetcher,base,targetPath+
   '?$select=id,name,size,file,parentReference,eTag',getAccessToken);
  if(!response.ok)throw Error('Approved Plan metaadat visszaolvasas HTTP '+response.status);
  const item=await response.json();
  if(item?.id!==created.id||item.name!==name||item.size!==bytes.byteLength||
     !item.file||item.parentReference?.driveId!==driveId||
     typeof item.eTag!=='string'||!item.eTag)
   throw Error('Approved Plan SharePoint metaadat elter.');
  return item;
 };
 const first=await readMetadata();
 const itemResult=await graph(fetcher,base,'/items/'+encodeURIComponent(first.id),getAccessToken);
 if(!itemResult.ok)throw Error('Approved Plan letoltesi metaadat HTTP '+itemResult.status);
 const item=await itemResult.json();
 if(item?.id!==first.id||item.name!==name||item.size!==bytes.byteLength||
    item.eTag!==first.eTag||item.parentReference?.driveId!==driveId||
    !item.file)
  throw Error('Approved Plan letoltesi fajlazonosito elter.');
 const downloadUrl=safeUrl(item['@microsoft.graph.downloadUrl']);
 const downloaded=await fetcher(downloadUrl,{method:'GET',mode:'cors',cache:'no-store',
  redirect:'follow',credentials:'omit',referrerPolicy:'no-referrer'});
 if(!downloaded.ok)throw Error('Approved Plan tartalmi visszaolvasas HTTP '+downloaded.status);
 const raw=await downloaded.arrayBuffer();
 if(raw.byteLength!==bytes.byteLength||raw.byteLength>maxBytes||
    await sha256(raw)!==hash)
  throw Error('Approved Plan teljes SHA-256 ellenorzese sikertelen.');
 const second=await readMetadata();
 if(first.eTag!==second.eTag||first.id!==second.id||
    first.size!==second.size)
  throw Error('Az Approved Plan fajl a visszaellenorzes kozben megvaltozott.');
 return Object.freeze({
  status:'APPROVED_PLAN_STORED',boardId,version:summary.version,
  name,id:first.id,eTag:first.eTag,path,bytes:bytes.byteLength,
  sha256:hash,sourceDraftSha256:summary.sha256,
  // This exact plan was serialized and read back byte-for-byte via Graph.
  // Available only for a read-only Monday dry-run; not an authorization token.
  approvedPlan:plan,
  verification:'content-sha256-and-etag',mondaySyncAllowed:false,
  checks:{freshSourceDraftGraph:'passed',entraIdentity:'passed',
   createdWithoutOverwrite:'passed',approvedPlanGraphReadback:'passed'}
 });
}
