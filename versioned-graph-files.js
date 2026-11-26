// Microsoft Graph adapter for isolated TEST V3 versioned artifacts.
// No Monday writer, no user-controlled paths and no overwrite of existing JSON.
import {versionLayout,versionFilePath} from './version-workspace-layout.js';
import {createProjectStorage} from './project-storage.js';
import {createVerifiedReadCache} from './verified-read-cache.js';
import {sha256,MAX_DRAFT_BYTES} from './single-draft-session-core.js';
const blockedHosts=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
const ok=(x,m)=>{if(!x)throw Error(m);};
const board='5107075373';
export function createVersionedGraphFiles({boardId=board,version=3,driveId,
 getAccessToken,fetcher=fetch,assertCurrent=()=>true}={}){
 const layout=versionLayout(boardId,version);
 ok(boardId===board&&version===3&&!layout.legacy&&
  /^b![-_A-Za-z0-9]+$/.test(driveId||'')&&
  [getAccessToken,fetcher,assertCurrent].every(x=>typeof x==='function'),
  'V3 Graph tarolo nincs megfeleloen beallitva.');
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const pathOf=s=>'/root:/'+s.split('/').map(encodeURIComponent).join('/');
 const guard=()=>ok(assertCurrent()===true,'A V3 Microsoft kapcsolat megvaltozott.');
 const checkedPath=path=>{
  ok(typeof path==='string'&&
   [layout.session,layout.drafts,layout.approved,layout.sync].some(prefix=>path.startsWith(prefix+'/'))&&
   !path.includes('..')&&/^[A-Za-z0-9/_\-.]+$/.test(path),
   'Tiltott V3 SharePoint fajlutvonal.');
  const name=path.split('/').at(-1),folder=path.slice(0,-name.length-1);
  ok(versionFilePath({boardId,version,kind:({[layout.session]:'session',[layout.drafts]:'drafts',
    [layout.approved]:'approved',[layout.sync]:'sync'})[folder],
   name})===path,'Eltero V3 fajlutvonal.');
  return {name,folder};
 };
 const checkedFolder=path=>{
  ok([layout.session,layout.drafts,layout.approved,layout.sync].includes(path),
   'A V3 verzio idegen SharePoint mappaja nem olvashato.');
  return path;
 };
 async function graph(path,options={}){
  guard();const token=await getAccessToken();guard();
  ok(typeof token==='string'&&!!token,'Microsoft Graph token szukseges.');
  return fetcher(root+path,{method:'GET',cache:'no-store',redirect:'error',
   ...options,headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
 }
 async function metadata(path){
  const response=await graph(pathOf(path)+'?$select=id,name,size,file,eTag,parentReference');
  if(response.status===404)return null;
  ok(response.ok,'V3 metadata HTTP '+response.status);
  const m=await response.json();
  ok(m.id&&m.eTag&&m.file&&m.parentReference?.driveId===driveId&&
   Number.isSafeInteger(m.size)&&m.size>0&&m.size<=MAX_DRAFT_BYTES,
   'Ervenytelen V3 fajlmetaadat.');
  return m;
 }
 const verifiedReads=createVerifiedReadCache();
 async function read(path){
  checkedPath(path);
  const first=await metadata(path);guard();
  if(!first){verifiedReads.discard(path);return null;}
  const cached=verifiedReads.get(path,first);
  if(cached){guard();const {size,...value}=cached;return value;}
  ok(first.name===path.split('/').at(-1),'Eltero V3 fajlnev.');
  const response=await graph('/items/'+encodeURIComponent(first.id));
  ok(response.ok,'V3 visszaolvasas HTTP '+response.status);
  const m=await response.json();
  ok(m.id===first.id&&m.eTag===first.eTag&&m.size===first.size&&m.file&&
   m.parentReference?.driveId===driveId,'Valtozott V3 fajlmetaadat.');
  let u;try{u=new URL(m['@microsoft.graph.downloadUrl']);}catch{
   throw Error('Hibas V3 letoltesi URL.');
  }
  ok(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   blockedHosts.some(h=>u.hostname.toLowerCase().endsWith(h)),
   'Nem biztonsagos V3 letoltesi host.');
  const download=await fetcher(u.href,{method:'GET',cache:'no-store',
   redirect:'follow',credentials:'omit',referrerPolicy:'no-referrer'});
  ok(download.ok,'V3 fajl letoltese sikertelen.');
  const bytes=new Uint8Array(await download.arrayBuffer());
  ok(bytes.byteLength===first.size,'Valtozott V3 tartalommeret.');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('Ervenytelen V3 JSON/UTF8.');}
  const second=await metadata(path);
  ok(second?.id===first.id&&second.eTag===first.eTag&&
   second.size===first.size,'V3 fajl olvasas kozben megvaltozott.');
  guard();const record={value,name:first.name,id:first.id,eTag:first.eTag,
   size:first.size,sha256:await sha256(bytes)};
  guard();verifiedReads.put(path,record);
  const {size,...result}=record;return result;
 }
 async function list(folder){
  checkedFolder(folder);const result=new Map(),seen=new Set(),ids=new Set();
  let m;try{const r=await graph(pathOf(folder)+'?$select=id,name,folder,parentReference');
   if(r.status===404)return [];
   ok(r.ok,'V3 mappa metadata HTTP '+r.status);m=await r.json();
  }catch(e){throw e;}
  ok(m.folder&&m.id&&m.parentReference?.driveId===driveId,
   'Hibas V3 mappa.');
  let cursor=root+'/items/'+encodeURIComponent(m.id)+'/children?$select=id,name,size,file,eTag&$top=200';
  for(let n=0;cursor&&n<50;n++){
   ok(cursor.startsWith(root+'/')&&!seen.has(cursor),'Tiltott V3 lapozas.');
   seen.add(cursor);const r=await graph(cursor.slice(root.length));
   ok(r.ok,'V3 fajllista HTTP '+r.status);const body=await r.json();
   ok(Array.isArray(body.value),'Hibas V3 fajllista.');
   for(const x of body.value){
    ok(x.name&&x.file&&x.id&&x.eTag&&
     Number.isSafeInteger(x.size)&&x.size>0&&x.size<=MAX_DRAFT_BYTES&&
     !result.has(x.name)&&!ids.has(x.id),'Duplikalt vagy hibas V3 fajl.');
    result.set(x.name,{id:x.id,name:x.name,eTag:x.eTag});ids.add(x.id);
   }
   cursor=body['@odata.nextLink']||null;
  }
  ok(!cursor,'A V3 fajllista lapozasa nem teljes.');
  guard();return [...result.values()];
 }
 async function create(path,document){
  const target=checkedPath(path);guard();
  ok(document&&typeof document==='object'&&!Array.isArray(document)&&
   document.schemaVersion===1&&document.boardId===boardId,
   'V3 fajl nem ervenyes dokumentum.');
  // Every create-only destination is restricted to its lifecycle folder.
  // Sync creates are restricted by exact name/type/status. Full validation is
  // independently required by the journal storage before mutation.
  const valid=(target.folder===layout.session&&target.name==='version-info.json'&&
    document.format==='mflow-plan-version-index'&&document.planVersion===3)||
   (target.folder===layout.session&&target.name==='active-session-v3.json'&&
    document.format==='mflow-versioned-session'&&document.planVersion===3)||
   (target.folder===layout.drafts&&/^draft-v3(?:-r[0-9]{6})?\.json$/.test(target.name)&&
    document.format==='flow-lps-draft'&&document.session?.planVersion===3)||
   (target.folder===layout.session&&target.name==='session-v3-freeze.json'&&
    document.format==='mflow-versioned-approval-freeze'&&
    document.planVersion===3&&document.status==='APPROVAL_FROZEN'&&
    document.userConfirmed===true&&document.mondayWrites===0)||
   (target.folder===layout.session&&target.name==='session-v3-approved.json'&&
    document.format==='mflow-versioned-approval-receipt'&&
    document.planVersion===3&&document.status==='APPROVED_PLAN_STORED'&&
    document.mondayWrites===0)||
   (target.folder===layout.approved&&target.name==='approved-v3.json'&&
    document.format==='flow-lps-approved-plan'&&document.planVersion===3&&
    document.status==='APPROVED'&&document.isApprovedPlan===true&&
    document.mondaySyncAllowed===false)||
   (target.folder===layout.sync&&
    /^sync-v3-step-[0-9]{6}-ahead\.json$/.test(target.name)&&
    document.format==='mflow-versioned-sync-ahead'&&
    document.planVersion===3&&document.status==='WRITE_AHEAD'&&
    document.maximumMutationAttempts===1&&document.automaticallyRetryable===false&&
    Number.isSafeInteger(document.step)&&document.step>=1&&
    target.name==='sync-v3-step-'+String(document.step).padStart(6,'0')+'-ahead.json')||
   (target.folder===layout.sync&&
    /^sync-v3-step-[0-9]{6}-result\.json$/.test(target.name)&&
    document.format==='mflow-versioned-sync-result'&&document.planVersion===3&&
    ['ITEM_READBACK_VERIFIED','ITEM_UNCERTAIN','ABORTED_NO_WRITE'].includes(document.status)&&
    [0,1].includes(document.mutationAttempts)&&
    document.automaticallyRetryable===false&&
    Number.isSafeInteger(document.step)&&document.step>=1&&
    target.name==='sync-v3-step-'+String(document.step).padStart(6,'0')+'-result.json')||
   (target.folder===layout.sync&&target.name==='sync-v3-completed.json'&&
    document.format==='mflow-versioned-sync-final'&&document.planVersion===3&&
    document.status==='V3_SYNC_COMPLETED'&&document.fullBoardReadbackMatches===true&&
    document.approvedExactMatch===true&&document.remainingTaskCount===0&&
    document.automaticallyRetryable===false);
  ok(valid,'Nem illeszkedik a V3 fajlnev, celmappa es dokumentumtipus.');
  const bytes=new TextEncoder().encode(JSON.stringify(document,null,2)+'\n');
  ok(bytes.byteLength>0&&bytes.byteLength<=MAX_DRAFT_BYTES,
   'A V3 JSON meghaladja a biztonsagi meretkorlatot.');
  const hash=await sha256(bytes);
  ok(await metadata(path)===null,'A V3 fajl mar letezik; feluliras TILTVA.');
  const {folder}=checkedPath(path);
  const parent=await graph(pathOf(folder)+'?$select=id,folder');
  ok(parent.ok&&(await parent.json()).folder,'A V3 celmappa nem letezik.');
  let response;
  try{response=await graph(pathOf(path)+':/content?%40microsoft.graph.conflictBehavior=fail',{
   method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});
  }catch(error){throw Error('V3 Graph iras bizonytalan: nincs automatikus ujraprobalas. '+error.message);}
  ok(response.status===201,'V3 SharePoint iras nem 201 Created: '+response.status+
   '. Nincs automatikus ujraprobalas.');
  const m=await response.json();
  ok(m.file&&m.id&&m.name===path.split('/').at(-1)&&m.size===bytes.byteLength,
   'V3 Graph letrehozas valasza nem hiteles.');
  const stored=await read(path);
  ok(stored&&stored.id===m.id&&stored.sha256===hash&&stored.eTag,
   'V3 feltoltes SHA-256/eTag ellenorzese nem sikeres.');
  guard();return {name:stored.name,path,id:stored.id,eTag:stored.eTag,
   sha256:stored.sha256,verification:'content-sha256-and-etag'};
 }
 const provision=createProjectStorage({driveId,getAccessToken,fetcher});
 const ensureFolders=async(id,v)=>{
  ok(id===boardId&&v===version,'V3 mappacel megvaltozott.');
  guard();return provision.ensureVersion(id,v);
 };
 return Object.freeze({read,list,create,ensureFolders});
}
