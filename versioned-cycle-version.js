// Version bounds and exact lifecycle names. No version is enabled in the UI
// merely because its number can be represented by this shared contract.
export const isVersionedPlan=v=>Number.isSafeInteger(v)&&v>=3&&v<=9999;
export function requireVersionedPlan(v){
 if(!isVersionedPlan(v))throw Error('Invalid versioned plan.');
 return v;
}
export function completedSyncStatus(v){return 'V'+requireVersionedPlan(v)+'_SYNC_COMPLETED';}
export function nextReadyStatus(v){return 'V'+requireVersionedPlan(v)+'_READY_TO_START';}
export function draftRevisionPattern(v){
 return new RegExp('^draft-v'+requireVersionedPlan(v)+'-r([0-9]{6})\\.json$');
}
export function syncStepPattern(v){
 return new RegExp('^sync-v'+requireVersionedPlan(v)+'-step-([0-9]{6})-(ahead|result)\\.json$');
}
