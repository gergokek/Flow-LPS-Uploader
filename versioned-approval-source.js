// Independent read-only approval source for any supported version.
// No DRAFT writer, no trust in filename presence, no mutating route.
import {pilotAssert as ok} from './v1-pilot-contract.js';
import {isVersionedPlan} from './versioned-cycle-version.js';
import {readVersionedEvidence} from './versioned-evidence-reader.js';
import {inspectVersionedApprovalSource} from './versioned-lineage-contract.js';
export function createVersionedApprovalSource({version=3,inspectV2,inspectSource=inspectV2,
 read,list,now=()=>new Date(),check=()=>{}}={}){
 ok(isVersionedPlan(version)&&[inspectSource,read,list,now,check].every(fn=>typeof fn==='function'),
  'Nem teljes a verzios jovahagyasi forras ellenorzo.');
 async function inspect({editorId,createdBy}={}){
  check();
  ok(/^[0-9]+$/.test(editorId||'')&&typeof createdBy==='string'&&createdBy.length>0,
   'Bejelentkezett szerkeszto es Microsoft-fiok szukseges.');
  const predecessor=await inspectSource({editorId,createdBy});check();
  const raw=await readVersionedEvidence({version,read,list,check,includeFinalization:false});
  return inspectVersionedApprovalSource({predecessor,artifacts:raw.artifacts,
   planVersion:version,editorId,createdBy,now:now().getTime()});
 }
 return Object.freeze({inspect});
}
