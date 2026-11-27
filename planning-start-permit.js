// Separate consent from actual versioned creation. A second click is not a write
// authorization until Monday sends a new complete board snapshot. In memory
// only, single use, never restored after reload, never minted by a payload flag.
import {isVersionedPlan} from './versioned-cycle-version.js';
const ok=(v,m)=>{if(!v)throw Error(m);};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const pins=a=>({editorId:a?.editorId,createdBy:a?.createdBy,
 executionId:a?.executionId,expectedPlanVersion:a?.expectedPlanVersion??3,boardFingerprint:a?.boardFingerprint,
 expectedPredecessorSha256:a?.expectedPredecessorSha256});
const equal=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
export function createPlanningStartPermit({now=()=>Date.now(),
 randomUUID=()=>crypto.randomUUID(),lifetimeMs=120000}={}){
 ok(typeof now==='function'&&typeof randomUUID==='function'&&
  Number.isSafeInteger(lifetimeMs)&&lifetimeMs>0&&lifetimeMs<=120000,
  'Invalid planning consent configuration.');
 let pending=null;
 function issue({state,args,confirmed,isCurrent}={}){
  ok(typeof isCurrent==='function'&&isCurrent()===true&&confirmed===true&&
   args?.mondayConfirmed===true&&uuid(args.executionId)&&
   typeof args.editorId==='string'&&/^[0-9]+$/.test(args.editorId)&&
   typeof args.createdBy==='string'&&args.createdBy.length>0&&
   typeof args.boardFingerprint==='string'&&args.boardFingerprint.length>0&&
   hex(args.expectedPredecessorSha256)&&
   state?.readOnly===true&&state.mondayWrites===0&&
   state.action==='START_NEXT'&&isVersionedPlan(state.planVersion)&&
   state.planVersion===(args.expectedPlanVersion??3)&&state.boardMatches===true&&
   state.predecessorCompletionSha256===args.expectedPredecessorSha256,
   'A ket kulon verzios inditasi jovahagyas vagy a forras nem igazolt.');
  const permitId=randomUUID(),issuedAt=now();
  ok(uuid(permitId)&&Number.isFinite(issuedAt),'Invalid planning permit identity.');
  pending={permitId,issuedAt,pins:pins(args),state:structuredClone(state),isCurrent};
  return Object.freeze({status:'START_CONFIRMED_AWAITING_BOARD',
   planVersion:state.planVersion,permitId,executionId:args.executionId,
   predecessorCompletionSha256:state.predecessorCompletionSha256,
   mondayWrites:0,readOnly:true});
 }
 function consume(args={}){
  const p=pending;pending=null;
  const at=Date.parse(args.boardVerifiedAt),t=now();
  ok(p&&p.isCurrent()===true&&args.mondayConfirmed===true&&
   args.permitId===p.permitId&&equal(p.pins,pins(args))&&
   args.boardSnapshot?.id==='5107075373'&&Number.isFinite(at)&&
   at>=p.issuedAt-5000&&at<=t+5000&&t>=p.issuedAt&&
   t-p.issuedAt<=lifetimeMs&&t-at<=120000,
   'A verzios engedely lejart, mar felhasznaltak vagy nincs jovahagyas utani board-ellenorzes.');
  return Object.freeze({state:structuredClone(p.state),uploaderConfirmed:true});
 }
 return Object.freeze({issue,consume,clear:()=>{pending=null;}});
}
