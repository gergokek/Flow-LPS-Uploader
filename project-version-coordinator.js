// Bind the state resolver to version-specific verified stores.
// Discovery itself is read-only. This never falls back from an invalid version
// to the next version and never silently opens an unsupported planning engine.
import {resolvePlanningState} from './project-version-resolver.js';
const ok=(x,m)=>{if(!x)throw Error(m);};
export function createProjectVersionCoordinator({boardId,
 readProjectState,storeForVersion,check=()=>{}}={}){
 ok(typeof boardId==='string'&&/^\d{5,20}$/.test(boardId)&&
  [readProjectState,storeForVersion,check].every(x=>typeof x==='function'),
  'Invalid project version coordinator dependencies.');
 let busy=false;
 async function inspect(){
  check();const evidence=await readProjectState();check();
  ok(evidence?.boardId===boardId,'The project state belongs to a different board.');
  const resolved=resolvePlanningState(evidence);
  return Object.freeze({...resolved,boardId});
 }
 async function execute({userConfirmed=false,...args}={}){
  ok(!busy,'A project version operation is in progress.');
  busy=true;
  try{
   const state=await inspect();
   ok(state.action==='RESUME_DRAFT'||state.action==='START_NEXT'||
      state.action==='RECOVER_SAME_SESSION',
      'The project needs verification, finalization or manual review first.');
   if(state.action==='START_NEXT')
    ok(userConfirmed===true,'A new plan version requires explicit confirmation.');
   const store=await storeForVersion(state.planVersion);check();
   ok(store&&typeof store.inspect==='function'&&typeof store.begin==='function',
    'This plan version is not yet implemented.');
   // Verify again after acquiring the version store; do not use stale discovery.
   const fresh=await inspect();check();
   ok(fresh.action===state.action&&fresh.planVersion===state.planVersion&&
    fresh.status===state.status,
    'The planning state changed during selection. No version was started.');
   if(state.action==='RESUME_DRAFT'){
    const live=await store.inspect(args);check();
    ok(live.status==='ACTIVE'&&live.planVersion===state.planVersion,
     'The existing DRAFT changed or is unverified.');
    return {action:'RESUME_DRAFT',version:state.planVersion,report:live};
   }
   if(state.action==='RECOVER_SAME_SESSION'){
    // Never create a second claim without a positive, specifically verified
    // recovery path. Engines without a safe recover method are blocked.
    ok(typeof store.recover==='function','Recovery requires an explicit verified implementation.');
    return {action:'RECOVER_SAME_SESSION',version:state.planVersion,
      report:await store.recover(args)};
   }
   return {action:'START_NEXT',version:state.planVersion,
    report:await store.begin({...args,userConfirmed:true})};
  }finally{busy=false;}
 }
 return Object.freeze({inspect,execute});
}
