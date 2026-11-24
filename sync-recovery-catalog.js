import {inspectSingleTaskRecovery} from './sync-recovery-inspect.js';
import {inspectStoredBatchProgress} from './sync-batch-recovery-inspect.js';

// Read-only discovery of older, immutable TEST checkpoints after an Uploader
// tab or browser was closed. A listing is not itself write authorization.
const pattern=/^sync-prepared-v([1-9]\d*)-([0-9a-f]{24})\.json$/;
const validURL=value=>{
 let u;try{u=new URL(value);}catch{throw Error('Hibas ideiglenes SharePoint URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    !['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
      '.1drv.com','.blob.core.windows.net'].some(s=>u.hostname.toLowerCase().endsWith(s)))
  throw Error('Tiltott Graph letoltesi URL.');
 return u.href;
};
const sha=async buffer=>Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);

export function createStoredSyncRecovery({
 boardId,driveId,getAccessToken,fetcher=fetch,
 assertCurrent=()=>true,inspect=inspectSingleTaskRecovery,
 inspectBatch=inspectStoredBatchProgress
}={}){
 if(boardId!=='5107075373'||!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
    typeof getAccessToken!=='function'||typeof fetcher!=='function'||
    typeof assertCurrent!=='function'||typeof inspect!=='function'||
    typeof inspectBatch!=='function')
  throw Error('A tarolt recovery csak az izolalt TEST-tarhelyen erheto el.');
 const base='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const dir=(folder,name)=>'/root:/'+['Projects',boardId,folder,name]
  .map(encodeURIComponent).join('/');
 const guard=()=>{if(assertCurrent()!==true)throw Error('A Microsoft-munkamenet megvaltozott.');};
 const graph=async(url)=>{
  guard();const token=await getAccessToken();if(!token)throw Error('Graph token hianyzik.');
  return fetcher(url,{method:'GET',cache:'no-store',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 };
 async function read(folder,name,expected=null){
  const path=base+dir(folder,name)+'?$select=id,name,size,file,parentReference,eTag';
  const metadata=async()=>{
   const response=await graph(path);
   if(!response.ok)throw Error('SharePoint fajlmetadata HTTP '+response.status+': '+name);
   const item=await response.json();
   if(item?.name!==name||!item.id||!item.eTag||!item.file||
      !Number.isSafeInteger(item.size)||item.size<1||item.size>5_000_000||
      item.parentReference?.driveId!==driveId||
      expected&&(item.id!==expected.id||item.eTag!==expected.eTag))
    throw Error('SharePoint fajlazonosito vagy eTag elter: '+name);
   return item;
  };
  const first=await metadata();
  const response=await graph(base+'/items/'+encodeURIComponent(first.id));
  if(!response.ok)throw Error('SharePoint download metadata HTTP '+response.status);
  const info=await response.json();
  if(info?.id!==first.id||info.name!==name||info.eTag!==first.eTag||
     info.size!==first.size||!info.file||info.parentReference?.driveId!==driveId)
   throw Error('SharePoint download metadata elter: '+name);
  const contents=await fetcher(validURL(info['@microsoft.graph.downloadUrl']),{
   method:'GET',mode:'cors',cache:'no-store',redirect:'follow',
   credentials:'omit',referrerPolicy:'no-referrer'});
  if(!contents.ok)throw Error('SharePoint letoltes HTTP '+contents.status);
  const bytes=await contents.arrayBuffer(),hash=await sha(bytes);
  if(bytes.byteLength!==first.size||expected?.sha256&&hash!==expected.sha256)
   throw Error('SharePoint tartalom SHA-256 vagy meret elter: '+name);
  const after=await metadata();
  if(after.id!==first.id||after.eTag!==first.eTag||after.size!==first.size)
   throw Error('SharePoint fajl megvaltozott ellenorzes kozben: '+name);
  let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('Hibas tarolt SharePoint JSON: '+name);}
  guard();
  return Object.freeze({name,id:first.id,eTag:first.eTag,sha256:hash,value});
 }
 async function list(){
  const results=[],seen=new Set();
  const listPath='/root:/'+['Projects',boardId,'Sync-Status']
   .map(encodeURIComponent).join('/')+':/children?$select=id,name,size,eTag,lastModifiedDateTime,file&$top=200';
  let url=base+listPath;
  for(let page=0;url&&page<10;page++){
   if(seen.has(url))throw Error('Ismetlodo Graph lapozas a checkpoint listaban.');
   seen.add(url);
   if(!url.startsWith(base+'/'))throw Error('Elteto Graph lapozasi hoszt vagy drive.');
   const response=await graph(url);
   if(!response.ok)throw Error('SharePoint Sync-Status lista HTTP '+response.status);
   const data=await response.json();
   if(!Array.isArray(data?.value))throw Error('Hibas SharePoint fajllista.');
   for(const item of data.value){
    if(!pattern.test(item?.name||''))continue;
    if(!item.id||!item.eTag||!item.file)throw Error('Hianyos elokeszito checkpoint metadata.');
    results.push({name:item.name,id:item.id,eTag:item.eTag,
     modified:item.lastModifiedDateTime||''});
    if(results.length>1000)throw Error('Tul sok tarolt checkpoint a TEST-tarhelyen.');
   }
   url=data['@odata.nextLink']||null;
   if(url&&(!url.startsWith(base+'/')||url.length>3000))
    throw Error('Nem megengedett Graph lapozasi URL.');
  }
  if(url)throw Error('SharePoint checkpoint lapozasi korlat, hianyos lista.');
  return Object.freeze(results.sort((a,b)=>b.modified.localeCompare(a.modified)||
   b.name.localeCompare(a.name)));
 }
 async function inspectNamed(checkpointName){
  const match=typeof checkpointName==='string'&&checkpointName.match(pattern);
  if(!match)throw Error('Hibas recovery checkpoint fajlnev.');
  const cpFile=await read('Sync-Status',checkpointName);
  const cp=cpFile.value;
  if(cp?.schemaVersion!==1||cp.format!=='flow-lps-sync-checkpoint'||
     cp.status!=='PREPARED_NO_WRITES'||cp.boardId!==boardId||
     cp.mondaySyncAllowed!==false||cp.mondayWritten!==false||
     cp.writeAuthorization!=='NOT_GRANTED'||cp.progress?.cursor!==0||
     cp.progress?.mondayWrites!==0||cp.progress?.inFlight!==null||
     !Array.isArray(cp.progress?.verifiedTaskIds)||
     cp.progress.verifiedTaskIds.length!==0||
     cp.approvedPlan?.draftVersion!==Number(match[1])||
     cp.approvedPlan?.sha256?.slice(0,24)!==match[2]||
     cp.approvedPlan?.driveId!==driveId||
     !hex(cp.approvedPlan?.sha256)||!hex(cp.approvedPlan?.sourceDraftSha256)||
     !cp.approvedPlan?.name||!cp.approvedPlan?.id||!cp.approvedPlan?.eTag)
   throw Error('A tarolt elokeszito checkpoint nem a projekt ervenyes alapja.');
  const approved=await read('Approved-Plans',cp.approvedPlan.name,{
   id:cp.approvedPlan.id,eTag:cp.approvedPlan.eTag,
   sha256:cp.approvedPlan.sha256
  });
  const plan=approved.value;
  if(plan?.schemaVersion!==1||plan.format!=='flow-lps-approved-plan'||
     plan.status!=='APPROVED'||plan.isApprovedPlan!==true||
     plan.mondaySyncAllowed!==false||plan.syncStatus!=='NOT_STARTED'||
     plan.boardId!==boardId||plan.draftVersion!==cp.approvedPlan.draftVersion||
     plan.sourceDraft?.sha256!==cp.approvedPlan.sourceDraftSha256||
     plan.sourceFingerprint!==cp.mondaySourceFingerprint||
     cp.approvedPlan.name!=='approved-v'+plan.draftVersion+'-'+
      plan.sourceDraft.sha256.slice(0,24)+'.json')
   throw Error('A tarolt Approved Plan es az elokeszito checkpoint elter.');
  const approvedReceipt={
   status:'APPROVED_PLAN_STORED',boardId,version:plan.draftVersion,
   sha256:approved.sha256,sourceDraftSha256:cp.approvedPlan.sourceDraftSha256,
   id:approved.id,eTag:approved.eTag,name:approved.name,
   path:'Projects/'+boardId+'/Approved-Plans/'+approved.name,
   verification:'content-sha256-and-etag',mondaySyncAllowed:false,
   approvedPlan:plan
  };
  const checkpointReceipt={
   status:'CHECKPOINT_PREPARED',boardId,draftVersion:plan.draftVersion,
   approvedPlanSha256:approved.sha256,sha256:cpFile.sha256,
   name:cpFile.name,id:cpFile.id,eTag:cpFile.eTag,
   path:'Projects/'+boardId+'/Sync-Status/'+cpFile.name,
   verification:'content-sha256-and-etag',
   mondayWrites:0,mondaySyncAllowed:false,checkpoint:cp
  };
  const report=await inspect({boardId,driveId,approvedReceipt,checkpointReceipt,
   getAccessToken,fetcher,assertCurrent});
  const batchReport=report.status==='RESULT_VERIFIED'?await inspectBatch({
   boardId,driveId,approvedReceipt,checkpointReceipt,
   getAccessToken,fetcher,assertCurrent
  }):null;
  return Object.freeze({report,batchReport,approvedReceipt,checkpointReceipt});
 }
 return Object.freeze({list,inspectNamed});
}
