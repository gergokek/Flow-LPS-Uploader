import {inspectSingleTaskRecovery} from './sync-recovery-inspect.js';
import {reconcileVerifiedBatchLedger} from './sync-batch-ledger.js';

// Re-read every matching journal file directly from SharePoint. GET only.
// A SharePoint list entry alone, a UI receipt or a stale browser cache never
// grants a second/third batch or proves a Monday mutation succeeded.
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fileSha=async buffer=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',buffer)),x=>x.toString(16).padStart(2,'0')).join('');
function safeDownload(input){
 let u;try{u=new URL(input);}catch{throw Error('Hianyzo Graph letoltesi URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    !['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
      '.1drv.com','.blob.core.windows.net'].some(host=>
       u.hostname.toLowerCase().endsWith(host)))
  throw Error('Nem megbizhato SharePoint tartalomforras.');
 return u.href;
}
export async function inspectStoredBatchProgress({
 boardId,driveId,approvedReceipt,checkpointReceipt,
 getAccessToken,fetcher=fetch,assertCurrent=()=>true,
 inspectPilot=inspectSingleTaskRecovery,
 now=()=>new Date()
}={}){
 if(boardId!=='5107075373'||!/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
    typeof getAccessToken!=='function'||typeof fetcher!=='function'||
    typeof assertCurrent!=='function'||typeof inspectPilot!=='function'||
    typeof now!=='function'||
    approvedReceipt?.status!=='APPROVED_PLAN_STORED'||
    approvedReceipt.boardId!==boardId||!hex(approvedReceipt.sha256)||
    approvedReceipt.approvedPlan?.format!=='flow-lps-approved-plan'||
    approvedReceipt.approvedPlan.boardId!==boardId||
    checkpointReceipt?.status!=='CHECKPOINT_PREPARED'||
    checkpointReceipt.boardId!==boardId||!hex(checkpointReceipt.sha256)||
    checkpointReceipt.approvedPlanSha256!==approvedReceipt.sha256)
  throw Error('Batch recovery: hianyzo, ellenorzott TEST Approved Plan vagy checkpoint.');
 const check=()=>{if(assertCurrent()!==true)
  throw Error('A Graph/MSAL munkamenet megvaltozott a recovery kozben.');};
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const graph=async url=>{
  check();const token=await getAccessToken();if(!token)throw Error('Graph token hianyzik.');
  return fetcher(url,{method:'GET',cache:'no-store',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 };
 // Pilot evidence is re-read and the delegated Entra /me identity checked.
 const pilotReport=await inspectPilot({boardId,driveId,approvedReceipt,checkpointReceipt,
  getAccessToken,fetcher,assertCurrent});
 if(pilotReport.status!=='RESULT_VERIFIED')
  throw Error('A pilot-naplo nem teljesen ellenorzott, tovabbi batch NEM engedelyezheto.');
 const folder=['Projects',boardId,'Sync-Status'];
 const listUrl=root+'/root:/'+folder.map(encodeURIComponent).join('/')+
  ':/children?$select=id,name,size,file,eTag&$top=200';
 const expected='sync-batch-'+approvedReceipt.sha256.slice(0,24)+'-';
 const listed=new Map(),seenUrls=new Set();
 let url=listUrl;
 for(let page=0;url&&page<20;page++){
  if(!url.startsWith(root+'/')||seenUrls.has(url)||url.length>4000)
   throw Error('Idegen vagy ismetlodo SharePoint naplolista lapozas.');
  seenUrls.add(url);
  const response=await graph(url);
  if(!response.ok)throw Error('SharePoint batch-naplolista HTTP '+response.status);
  const pageData=await response.json();
  if(!Array.isArray(pageData.value))throw Error('Hibas Graph batch-naplolista.');
  for(const item of pageData.value){
   if(typeof item?.name!=='string'||!item.name.startsWith(expected))continue;
   if(listed.has(item.name)||!item.id||!item.eTag||!item.file||
      !Number.isSafeInteger(item.size)||item.size<1||item.size>5_000_000)
    throw Error('Duplikalt vagy hianyos SharePoint batch-naplo.');
   listed.set(item.name,item);
   if(listed.size>500)throw Error('Tul sok TEST batch-naplo.');
  }
  url=pageData['@odata.nextLink']||null;
 }
 if(url)throw Error('Nem teljes SharePoint batch-naplolista, minden iras tiltva.');
 const location=name=>root+'/root:/'+[...folder,name].map(encodeURIComponent)
  .join('/')+'?$select=id,name,size,file,eTag,parentReference';
 async function verify(name,selected){
  const metadata=async()=>{
   check();
   const response=await graph(location(name));
   if(!response.ok)throw Error('SharePoint batch metadata HTTP '+response.status);
   const item=await response.json();
   if(item?.id!==selected.id||item.name!==name||
      item.eTag!==selected.eTag||item.size!==selected.size||
      !item.file||item.parentReference?.driveId!==driveId)
    throw Error('Batch fajlmetadata vagy eTag elter: '+name);
   return item;
  };
  const first=await metadata();
  const detailResponse=await graph(root+'/items/'+encodeURIComponent(first.id));
  if(!detailResponse.ok)throw Error('Batch file detail HTTP '+detailResponse.status);
  const info=await detailResponse.json();
  if(info?.id!==first.id||info.name!==name||info.size!==first.size||
     info.eTag!==first.eTag||!info.file||info.parentReference?.driveId!==driveId)
   throw Error('Batch letoltesi metadata elter: '+name);
  const downloaded=await fetcher(safeDownload(info['@microsoft.graph.downloadUrl']),{
   method:'GET',cache:'no-store',mode:'cors',redirect:'follow',
   credentials:'omit',referrerPolicy:'no-referrer'});
  if(!downloaded.ok)throw Error('Batch-naplo tartalom HTTP '+downloaded.status);
  const contents=await downloaded.arrayBuffer();
  check();
  if(contents.byteLength!==first.size)throw Error('Batch-naplo merete elter: '+name);
  const hash=await fileSha(contents);
  let data;
  try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(contents));}
  catch{throw Error('Hibas batch naplo JSON: '+name);}
  const after=await metadata();
  if(after.eTag!==first.eTag||after.id!==first.id||after.size!==first.size)
   throw Error('Batch-naplo idokozben megvaltozott: '+name);
  return Object.freeze({name,id:first.id,eTag:first.eTag,
   sha256:hash,value:data});
 }
 // Sequential network work makes each proof individually attributable.
 const files=[];
 for(const [name,selected] of [...listed].sort(([a],[b])=>a.localeCompare(b))){
  files.push(await verify(name,selected));
 }
 check();
 return reconcileVerifiedBatchLedger({
  boardId,approvedPlan:approvedReceipt.approvedPlan,
  approvedReceipt,checkpointReceipt,pilotReport,
  journalFiles:files,inspectedAt:now()
 });
}
