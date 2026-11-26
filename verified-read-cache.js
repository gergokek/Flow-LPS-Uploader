// Per authenticated store instance only. Reuse an already content-hashed
// immutable JSON only if a NEW Graph metadata read proves the exact same file.
// No persistence, no authorization, no caching of negative results or failures.
export function createVerifiedReadCache({maxBytes=32*1024*1024,maxEntries=128}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||
    !Number.isSafeInteger(maxEntries)||maxEntries<=0)
  throw Error('Invalid verified read cache limits.');
 const map=new Map();let used=0;
 const discard=path=>{
  const old=map.get(path);
  if(old){used-=old.size;map.delete(path);}
 };
 const matches=(a,b)=>a?.id===b?.id&&a?.name===b?.name&&
  a?.eTag===b?.eTag&&a?.size===b?.size;
 function get(path,metadata){
  const old=map.get(path);
  if(!old||!metadata||!matches(old,metadata)){
   discard(path);return null;
  }
  // No caller may mutate the privately retained verified bytes/object.
  map.delete(path);map.set(path,old);
  return structuredClone(old);
 }
 function put(path,record){
  discard(path);
  if(typeof path!=='string'||typeof record?.id!=='string'||!record.id||
     typeof record.eTag!=='string'||!record.eTag||
     typeof record.name!=='string'||!record.name||
     !Number.isSafeInteger(record.size)||record.size<1||record.size>maxBytes||
     !/^[a-f0-9]{64}$/.test(record.sha256||'')||
     !record.value||typeof record.value!=='object')
   return;
  while(map.size&&(map.size>=maxEntries||used+record.size>maxBytes))
   discard(map.keys().next().value);
  map.set(path,structuredClone(record));used+=record.size;
 }
 return Object.freeze({get,put,discard,clear:()=>{map.clear();used=0;}});
}
