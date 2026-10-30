// SharePoint TEST_ONLY verification without browser cross-origin file downloads.
const root='https://graph.microsoft.com/v1.0/drives/';
async function getJson(url,token,step) {
 let response;
 try {response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store'});}
 catch(e){throw new Error(step+': hálózati/CORS hiba ('+(e?.message||'Failed to fetch')+').');}
 if(!response.ok) {
  const errorBody=await response.json().catch(()=>null);
  throw new Error(step+': Graph HTTP '+response.status+' ('+(errorBody?.error?.code||'unknown')+').');
 }
 return response.json();
}
export async function verifyExistingTest({driveId,boardId,filename,token}) {
 if(!/^\d+$/.test(boardId)||!/^TEST_ONLY-\d{8,}-[a-zA-Z0-9-]+\.json$/.test(filename)||!filename.startsWith('TEST_ONLY-'+boardId+'-'))
  throw new Error('A fájlnév nem a kiválasztott board TEST_ONLY fájlja.');
 const base=root+encodeURIComponent(driveId);
 const path='/root:/Projects/'+boardId+'/Upload-Tests/'+encodeURIComponent(filename);
 const obj=await getJson(base+path+'?$select=id,name,size,parentReference,file,eTag,webUrl',token,'Meglévő tesztfájl ellenőrzése');
 if(!obj.file||obj.name!==filename||obj.size<1||!obj.id)throw new Error('A Graph nem igazolta vissza a tesztfájlt.');
 return {filename:obj.name,id:obj.id,size:obj.size,sha1:obj.file.hashes?.sha1Hash||null,sha256:obj.file.hashes?.sha256Hash||null};
}
