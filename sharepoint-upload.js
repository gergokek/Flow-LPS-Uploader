// Isolated TEST_ONLY upload. No Approved-Plans or Monday mutations.
const graphRoot = 'https://graph.microsoft.com/v1.0/drives/';
async function graph(url, token, step, options = {}) {
 let response;
 try {
  response = await fetch(url, {
   ...options, cache:'no-store',
   headers:{ Authorization:'Bearer '+token, ...(options.headers || {}) }
  });
 } catch (err) {
  throw new Error(step+': hálózati vagy CORS-hiba ('+(err?.message || 'Failed to fetch')+').');
 }
 if (!response.ok) {
  const problem=await response.json().catch(()=>null);
  const e=new Error(step+': Graph HTTP '+response.status+' ('+(problem?.error?.code||'unknown')+'). '+(problem?.error?.message||''));
  e.httpStatus=response.status;
  throw e;
 }
 return response;
}
async function checksum(bytes) {
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function uploadTestPreview({driveId,boardId,data,token,onProgress=()=>{}}) {
 if(!/^\d+$/.test(boardId)||data?.status!=='TEST_ONLY'||data?.isApprovedPlan!==false||data?.boardId!==boardId)
  throw new Error('Csak a kiválasztott boardhoz tartozó TEST_ONLY fájl engedélyezett.');
 const base=graphRoot+encodeURIComponent(driveId);
 const parent='/root:/Projects/'+boardId;
 onProgress('1/5: Projektmappa ellenőrzése...');
 const project=await (await graph(base+parent,token,'Projektmappa ellenőrzése')).json();
 if(!project.folder) throw new Error('A projektazonosító nem mappához tartozik.');
 onProgress('2/5: Elkülönített Upload-Tests mappa ellenőrzése...');
 let folder;
 try{
  folder=await (await graph(base+parent+'/Upload-Tests',token,'Tesztmappa lekérdezése')).json();
 }catch(err){
  if(err.httpStatus!==404)throw err;
  try{
   folder=await (await graph(base+'/items/'+encodeURIComponent(project.id)+'/children',token,'Tesztmappa létrehozása',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:'Upload-Tests',folder:{},'@microsoft.graph.conflictBehavior':'fail'})
   })).json();
  }catch(createErr){
   if(createErr.httpStatus!==409)throw createErr;
   folder=await (await graph(base+parent+'/Upload-Tests',token,'Tesztmappa ismételt lekérdezése')).json();
  }
 }
 if(!folder?.folder)throw new Error('Az Upload-Tests útvonal nem mappa.');
 const bytes=new TextEncoder().encode(JSON.stringify(data,null,2)+'\n');
 if(bytes.byteLength>5_000_000)throw new Error('A JSON mérete meghaladja az 5 MB-ot.');
 const originalHash=await checksum(bytes);
 const name='TEST_ONLY-'+boardId+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json';
 onProgress('3/5: Tesztfájl feltöltése (új fájl, felülírás nélkül)...');
 const created=await (await graph(base+'/items/'+encodeURIComponent(folder.id)+':/'+encodeURIComponent(name)+':/content?%40microsoft.graph.conflictBehavior=fail',token,'Tesztfájl feltöltése',{
  method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes
 })).json();
 if(!created?.id||created.name!==name)throw new Error('A feltöltés válasza nem egyezik a célfájllal.');
 onProgress('4/5: SharePoint fájlmetaadatainak ellenőrzése...');
 const metadata=await (await graph(base+'/items/'+encodeURIComponent(created.id),token,'Fájlmetaadatok visszaolvasása')).json();
 if(metadata.id!==created.id||metadata.name!==name||metadata.size!==bytes.byteLength)
  throw new Error('A visszaolvasott fájl metaadata vagy mérete eltér.');
 onProgress('5/5: Teljes tartalom visszaolvasása és SHA-256 ellenőrzése...');
 // Graph /content redirects across origins. Browser fetch can reject that redirect.
 // Prefer the short-lived, unauthenticated URL returned in the Graph metadata.
 const downloadUrl=metadata['@microsoft.graph.downloadUrl'];
 if(!downloadUrl)throw new Error('A SharePoint nem adott letöltési URL-t; a tartalom-ellenőrzés nem teljes.');
 let read;
 try{
  read=await fetch(downloadUrl,{method:'GET',cache:'no-store',redirect:'follow'});
 }catch(err){
  throw new Error('Feltöltés és metaadat-ellenőrzés kész, de a böngésző blokkolta a tartalom visszaolvasását (CORS/Failed to fetch). Fájl: '+name);
 }
 if(!read.ok)throw new Error('A feltöltött fájl letöltése HTTP '+read.status+' hibával zárult.');
 const downloaded=new Uint8Array(await read.arrayBuffer());
 const receivedHash=await checksum(downloaded);
 if(receivedHash!==originalHash||downloaded.byteLength!==bytes.byteLength)
  throw new Error('A visszaolvasott bájtok ellenőrzőösszege eltér. Fájl: '+name);
 return {filename:name,fileId:created.id,bytes:bytes.byteLength,sha256:originalHash};
}
