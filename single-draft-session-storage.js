import {ACTIVE_NAME,BASELINE_NAME,V0_NAME,MAX_DRAFT_BYTES,
 sha256,hex,inspectV0,newSessionClaim,makeBaseline,inspectRevision,
 makeNextDraft,revisionName} from './single-draft-session-core.js';

const safeDomains=['.sharepoint.com','.sharepointonline.com','.sharepoint-df.com',
 '.1drv.com','.blob.core.windows.net'];
function safeUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('Érvénytelen SharePoint feltöltési vagy letöltési URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    !safeDomains.some(s=>u.hostname.toLowerCase().endsWith(s)))
  throw Error('Tiltott SharePoint ideiglenes URL.');
 return u.href;
}
const requireValid=(c,m)=>{if(!c)throw Error(m);};
const bytes=value=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
export function createSingleDraftSessionStore({boardId,driveId,
 getAccessToken,fetcher=fetch,assertCurrent=()=>true,
 now=()=>new Date(),randomUUID=()=>crypto.randomUUID()}={}){
 requireValid(boardId==='5107075373'&&/^b![-_A-Za-z0-9]+$/.test(driveId||'')&&
  typeof getAccessToken==='function'&&typeof fetcher==='function'&&
  typeof assertCurrent==='function'&&typeof now==='function'&&
  typeof randomUUID==='function',
  'Érvénytelen, nem izolált TEST SharePoint-munkamenet.');
 const root='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId);
 const folder=name=>['Projects',boardId,name];
 const urlOf=parts=>'/root:/'+parts.map(encodeURIComponent).join('/');
 const draftPath=name=>urlOf([...folder('Draft-Plans'),name]);
 const approvedPath=name=>urlOf([...folder('Approved-Plans'),name]);
 const check=()=>requireValid(assertCurrent()===true,
  'A Microsoft-felhasználó vagy az aktív projekt megváltozott.');
 const request=async(path,options={})=>{
  check();
  const token=await getAccessToken();
  requireValid(typeof token==='string'&&token.length>0,'Microsoft Graph token szükséges.');
  return fetcher(root+path,{method:'GET',cache:'no-store',redirect:'error',...options,
   headers:{Authorization:'Bearer '+token,Accept:'application/json',...options.headers}});
 };
 async function metadata(path){
  const res=await request(path+'?$select=id,name,size,file,parentReference,eTag');
  if(res.status===404)return null;
  requireValid(res.ok,'SharePoint fájlmetadata HTTP '+res.status);
  const item=await res.json();
  requireValid(!!item?.id&&!!item?.eTag&&!!item.file&&
   Number.isSafeInteger(item.size)&&item.size>0&&
   item.size<=MAX_DRAFT_BYTES&&item.parentReference?.driveId===driveId,
   'Hiányos, hibás vagy túlméretes SharePoint fájl.');
  return item;
 }
 async function readFile(path){
  const first=await metadata(path);
  if(!first)return null;
  const d=await request('/items/'+encodeURIComponent(first.id));
  requireValid(d.ok,'SharePoint fájl visszaolvasási metadata HTTP '+d.status);
  const info=await d.json();
  requireValid(info?.id===first.id&&info.name===first.name&&
   info.size===first.size&&info.eTag===first.eTag&&
   info.file&&info.parentReference?.driveId===driveId,
   'A SharePoint fájl azonosítója vagy eTag-je megváltozott.');
  const body=await fetcher(safeUrl(info['@microsoft.graph.downloadUrl']),{
   method:'GET',mode:'cors',cache:'no-store',redirect:'follow',
   credentials:'omit',referrerPolicy:'no-referrer'});
  requireValid(body.ok,'SharePoint tartalom letöltése sikertelen.');
  const data=await body.arrayBuffer();
  requireValid(data.byteLength===first.size,'SharePoint fájlméret eltér.');
  let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
  catch{throw Error('Hibás SharePoint JSON vagy UTF-8.');}
  const second=await metadata(path);
  requireValid(second?.id===first.id&&second.eTag===first.eTag&&
   second.size===first.size,'SharePoint fájl változott visszaolvasás közben.');
  check();
  return Object.freeze({value,sha256:await sha256(data),id:first.id,
   eTag:first.eTag,name:first.name,size:first.size});
 }
 async function folderMeta(name){
  const res=await request(urlOf(folder(name))+'?$select=id,name,folder,parentReference');
  requireValid(res.ok,'Hiányzik a SharePoint '+name+' mappa.');
  const item=await res.json();
  requireValid(item?.name===name&&!!item.id&&!!item.folder&&
   item.parentReference?.driveId===driveId,
   'Hibás SharePoint '+name+' mappa.');
  return item;
 }
 async function createFile(folderName,name,value){
  const data=bytes(value),hash=await sha256(data);
  requireValid(data.byteLength>0&&data.byteLength<=MAX_DRAFT_BYTES,
   'A DRAFT túllépi az 5 MB-os biztonsági korlátot.');
  const path=urlOf([...folder(folderName),name]);
  const exists=await request(path+'?$select=id,name');
  requireValid(exists.status===404,
   exists.ok?'A verzió már létezik; felülírás tiltva.':
   'A fájl létezése nem ellenőrizhető: '+exists.status);
  const parent=await folderMeta(folderName);
  const session=await request('/items/'+encodeURIComponent(parent.id)+':/'+
   encodeURIComponent(name)+':/createUploadSession',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({item:{name,'@microsoft.graph.conflictBehavior':'fail'}})
  });
  requireValid(session.ok,'Konfliktusvédett SharePoint feltöltés nem indítható.');
  const info=await session.json();
  const link=safeUrl(info?.uploadUrl);
  requireValid(Number.isFinite(Date.parse(info?.expirationDateTime))&&
   Date.parse(info.expirationDateTime)>Date.now(),
   'Lejárt vagy ismeretlen SharePoint feltöltési munkamenet.');
  check();
  let item;
  try{
   const response=await fetcher(link,{method:'PUT',mode:'cors',redirect:'error',
    cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/octet-stream',
     'Content-Range':'bytes 0-'+(data.byteLength-1)+'/'+data.byteLength},
    body:data});
   requireValid(response.status===201,
    'Nem új SharePoint fájl jött létre: HTTP '+response.status);
   item=await response.json();
  }catch(error){throw Error('A SharePoint-írás bizonytalan. NE próbáld újra automatikusan; '+
    'ellenőrizd a fájlt: '+(error?.message||error));}
  requireValid(item?.name===name&&!!item.id&&item.size===data.byteLength&&
   !!item.file,'A SharePoint feltöltés válasza nem hitelesíthető.');
  const result=await readFile(path);
  requireValid(result?.id===item.id&&result.size===data.byteLength&&
   result.sha256===hash&&!!result.eTag,
   'A SharePoint teljes SHA-256/eTag visszaellenőrzése sikertelen.');
  check();
  return Object.freeze({...result,path:'Projects/'+boardId+'/'+folderName+'/'+name,
   verification:'content-sha256-and-etag',value:undefined});
 }
 async function readV0(){
  const file=await readFile(approvedPath(V0_NAME));
  requireValid(file!==null,'Hiányzik a manuálisan feltöltött '+V0_NAME+' Approved Plan.');
  inspectV0(file.value,boardId);
  return file;
 }
 async function claim(){
  const file=await readFile(draftPath(ACTIVE_NAME));
  if(!file)return null;
  const value=file.value;
  requireValid(value?.schemaVersion===1&&
   value.format==='mflow-single-draft-session'&&
   value.status==='ACTIVE'&&value.boardId===boardId&&
   value.planVersion===1&&value.baselineFile===BASELINE_NAME&&
   hex(value.approvedV0Sha256)&&
   typeof value.sessionId==='string',
   'Sérült aktív SharePoint munkamenet-azonosító.');
  return Object.freeze({value,sha256:file.sha256,id:file.id,eTag:file.eTag});
 }
 async function listRevisions(){
  const parent=await folderMeta('Draft-Plans');
  const result=new Map(),seenUrls=new Set(),seenIds=new Set();
  let next=root+'/items/'+encodeURIComponent(parent.id)+
   '/children?$select=id,name,file,size,eTag&$top=200';
  for(let page=0;next&&page<50;page++){
   requireValid(next.startsWith(root+'/')&&!seenUrls.has(next),
    'Nem biztonságos vagy ismétlődő SharePoint lapozás.');
   seenUrls.add(next);
   const response=await request(next.slice(root.length));
   requireValid(response.ok,'SharePoint DRAFT lista HTTP '+response.status);
   const data=await response.json();
   requireValid(Array.isArray(data?.value),'Hibás SharePoint verziólista.');
   for(const item of data.value){
    const match=/^draft-v1-r(\d{6})\.json$/.exec(item?.name||'');
    if(!match)continue;
    const rev=Number(match[1]);
    requireValid(rev>0&&rev<=999999&&item.file&&item.id&&item.eTag&&
     item.size>0&&item.size<=MAX_DRAFT_BYTES&&
     !result.has(rev)&&!seenIds.has(item.id),
     'Ütköző, hibás vagy duplikált DRAFT-revízió.');
    result.set(rev,item.name);seenIds.add(item.id);
   }
   next=data['@odata.nextLink']||null;
   requireValid(!next||next.startsWith(root+'/'),
    'Eltérő SharePoint lapozási host.');
  }
  requireValid(!next,'A SharePoint DRAFT lista lapozása nem teljes.');
  const sorted=[...result].sort((a,b)=>a[0]-b[0]);
  sorted.forEach(([rev],index)=>requireValid(rev===index+1,
   'Hiányzó DRAFT-verzió; nem folytatható a munkamenet.'));
  return sorted;
 }
 async function start({createdBy}={}){
  check();
  const v0=await readV0();
  const current=await claim();
  requireValid(!current,'A projekthez már tartozik aktív munkamenet; folytasd azt.');
  requireValid(await readFile(draftPath(BASELINE_NAME))===null,
   'A V1 kiinduló DRAFT létezik, de nincs érvényes foglalás; kézi ellenőrzés szükséges.');
  const claimValue=newSessionClaim({boardId,
   sessionId:randomUUID(),approvedV0Sha256:v0.sha256,
   createdBy,createdAt:now().toISOString()});
  // This immutable file is the atomic project-wide session claim.
  // If the baseline save fails, recovery must reconcile the claim first.
  const savedClaim=await createFile('Draft-Plans',ACTIVE_NAME,claimValue);
  const baseline=makeBaseline({v0:v0.value,claim:claimValue});
  inspectRevision(baseline,claimValue,0,null);
  const saved=await createFile('Draft-Plans',BASELINE_NAME,baseline);
  return Object.freeze({status:'ACTIVE',boardId,
   sessionId:claimValue.sessionId,planVersion:1,revision:0,
   versionLabel:'V1',sourceApprovedSha256:v0.sha256,
   claimReceipt:savedClaim,receipt:saved,draft:baseline});
 }
 async function resume(){
  check();
  const current=await claim();
  requireValid(!!current,'Nincs aktív DRAFT-munkamenet.');
  const v0=await readV0();
  requireValid(current.value.approvedV0Sha256===v0.sha256,
   'A V0 Approved Plan eltér az aktív munkamenet kiindulásától.');
  const versions=await listRevisions();
  let file=await readFile(draftPath(BASELINE_NAME));
  requireValid(!!file,'Az aktív munkamenet V1 kiinduló fájlja hiányzik.');
  const original=makeBaseline({v0:v0.value,claim:current.value});
  requireValid(file.value.source===original.source&&
   JSON.stringify(file.value.working)===JSON.stringify(original.working),
   'A V1 kiinduló DRAFT eltér az eredeti V0-tól.');
  inspectRevision(file.value,current.value,0,null);
  let last=file,lastRevision=0;
  for(const [rev,name] of versions){
   const next=await readFile(draftPath(name));
   requireValid(!!next,'A DRAFT-listában szereplő revízió eltűnt.');
   inspectRevision(next.value,current.value,rev,last.sha256);
   requireValid(next.value.source===original.source&&
    JSON.stringify(next.value.base)===JSON.stringify(original.base),
    'A DRAFT módosította a V0 kiinduló adatokat.');
   last=next;lastRevision=rev;
  }
  check();
  return Object.freeze({status:'ACTIVE',boardId,
   sessionId:current.value.sessionId,planVersion:1,
   revision:lastRevision,versionLabel:'V1'+(lastRevision?'.'+lastRevision:''),
   sourceApprovedSha256:v0.sha256,claimReceipt:current,
   receipt:{name:last.name,id:last.id,eTag:last.eTag,
    sha256:last.sha256,verification:'content-sha256-and-etag'},
   draft:last.value});
 }
 async function append({updatedDraft,expectedSessionId,expectedParentSha256}={}){
  check();
  const verified=await resume();
  requireValid(verified.sessionId===expectedSessionId&&
   verified.receipt.sha256===expectedParentSha256,
   'Időközben másik módosítás történt; friss DRAFT-ellenőrzés szükséges.');
  const draft=makeNextDraft({previous:verified.draft,
   claim:(await claim()).value,
   previousSha256:expectedParentSha256,updated:updatedDraft});
  const saved=await createFile('Draft-Plans',revisionName(draft.version),draft);
  check();
  return Object.freeze({status:'SAVED',boardId,
   sessionId:verified.sessionId,planVersion:1,revision:draft.version,
   versionLabel:'V1.'+draft.version,receipt:saved,draft});
 }
 return Object.freeze({start,resume,append,readV0});
}
