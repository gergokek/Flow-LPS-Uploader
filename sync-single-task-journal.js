// TEST-only durable single-task journal. No Monday API calls or retry logic.
// Every event is a new immutable Graph file; all source/proof bytes are
// re-read before any SharePoint journal write.
const root='https://graph.microsoft.com/v1.0/drives/';
const allowed=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
 x=>x.toString(16).padStart(2,'0')).join('');
const bytes=value=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const short=s=>typeof s==='string'&&s.length>0;
function url(value){
 let parsed;
 try{parsed=new URL(value);}catch{throw Error('Hibas Graph ideiglenes URL.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
    !allowed.some(suffix=>parsed.hostname.toLowerCase().endsWith(suffix)))
  throw Error('Nem megbizhato letoltesi vagy feltoltesi hoszt.');
 return parsed.href;
}
function verify({entry,checkpointReceipt,approvedReceipt,boardId,kind,aheadReceipt}){
 if(!/^\d{5,20}$/.test(boardId||'')||
    checkpointReceipt?.status!=='CHECKPOINT_PREPARED'||
    checkpointReceipt.boardId!==boardId||!hex(checkpointReceipt.sha256)||
    checkpointReceipt.mondayWrites!==0||checkpointReceipt.mondaySyncAllowed!==false||
    checkpointReceipt.verification!=='content-sha256-and-etag'||
    !short(checkpointReceipt.id)||!short(checkpointReceipt.eTag)||
    approvedReceipt?.status!=='APPROVED_PLAN_STORED'||
    approvedReceipt.boardId!==boardId||!hex(approvedReceipt.sha256)||
    approvedReceipt.mondaySyncAllowed!==false||
    approvedReceipt.verification!=='content-sha256-and-etag'||
    checkpointReceipt.approvedPlanSha256!==approvedReceipt.sha256||
    entry?.schemaVersion!==1||entry.boardId!==boardId||
    !/^\d+$/.test(entry.taskId||'')||
    entry.approvedSha256!==approvedReceipt.sha256||
    entry.checkpointSha256!==checkpointReceipt.sha256)
  throw Error('Elteto vagy bizonytalan szinkron ellenorzopont.');
 const approvedPart=approvedReceipt.sha256.slice(0,24);
 const expectedCheckpoint='sync-prepared-v'+approvedReceipt.version+'-'+approvedPart+'.json';
 if(checkpointReceipt.name!==expectedCheckpoint||
    checkpointReceipt.path!=='Projects/'+boardId+'/Sync-Status/'+expectedCheckpoint)
  throw Error('Az eredeti checkpoint fajl neve elter.');
 if(kind==='ahead'){
  if(entry.format!=='flow-lps-single-task-write-ahead'||entry.status!=='WRITE_AHEAD'||
     entry.maximumMondayWrites!==1||entry.actualMondayWrites!==0||
     !short(entry.sourceFingerprint)||!Array.isArray(entry.fieldNames)||
     typeof entry.checkedAt!=='string'||!/Z$/.test(entry.checkedAt)||
     !Number.isFinite(Date.parse(entry.checkedAt))||
     Math.abs(Date.now()-Date.parse(entry.checkedAt))>15*60*1000||
     entry.fieldNames.length<1||entry.fieldNames.length>25||
     entry.fieldNames.some(f=>typeof f!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(f)))
   throw Error('Hibas iras elotti naplo.');
 }else if(kind==='result'){
  if(entry.format!=='flow-lps-single-task-result'||
     !['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN'].includes(entry.status)||
     entry.mondayWritesAttempted!==1||
     entry.writeAheadSha256!==aheadReceipt?.sha256||
     aheadReceipt?.status!=='WRITE_AHEAD_VERIFIED'||
     aheadReceipt.taskId!==entry.taskId||aheadReceipt.boardId!==boardId||
     aheadReceipt.approvedSha256!==approvedReceipt.sha256||
     aheadReceipt.checkpointSha256!==checkpointReceipt.sha256||
     !hex(aheadReceipt.sha256)||!short(aheadReceipt.id)||!short(aheadReceipt.eTag)||
     aheadReceipt.verification!=='content-sha256-and-etag'||
     typeof entry.readbackMatches!=='boolean')
   throw Error('Hibas visszaellenorzesi naplo vagy hianyzo iras elotti bizonyitek.');
 }else throw Error('Hibas naplo fazis.');
 return approvedPart;
}
export function createSingleTaskJournal({boardId,driveId,getAccessToken,fetcher=fetch,
 assertCurrent=()=>true}={}){
 if(!/^\d{5,20}$/.test(boardId||'')||
    !/^b![-_A-Za-z0-9]+$/.test(driveId||'')||
    typeof getAccessToken!=='function'||typeof fetcher!=='function'||
    typeof assertCurrent!=='function')
  throw Error('Hibas Graph naplo konfiguracio.');
 const base=root+encodeURIComponent(driveId),folder=['Projects',boardId,'Sync-Status'];
 const path=parts=>'/root:/'+parts.map(encodeURIComponent).join('/');
 const requireCurrent=()=>{if(assertCurrent()!==true)throw Error('A munkamenet megvaltozott; naploiras tiltva.');};
 async function graph(p,options={}){
  const token=await getAccessToken();
  if(!token)throw Error('Microsoft Graph token hianyzik.');
  return fetcher(base+p,{method:'GET',cache:'no-store',redirect:'error',...options,
   headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
 }
 async function readVerified(name,expected){
  const target=path([...folder,name]);
  const metadata=async()=>{
   const response=await graph(target+'?$select=id,name,size,file,parentReference,eTag');
   if(!response.ok)throw Error('Graph naploforras metadata HTTP '+response.status);
   const item=await response.json();
   if(item?.name!==name||item.id!==expected.id||item.eTag!==expected.eTag||
      !item.file||!item.size||item.size>5_000_000||
      item.parentReference?.driveId!==driveId)
    throw Error('Nem egyezo SharePoint naploforras metadata.');
   return item;
  };
  const before=await metadata();
  const response=await graph('/items/'+encodeURIComponent(before.id));
  if(!response.ok)throw Error('Graph naploforras download metadata HTTP '+response.status);
  const info=await response.json();
  if(info?.id!==before.id||info.eTag!==before.eTag||
     info.name!==name||info.size!==before.size||!info.file||
     info.parentReference?.driveId!==driveId)
   throw Error('SharePoint letoltesi fajlazonosito elter.');
  const download=await fetcher(url(info['@microsoft.graph.downloadUrl']),{
   method:'GET',cache:'no-store',redirect:'follow',mode:'cors',
   credentials:'omit',referrerPolicy:'no-referrer'});
  if(!download.ok)throw Error('Graph naploforras tartalom HTTP '+download.status);
  const contents=await download.arrayBuffer();
  if(contents.byteLength!==before.size||await sha(contents)!==expected.sha256)
   throw Error('SharePoint naploforras SHA-256 hibas.');
  const after=await metadata();
  if(after.id!==before.id||after.eTag!==before.eTag||after.size!==before.size)
   throw Error('SharePoint naploforras valtozott visszaellenorzes kozben.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(contents));
 }
 async function persist({entry,checkpointReceipt,approvedReceipt,
   aheadReceipt=null,kind}){
  requireCurrent();
  const prefix=verify({entry,checkpointReceipt,approvedReceipt,
   boardId,kind,aheadReceipt});
  const checkpoint=await readVerified(checkpointReceipt.name,checkpointReceipt);
  if(checkpoint.schemaVersion!==1||checkpoint.format!=='flow-lps-sync-checkpoint'||
     (kind==='ahead'&&checkpoint.mondaySourceFingerprint!==entry.sourceFingerprint)||
     checkpoint.status!=='PREPARED_NO_WRITES'||checkpoint.boardId!==boardId||
     checkpoint.approvedPlan?.sha256!==approvedReceipt.sha256||
     checkpoint.writeAuthorization!=='NOT_GRANTED'||
     checkpoint.progress?.cursor!==0||
     checkpoint.progress?.mondayWrites!==0||
     checkpoint.progress?.inFlight!==null||
     !Array.isArray(checkpoint.progress?.verifiedTaskIds)||
     checkpoint.progress.verifiedTaskIds.length!==0)
   throw Error('A tartos checkpoint nem hasznalhato egyfeladatos pilothoz.');
  if(kind==='result'){
   const aheadName='sync-one-'+prefix+'-task-'+entry.taskId+'-ahead.json';
   const ahead=await readVerified(aheadName,aheadReceipt);
   if(ahead?.format!=='flow-lps-single-task-write-ahead'||
      ahead.status!=='WRITE_AHEAD'||ahead.taskId!==entry.taskId||
      ahead.checkpointSha256!==checkpointReceipt.sha256||
      ahead.approvedSha256!==approvedReceipt.sha256)
    throw Error('Az iras elotti naplo nem igazolt.');
  }
  requireCurrent();
  const name='sync-one-'+prefix+'-task-'+entry.taskId+'-'+
   (kind==='ahead'?'ahead':'result')+'.json';
  const fullPath='Projects/'+boardId+'/Sync-Status/'+name;
  const target=path([...folder,name]);
  const exists=await graph(target+'?$select=id,name');
  if(exists.status!==404){
   if(exists.ok)throw Error('A pilot-naplo mar letezik. Soha nincs feluliras vagy automatikus ujrairas.');
   throw Error('A pilot-naplo ellenorzese HTTP '+exists.status);
  }
  const serialized=bytes(entry),hash=await sha(serialized);
  if(serialized.byteLength>5_000_000)throw Error('Tul nagy pilot-naplo.');
  const folderRes=await graph(path(folder)+'?$select=id,name,folder,parentReference');
  if(!folderRes.ok)throw Error('Sync-Status mappa HTTP '+folderRes.status);
  const directory=await folderRes.json();
  if(!directory?.id||directory.name!=='Sync-Status'||!directory.folder||
     directory.parentReference?.driveId!==driveId)
   throw Error('Nem egyezo Sync-Status mappa.');
  requireCurrent();
  const session=await graph('/items/'+encodeURIComponent(directory.id)+':/'+encodeURIComponent(name)+':/createUploadSession',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',name}})
  });
  if(!session.ok)throw Error('Graph pilot-naplo feltoltes HTTP '+session.status);
  const data=await session.json();
  if(!Number.isFinite(Date.parse(data?.expirationDateTime))||
     Date.parse(data.expirationDateTime)<=Date.now())
   throw Error('Graph pilot-naplo upload session lejart.');
  requireCurrent();
  let created;
  try{
   const uploaded=await fetcher(url(data.uploadUrl),{
    method:'PUT',cache:'no-store',mode:'cors',redirect:'error',
    credentials:'omit',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/octet-stream',
     'Content-Range':'bytes 0-'+(serialized.byteLength-1)+'/'+serialized.byteLength},
    body:serialized
   });
   if(uploaded.status!==201)throw Error('Graph nem igazolt uj pilot-naplot: '+uploaded.status);
   created=await uploaded.json();
  }catch(e){
   throw Error('Pilot-naplo allapota bizonytalan; NE probald ujra: '+(e?.message||e));
  }
  if(!created?.id||created.name!==name||created.size!==serialized.byteLength||!created.file)
   throw Error('Pilot-naplo feltoltes bizonytalan; kezi SharePoint ellenorzes kell.');
  // The new file is independently read and its content hash and eTag verified.
  const itemRes=await graph(target+'?$select=id,name,size,file,parentReference,eTag');
  if(!itemRes.ok)throw Error('Pilot-naplo readback HTTP '+itemRes.status);
  const item=await itemRes.json();
  if(item?.id!==created.id||item.name!==name||
     item.size!==serialized.byteLength||!item.file||!item.eTag||
     item.parentReference?.driveId!==driveId)
   throw Error('Pilot-naplo readback metadata elter.');
  const verified=await readVerified(name,{id:item.id,eTag:item.eTag,sha256:hash});
  if(verified?.format!==entry.format||verified.status!==entry.status||
     verified.boardId!==entry.boardId||verified.taskId!==entry.taskId)
   throw Error('Pilot-naplo visszaolvasott tartalma elter.');
  const status=kind==='ahead'?'WRITE_AHEAD_VERIFIED':
   entry.status==='ITEM_READBACK_VERIFIED'?'ITEM_RESULT_VERIFIED':'ITEM_UNCERTAIN_RECORDED';
  return Object.freeze({status,boardId,taskId:entry.taskId,
   approvedSha256:approvedReceipt.sha256,checkpointSha256:checkpointReceipt.sha256,
   sha256:hash,id:item.id,eTag:item.eTag,name,path:fullPath,
   mondayWriteLimit:1,verification:'content-sha256-and-etag'});
 }
 return Object.freeze({
  recordAhead:args=>persist({...args,kind:'ahead'}),
  recordResult:args=>persist({...args,kind:'result'})
 });
}
