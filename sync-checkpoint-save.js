import {checkApproverPreflight} from './approver-identity-preflight.js';

// Checkpoint preparation does not execute, authorize, or resume Monday writes.
// Files are immutable. A previous or uncertain result is never overwritten.
const MAX_BYTES=5_000_000;
const hosts=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
const hex64=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const sha=async bytes=>Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const safeUrl=text=>{
 let url;
 try{url=new URL(text);}catch{throw Error('Graph ideiglenes URL hianyzik.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||
    !hosts.some(x=>url.hostname.toLowerCase().endsWith(x)))
  throw Error('Nem megbizhato Graph ideiglenes URL.');
 return url.href;
};
const validBoard=v=>typeof v==='string'&&/^\d{5,20}$/.test(v);
const iso=v=>typeof v==='string'&&/Z$/.test(v)&&Number.isFinite(Date.parse(v));
const contentBytes=data=>new TextEncoder().encode(JSON.stringify(data,null,2)+'\n');

function verifyInputs({approved,report,boardId,driveId,now}){
 const plan=approved?.approvedPlan;
 if(!validBoard(boardId)||!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
    approved?.status!=='APPROVED_PLAN_STORED'||
    approved.boardId!==boardId||
    !Number.isSafeInteger(approved.version)||approved.version<1||
    !hex64(approved.sha256)||!hex64(approved.sourceDraftSha256)||
    !approved.id||!approved.eTag||
    approved.verification!=='content-sha256-and-etag'||
    approved.mondaySyncAllowed!==false||
    plan?.schemaVersion!==1||plan.format!=='flow-lps-approved-plan'||
    plan.status!=='APPROVED'||plan.isApprovedPlan!==true||
    plan.mondaySyncAllowed!==false||plan.syncStatus!=='NOT_STARTED'||
    plan.boardId!==boardId||plan.draftVersion!==approved.version||
    plan.sourceDraft?.sha256!==approved.sourceDraftSha256||
    typeof plan.sourceFingerprint!=='string'||plan.sourceFingerprint.length<10||
    !Array.isArray(plan.plan?.working)||!plan.plan.working.length||
    !Array.isArray(plan.plan?.base?.tasks)||
    plan.plan.base.tasks.length!==plan.plan.working.length)
  throw Error('A jovahagyott terv vagy a SharePoint igazolas hibas.');
 const name='approved-v'+approved.version+'-'+approved.sourceDraftSha256.slice(0,24)+'.json';
 if(approved.name!==name||
    approved.path!=='Projects/'+boardId+'/Approved-Plans/'+name)
  throw Error('Az Approved Plan fajlazonositoja elter.');
 const counts=report?.fieldCounts;
 if(report?.schemaVersion!==1||report.format!=='flow-lps-sync-preparation-report'||
    report.status!=='BOARD_PRECHECK_ONLY'||
    report.boardId!==boardId||report.draftVersion!==approved.version||
    report.approvedPlanSha256!==approved.sha256||
    report.sourceDraftSha256!==approved.sourceDraftSha256||
    report.approvedFile!==approved.name||report.approvedETag!==approved.eTag||
    report.sourceFingerprint!==plan.sourceFingerprint||
    report.mondaySyncAllowed!==false||report.mondayWritten!==false||
    report.mutationCount!==0||
    report.checks?.currentMondaySnapshot!=='matched'||
    report.checks?.columnEncoding!=='passed'||
    !iso(report.checkedAt)||now-Date.parse(report.checkedAt)<0||
    now-Date.parse(report.checkedAt)>10*60*1000||
    typeof report.editorId!=='string'||!/^\d+$/.test(report.editorId)||
    report.editorId!==plan.finalization?.mondayEditorIdClaim||
    !Number.isSafeInteger(report.totalTasks)||report.totalTasks!==plan.plan.working.length||
    !Number.isSafeInteger(report.changedTasks)||report.changedTasks<1||
    report.changedTasks>report.totalTasks||
    !Number.isSafeInteger(report.fieldChanges)||report.fieldChanges<report.changedTasks||
    !Array.isArray(counts)||counts.length<1||counts.length>40||
    counts.some(x=>!x||typeof x.field!=='string'||!/^[a-zA-Z][A-Za-z0-9]{0,30}$/.test(x.field)||
     !Number.isSafeInteger(x.tasks)||x.tasks<1||x.tasks>report.totalTasks)||
    counts.reduce((n,x)=>n+x.tasks,0)!==report.fieldChanges)
  throw Error('A Monday szarazproba nem egyezik az Approved Plannel vagy elavult.');
 return {plan,name};
}

export async function saveSyncPreparationCheckpoint({
 approved,report,boardId,driveId,tenantId,accountTenantId,
 getAccessToken,fetcher=fetch,now=()=>new Date(),
 assertCurrent=()=>true
}={}){
 if(typeof getAccessToken!=='function'||typeof fetcher!=='function'||
    typeof assertCurrent!=='function')
  throw Error('Hibas Graph vagy munkamenet konfiguracio.');
 const when=now(),time=when instanceof Date?when.getTime():Date.parse(when);
 if(!Number.isFinite(time))throw Error('Ervenytelen checkpoint idopont.');
 const {plan,name:approvedName}=verifyInputs({approved,report,boardId,driveId,now:time});
 const check=()=>{
  if(assertCurrent()!==true)throw Error('A DRAFT vagy a Microsoft-munkamenet megvaltozott; checkpoint iras tiltva.');
 };
 check();
 // A SharePoint file must be re-read, not just trusted from postMessage.
 const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const request=async(path,options={})=>{
  const token=await getAccessToken();
  if(!token)throw Error('Microsoft Graph token hianyzik.');
  return fetcher(base+path,{method:'GET',cache:'no-store',redirect:'error',...options,
   headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
 };
 const path=segments=>'/root:/'+segments.map(encodeURIComponent).join('/');
 const approvedPath=path(['Projects',boardId,'Approved-Plans',approvedName]);
 const metadataUrl=approvedPath+'?$select=id,name,size,file,parentReference,eTag';
 const approvedBytes=contentBytes(plan);
 if(approvedBytes.byteLength>MAX_BYTES||await sha(approvedBytes)!==approved.sha256)
  throw Error('A SharePoint Approved Plan SHA-256 nem egyezik a helyi tervvel.');
 const verifyMetadata=async()=>{
  const response=await request(metadataUrl);
  if(!response.ok)throw Error('Approved Plan Graph metaadat HTTP '+response.status);
  const item=await response.json();
  if(item?.id!==approved.id||item.name!==approvedName||
     item.size!==approvedBytes.byteLength||!item.file||
     item.parentReference?.driveId!==driveId||item.eTag!==approved.eTag)
   throw Error('Approved Plan SharePoint fajlazonosito vagy eTag elter.');
  return item;
 };
 const first=await verifyMetadata();
 const itemResponse=await request('/items/'+encodeURIComponent(first.id));
 if(!itemResponse.ok)throw Error('Approved Plan letoltesi metaadat HTTP '+itemResponse.status);
 const item=await itemResponse.json();
 if(item?.id!==first.id||item.name!==approvedName||item.eTag!==first.eTag||
    item.size!==first.size||!item.file||item.parentReference?.driveId!==driveId)
  throw Error('Approved Plan Graph letoltesi fajl elter.');
 const download=await fetcher(safeUrl(item['@microsoft.graph.downloadUrl']),{
  method:'GET',cache:'no-store',redirect:'follow',mode:'cors',
  credentials:'omit',referrerPolicy:'no-referrer'});
 if(!download.ok)throw Error('Approved Plan fajl letoltese HTTP '+download.status);
 const cl=download.headers?.get?.('content-length');
 if(cl!==undefined&&cl!==null&&(!/^\d+$/.test(cl)||Number(cl)>MAX_BYTES))
  throw Error('Az Approved Plan fajl tul nagy.');
 const contents=await download.arrayBuffer();
 if(contents.byteLength!==approvedBytes.byteLength||
    contents.byteLength>MAX_BYTES||await sha(contents)!==approved.sha256)
  throw Error('Approved Plan teljes Graph SHA-256 ellenorzese sikertelen.');
 await verifyMetadata();
 // Same Entra user who saved the Approved Plan, with real SharePoint access.
 const identity=await checkApproverPreflight({
  getAccessToken,fetcher,tenantId,accountTenantId
 });
 if(identity.identity.objectId.toLowerCase()!==
    String(plan.finalization?.microsoftEntraObjectId||'').toLowerCase())
  throw Error('A Microsoft-felhasznalo nem az Approved Plan letrehozoja.');
 check();
 const checkpoint={
  schemaVersion:1,format:'flow-lps-sync-checkpoint',
  status:'PREPARED_NO_WRITES',boardId,
  approvedPlan:{
   name:approvedName,id:approved.id,eTag:approved.eTag,
   sha256:approved.sha256,draftVersion:approved.version,
   sourceDraftSha256:approved.sourceDraftSha256,driveId
  },
  mondaySourceFingerprint:plan.sourceFingerprint,
  mondayPreflight:{
   checkedAt:report.checkedAt,editorIdClaim:report.editorId,
   totalTasks:report.totalTasks,changedTasks:report.changedTasks,
   fieldChanges:report.fieldChanges,fieldCounts:report.fieldCounts,
   provenance:'origin-bound-browser-report-not-write-authorization'
  },
  preparedAt:new Date(time).toISOString(),
  preparedByEntraObjectId:identity.identity.objectId,
  progress:{cursor:0,verifiedTaskIds:[],inFlight:null,mondayWrites:0},
  mondaySyncAllowed:false,mondayWritten:false,
  writeAuthorization:'NOT_GRANTED',
  nextAction:'RECHECK_MON_DATA_AND_EXPLICITLY_CONFIRM_BEFORE_FIRST_MUTATION'
 };
 const bytes=contentBytes(checkpoint);
 if(bytes.byteLength>MAX_BYTES)throw Error('A checkpoint tul nagy.');
 const hash=await sha(bytes);
 const filename='sync-prepared-v'+approved.version+'-'+approved.sha256.slice(0,24)+'.json';
 const folderUrl=path(['Projects',boardId,'Sync-Status']);
 const folderResponse=await request(folderUrl+'?$select=id,name,folder,parentReference');
 if(!folderResponse.ok)throw Error('Sync-Status mappa HTTP '+folderResponse.status);
 const folder=await folderResponse.json();
 if(!folder?.id||folder.name!=='Sync-Status'||!folder.folder||
    folder.parentReference?.driveId!==driveId)
  throw Error('Hibas vagy hianyzo Sync-Status mappa.');
 const targetPath=path(['Projects',boardId,'Sync-Status',filename]);
 const exists=await request(targetPath+'?$select=id,name');
 if(exists.status!==404){
  if(exists.ok)throw Error('Ehhez az Approved Planhez mar van elokeszito checkpoint. Nincs feluliras.');
  throw Error('Sync-Status nevellenorzes HTTP '+exists.status);
 }
 check();
 const session=await request('/items/'+encodeURIComponent(folder.id)+':/'+encodeURIComponent(filename)+':/createUploadSession',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',name:filename}})
 });
 if(!session.ok)throw Error('Checkpoint upload session HTTP '+session.status);
 const sessionData=await session.json();
 const uploadUrl=safeUrl(sessionData?.uploadUrl);
 if(!Number.isFinite(Date.parse(sessionData?.expirationDateTime))||
    Date.parse(sessionData.expirationDateTime)<=Date.now())
  throw Error('Lejart SharePoint feltoltesi munkamenet.');
 check();
 let created;
 try{
  const uploaded=await fetcher(uploadUrl,{method:'PUT',mode:'cors',cache:'no-store',
   redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/octet-stream',
    'Content-Range':'bytes 0-'+(bytes.byteLength-1)+'/'+bytes.byteLength},body:bytes});
  if(uploaded.status!==201)throw Error('Graph checkpoint uj fajlletrehozas HTTP '+uploaded.status);
  created=await uploaded.json();
 }catch(e){
  throw Error('Checkpoint mentes allapota bizonytalan. NE probald automatikusan ujra: '+(e?.message||e));
 }
 if(!created?.id||created.name!==filename||created.size!==bytes.byteLength||!created.file)
  throw Error('Checkpoint letrehozas nem igazolt, kezi ellenorzes szukseges.');
 const readMetadata=async()=>{
  const response=await request(targetPath+'?$select=id,name,size,file,parentReference,eTag');
  if(!response.ok)throw Error('Checkpoint metadata HTTP '+response.status);
  const item=await response.json();
  if(item?.id!==created.id||item.name!==filename||
     item.size!==bytes.byteLength||item.parentReference?.driveId!==driveId||
     !item.file||!item.eTag)throw Error('Checkpoint metadata elter.');
  return item;
 };
 const before=await readMetadata();
 const infoResponse=await request('/items/'+encodeURIComponent(created.id));
 if(!infoResponse.ok)throw Error('Checkpoint letoltesi metadata HTTP '+infoResponse.status);
 const info=await infoResponse.json();
 if(info?.id!==before.id||info.name!==filename||info.eTag!==before.eTag||
    info.size!==bytes.byteLength||!info.file||
    info.parentReference?.driveId!==driveId)
  throw Error('Checkpoint letoltesi metadata elter.');
 const downloaded=await fetcher(safeUrl(info['@microsoft.graph.downloadUrl']),{
  method:'GET',mode:'cors',cache:'no-store',redirect:'follow',
  credentials:'omit',referrerPolicy:'no-referrer'});
 if(!downloaded.ok)throw Error('Checkpoint tartalom HTTP '+downloaded.status);
 const returned=await downloaded.arrayBuffer();
 if(returned.byteLength!==bytes.byteLength||await sha(returned)!==hash)
  throw Error('Checkpoint teljes SHA-256 ellenorzese sikertelen.');
 const after=await readMetadata();
 if(before.id!==after.id||before.eTag!==after.eTag||before.size!==after.size)
  throw Error('Checkpoint fajl a visszaellenorzes kozben megvaltozott.');
 return Object.freeze({
  status:'CHECKPOINT_PREPARED',boardId,draftVersion:approved.version,
  path:'Projects/'+boardId+'/Sync-Status/'+filename,
  name:filename,id:after.id,eTag:after.eTag,sha256:hash,
  approvedPlanSha256:approved.sha256,
  verification:'content-sha256-and-etag',mondayWrites:0,
  mondaySyncAllowed:false,mondayWritten:false
 });
}
