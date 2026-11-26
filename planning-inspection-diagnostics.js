// Read-only V1/V2/V3 project-discovery diagnostics. No tokens, URLs or file
// content in user-visible errors. Progress is advisory and never authorizes writes.
const phases=new Set([
 'V0_APPROVED','V1_SYNC_JOURNAL','V1_SYNC_PROOF','V2_SYNC_JOURNAL',
 'V2_SYNC_PROOF','V1_SESSION_CLAIM','VERSION_FOLDER_CATALOG',
 'V3_SESSION_CHAIN','PROJECT_LINEAGE'
]);
const networkFailure=e=>{
 const message=String(e?.message||e||'');
 return /failed to fetch|networkerror|network request failed|load failed|fetch failed|ERR_NETWORK|CORS/i.test(message)||
  e instanceof TypeError&&/fetch|network/i.test(message);
};
export function safePlanningErrorMessage(error){
 const raw=String(error?.message||error||'Ismeretlen ellenorzesi hiba.');
 if(networkFailure(error))
  return 'NETWORK_FETCH_FAILED: a lekeres nem kapott HTTP-valaszt. '+
   'Lehet atmeneti halozati, bongeszo-/CORS- vagy kapcsolatproblema.';
 return raw.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/https?:\/\/[^\s)]+/gi,'[URL]')
  .replace(/(?:access_token|refresh_token|sig|signature)=[^&\s]+/gi,'[REDACTED]')
  .slice(0,180);
}
export function createPlanningInspectionTrace({onPhase=()=>{}}={}){
 if(typeof onPhase!=='function')throw Error('Invalid read-only planning progress reporter.');
 let current='NOT_STARTED';
 async function read(phase,fn){
  if(!phases.has(phase)||typeof fn!=='function')
   throw Error('Invalid read-only planning stage.');
  current=phase;
  try{onPhase(phase);}catch{/* UI errors must not break proof reads. */}
  try{return await fn();}
  catch(error){
   throw Error('Tervellenorzes sikertelen ['+phase+']: '+
    safePlanningErrorMessage(error)+
    ' Az ellenorzes csak olvasott; az elozo V3 inditas allapota meg nincs igazolva.',
    {cause:error});
  }
 }
 return Object.freeze({read,phase:()=>current});
}
