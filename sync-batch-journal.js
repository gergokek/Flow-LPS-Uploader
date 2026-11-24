// TEST-only durable batch-item journal. One immutable ahead/result file per
// approved-plan + ordinal; no Monday API calls or retry logic.
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
const editable=['forecast','actual','anchor','duration','ffLag','startPre',
 'finishPre','note','readiness','critical','week','endWeek','status','obstacles','ledger'];
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':
 v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>
  JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v??null);
const nameFor=(sha,step,kind)=>'sync-batch-'+sha.slice(0,24)+
 '-step-'+String(step).padStart(4,'0')+'-'+kind+'.json';
function url(value){
 let parsed;
 try{parsed=new URL(value);}catch{throw Error('Hibas Graph ideiglenes URL.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
    !allowed.some(suffix=>parsed.hostname.toLowerCase().endsWith(suffix)))
  throw Error('Nem megbizhato letoltesi vagy feltoltesi hoszt.');
 return parsed.href;
}
function verify({entry,checkpointReceipt,approvedReceipt,boardId,kind,aheadReceipt}){
 if(boardId!=='5107075373'||
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
    !Number.isSafeInteger(entry.batchNumber)||entry.batchNumber<1||
    !Number.isSafeInteger(entry.step)||entry.step<1||entry.step>9999||
    entry.batchNumber!==Math.floor((entry.step-1)/10)+1||
    !/^\d+$/.test(entry.taskId||'')||
    entry.approvedSha256!==approvedReceipt.sha256||
    entry.checkpointSha256!==checkpointReceipt.sha256)
  throw Error('Elteto vagy bizonytalan szinkron ellenorzopont.');
 // Exact SharePoint-verified ledger position binds every later step to the
 // already completed journal prefix, not a self-reported Monday cursor.
 const progress=checkpointReceipt.batchProgress;
 if(progress?.schemaVersion!==1||
    progress.format!=='flow-lps-batch-ledger-recovery'||
    !['FIRST_BATCH_READY','NEXT_BATCH_READY'].includes(progress.status)||
    progress.canPrepareNextBatch!==true||
    progress.boardId!==boardId||
    progress.approvedPlanSha256!==approvedReceipt.sha256||
    progress.checkpointSha256!==checkpointReceipt.sha256||
    !hex(progress.evidenceSha256)||
    progress.nextBatchNumber!==entry.batchNumber||
    !Number.isSafeInteger(progress.nextStep)||
    entry.step<progress.nextStep||
    entry.step>=progress.nextStep+progress.nextTaskIds?.length||
    progress.nextTaskIds?.[entry.step-progress.nextStep]!==entry.taskId||
    progress.verifiedBatchCount!==progress.nextStep-1||
    progress.verifiedBatchCount%10!==0||
    progress.automaticallyResume!==false)
  throw Error('Nincs hitelesitett, ehhez a batch-sorszamhoz tartozo recovery.');
 const plan=approvedReceipt.approvedPlan;
 const old=plan?.plan?.base?.tasks?.find(t=>t.id===entry.taskId);
 const next=plan?.plan?.working?.find(t=>t.id===entry.taskId);
 if(plan?.format!=='flow-lps-approved-plan'||plan.status!=='APPROVED'||
    plan.boardId!==boardId||!old||!next||
    plan.sourceFingerprint!==checkpointReceipt.checkpoint?.mondaySourceFingerprint)
  throw Error('A batch feladat nem szerepel az Approved Planben.');
 const changed=editable.filter(k=>stable(old[k])!==stable(next[k])).sort();
 if(!changed.length||changed.length>20||
    (kind==='ahead'&&stable(changed)!==stable([...entry.fieldNames].sort())))
  throw Error('A batch valtozott mezoit nem tamasztja ala az Approved Plan.');
 const approvedPart=approvedReceipt.sha256.slice(0,24);
 const expectedCheckpoint='sync-prepared-v'+approvedReceipt.version+'-'+approvedPart+'.json';
 if(checkpointReceipt.name!==expectedCheckpoint||
    checkpointReceipt.path!=='Projects/'+boardId+'/Sync-Status/'+expectedCheckpoint)
  throw Error('Az eredeti checkpoint fajl neve elter.');
 if(kind==='ahead'){
  if(entry.format!=='flow-lps-batch-task-ahead'||entry.status!=='BATCH_WRITE_AHEAD'||
     entry.maximumMondayWrites!==1||entry.actualMondayWrites!==0||
     !short(entry.sourceFingerprint)||!Array.isArray(entry.fieldNames)||
     typeof entry.checkedAt!=='string'||!/Z$/.test(entry.checkedAt)||
     !Number.isFinite(Date.parse(entry.checkedAt))||
     Math.abs(Date.now()-Date.parse(entry.checkedAt))>15*60*1000||
     entry.fieldNames.length<1||entry.fieldNames.length>25||
     entry.fieldNames.some(f=>typeof f!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(f)))
   throw Error('Hibas iras elotti naplo.');
 }else if(kind==='result'){
  if(entry.format!=='flow-lps-batch-task-result'||
     !['BATCH_ITEM_READBACK_VERIFIED','BATCH_ITEM_UNCERTAIN'].includes(entry.status)||
     entry.mondayWritesAttempted!==1||
     entry.writeAheadSha256!==aheadReceipt?.sha256||
     aheadReceipt?.status!=='BATCH_AHEAD_VERIFIED'||
     aheadReceipt.step!==entry.step||
     aheadReceipt.taskId!==entry.taskId||aheadReceipt.boardId!==boardId||
     aheadReceipt.approvedSha256!==approvedReceipt.sha256||
     aheadReceipt.checkpointSha256!==checkpointReceipt.sha256||
     !hex(aheadReceipt.sha256)||!short(aheadReceipt.id)||!short(aheadReceipt.eTag)||
     aheadReceipt.verification!=='content-sha256-and-etag'||
     typeof entry.readbackMatches!=='boolean'||
     (entry.status==='BATCH_ITEM_READBACK_VERIFIED'&&
      (entry.readbackMatches!==true||entry.error!=null))||
     typeof entry.checkedAt!=='string'||!/Z$/.test(entry.checkedAt)||
     !Number.isFinite(Date.parse(entry.checkedAt))||
     Math.abs(Date.now()-Date.parse(entry.checkedAt))>15*60*1000)
   throw Error('Hibas visszaellenorzesi naplo vagy hianyzo iras elotti bizonyitek.');
 }else throw Error('Hibas naplo fazis.');
 return approvedPart;
}
export function createBatchTaskJournal({boardId,driveId,getAccessToken,fetcher=fetch,
 assertCurrent=()=>true}={}){
 if(boardId!=='5107075373'||
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
   const aheadName=nameFor(approvedReceipt.sha256,entry.step,'ahead');
   const ahead=await readVerified(aheadName,aheadReceipt);
   if(ahead?.format!=='flow-lps-batch-task-ahead'||
      ahead.status!=='BATCH_WRITE_AHEAD'||ahead.taskId!==entry.taskId||
      ahead.step!==entry.step||ahead.batchNumber!==entry.batchNumber||
      ahead.checkpointSha256!==checkpointReceipt.sha256||
      ahead.approvedSha256!==approvedReceipt.sha256)
    throw Error('Az iras elotti naplo nem igazolt.');
  }
  // Re-check Entra /me with the delegated Graph account before each
  // irreversible journal file; browsing claims are not identity evidence.
  if(!/^[a-f0-9-]{36}$/i.test(checkpoint.preparedByEntraObjectId||''))
   throw Error('Az eredeti SharePoint checkpoint Microsoft-identitasa hianyzik.');
  const who=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id',{
   method:'GET',cache:'no-store',redirect:'error',
   headers:{Authorization:'Bearer '+await getAccessToken(),Accept:'application/json'}
  });
  if(!who.ok)throw Error('Graph Entra-identitas ellenorzese HTTP '+who.status);
  const user=await who.json();
  if(String(user?.id||'').toLowerCase()!==
     checkpoint.preparedByEntraObjectId.toLowerCase())
   throw Error('A Microsoft-felhasznalo elter a SharePoint checkpoint keszitojetol.');
  requireCurrent();
  const name=nameFor(approvedReceipt.sha256,entry.step,kind);
  const fullPath='Projects/'+boardId+'/Sync-Status/'+name;
  const target=path([...folder,name]);
  const exists=await graph(target+'?$select=id,name');
  if(exists.status!==404){
   if(exists.ok)throw Error('A batch-naplo mar letezik. Soha nincs feluliras vagy automatikus ujrairas.');
   throw Error('A batch-naplo ellenorzese HTTP '+exists.status);
  }
  const serialized=bytes(entry),hash=await sha(serialized);
  if(serialized.byteLength>5_000_000)throw Error('Tul nagy batch-naplo.');
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
  if(!session.ok)throw Error('Graph batch-naplo feltoltes HTTP '+session.status);
  const data=await session.json();
  if(!Number.isFinite(Date.parse(data?.expirationDateTime))||
     Date.parse(data.expirationDateTime)<=Date.now())
   throw Error('Graph batch-naplo upload session lejart.');
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
   if(uploaded.status!==201)throw Error('Graph nem igazolt uj batch-naplot: '+uploaded.status);
   created=await uploaded.json();
  }catch(e){
   throw Error('Batch-naplo allapota bizonytalan; NE probald ujra: '+(e?.message||e));
  }
  if(!created?.id||created.name!==name||created.size!==serialized.byteLength||!created.file)
   throw Error('Batch-naplo feltoltes bizonytalan; kezi SharePoint ellenorzes kell.');
  // The new file is independently read and its content hash and eTag verified.
  const itemRes=await graph(target+'?$select=id,name,size,file,parentReference,eTag');
  if(!itemRes.ok)throw Error('Batch-naplo readback HTTP '+itemRes.status);
  const item=await itemRes.json();
  if(item?.id!==created.id||item.name!==name||
     item.size!==serialized.byteLength||!item.file||!item.eTag||
     item.parentReference?.driveId!==driveId)
   throw Error('Batch-naplo readback metadata elter.');
  const verified=await readVerified(name,{id:item.id,eTag:item.eTag,sha256:hash});
  if(verified?.format!==entry.format||verified.status!==entry.status||
     verified.boardId!==entry.boardId||verified.taskId!==entry.taskId)
   throw Error('Batch-naplo visszaolvasott tartalma elter.');
  const status=kind==='ahead'?'BATCH_AHEAD_VERIFIED':
   entry.status==='BATCH_ITEM_READBACK_VERIFIED'?'BATCH_RESULT_VERIFIED':'BATCH_RESULT_UNCERTAIN';
  return Object.freeze({status,boardId,taskId:entry.taskId,step:entry.step,
   approvedSha256:approvedReceipt.sha256,checkpointSha256:checkpointReceipt.sha256,
   sha256:hash,id:item.id,eTag:item.eTag,name,path:fullPath,
   mondayWriteLimit:1,verification:'content-sha256-and-etag'});
 }
 return Object.freeze({
  recordAhead:args=>persist({...args,kind:'ahead'}),
  recordResult:args=>persist({...args,kind:'result'})
 });
}
