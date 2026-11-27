// Isolated, origin/nonce-bound TEST browser bridge. The Graph proof comes
// exclusively from createSingleDraftSessionStore; postMessage is only
// transport/display feedback, NEVER an authorization for Monday writes.
export const SINGLE_DRAFT_PROTOCOL='mflow-single-draft-session-v1';
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);
export function attachSingleDraftSessionBridge({win=window,
 onSaveRevision=async()=>{},onApprovePlan=async()=>{},
 onPrepareSync=async()=>{},onPilotRequest=async()=>{throw Error('V1 pilot is not connected.');},
 onVersionedApproval=async()=>{throw Error('V3 Approved Plan nincs bekotve.');},
 onVersionedSync=async()=>{throw Error('V3 Sync nincs bekotve.');},onStatus=()=>{}}={}){
 if(typeof onSaveRevision!=='function'||typeof onApprovePlan!=='function'||
    typeof onPrepareSync!=='function'||typeof onPilotRequest!=='function'||
    typeof onVersionedApproval!=='function'||typeof onVersionedSync!=='function'||
    typeof onStatus!=='function'||
    !win||typeof win.addEventListener!=='function')
  throw Error('Érvénytelen TEST munkamenet-átadás.');
 const p=new URLSearchParams((win.location.hash||'').replace(/^#/,''));
 const nonce=p.get('mflow-session'),boardId=p.get('board');
 if(!uuid(nonce)||boardId!=='5107075373'||!win.opener)
  return Object.freeze({active:false,ready:false,close:()=>{},
   selected:()=>false,approvedForSync:()=>false,saved:()=>false,failed:()=>false});
 let origin=null,closed=false,selectedSession=null,working=false,
  approved=false,blocked=false,approvedForSyncState=null,syncPrepared=false,
  v3Approved=null;
 const pilotSeen=new Set();let pilotAheadUsed=false,pilotResultUsed=false;
 const emit=(kind,extras={})=>{
  if(closed||!origin||!win.opener)return false;
  try{win.opener.postMessage({protocol:SINGLE_DRAFT_PROTOCOL,
   kind,nonce,boardId,...extras},origin);return true;}catch{return false;}
 };
 const handler=async event=>{
  if(closed||event.source!==win.opener||
     event.data?.protocol!==SINGLE_DRAFT_PROTOCOL||
     event.data?.nonce!==nonce||event.data.boardId!==boardId||
     !/^https:\/\//.test(event.origin)||event.origin==='null')return;
  if(event.data.kind==='hello'){
   if(origin&&origin!==event.origin)return;
   origin=event.origin;emit('ready');onStatus('ready');return;
  }
  if(!origin||event.origin!==origin||working||blocked)return;
  if(event.data.kind==='v1-pilot-request'&&approvedForSyncState&&(!selectedSession||(selectedSession.planVersion===2&&event.data.action?.startsWith('v2-flow-')))){
   const x=event.data;
   if(!uuid(x.requestId)||pilotSeen.has(x.requestId)||
      !['inspect','ahead','result','full-inspect','full-begin','full-reconcile','full-ahead','full-result','full-finish','v2-inspect','v2-begin','v2-open','v2-flow-inspect','v2-flow-begin','v2-flow-approve','v2-flow-ahead','v2-flow-result','v2-flow-finish','planning-inspect','planning-inspect-vn','planning-open','planning-consent','planning-begin','planning-open-v3-approved'].includes(x.action)||
      x.expectedApprovedSha256!==approvedForSyncState.sha256||
      x.expectedSessionId!==approvedForSyncState.sessionId||
      x.expectedRevision!==approvedForSyncState.revision)return;
   pilotSeen.add(x.requestId);working=true;
   try{
    if(x.action==='ahead'&&pilotAheadUsed||x.action==='result'&&pilotResultUsed)
     throw Error('V1 pilot: ugyanaz az iras nem ismetelheto.');
    if(x.action==='ahead')pilotAheadUsed=true;
    if(x.action==='result')pilotResultUsed=true;
    const result=await onPilotRequest({action:x.action,payload:x.payload,
     requestId:x.requestId,expectedApprovedSha256:x.expectedApprovedSha256,
     expectedSessionId:x.expectedSessionId,expectedRevision:x.expectedRevision});
    if(x.action==='v2-flow-approve')approved=true;
    if(x.action==='planning-open'||x.action==='planning-begin'){
     const selected=result;
     if(selected?.status!=='ACTIVE'||selected.planVersion!==3||
       !uuid(selected.sessionId)||selected.draft?.session?.planVersion!==3||
       selected.draft.session.sessionId!==selected.sessionId||
       selected.draft.version!==selected.revision||
       !/^[a-f0-9]{64}$/.test(selected.receipt?.sha256||'')||
       selected.mondayWrites!==0)
      throw Error('A kivalsztott V3 munkamenet nem igazolt.');
     selectedSession={sessionId:selected.sessionId,planVersion:3,
      revision:selected.revision,sha256:selected.receipt.sha256};
    }
    if(x.action==='planning-open-v3-approved'){
     const r=result;
     if(r?.status!=='APPROVED_V3'||r.planVersion!==3||
        r.boardId!==boardId||!uuid(r.sessionId)||
        !Number.isSafeInteger(r.revision)||r.revision<0||
        !/^[a-f0-9]{64}$/.test(r.sourceDraftSha256||'')||
        r.receipt?.sha256!==r.sourceDraftSha256||
        !/^[a-f0-9]{64}$/.test(r.approvedSha256||'')||
        !/^[a-f0-9]{64}$/.test(r.approvalReceiptSha256||'')||
        r.mondayWrites!==0||
        !['READY_TO_SYNC','READY_TO_CLOSE','MANUAL_REVIEW_REQUIRED',
           'V3_SYNC_COMPLETED'].includes(r.syncStatus))
      throw Error('Jovahagyott V3 SharePoint-nyugtak nem egyeznek.');
     selectedSession={sessionId:r.sessionId,planVersion:3,
      revision:r.revision,sha256:r.sourceDraftSha256};
     approved=true;
     v3Approved={approvedSha256:r.approvedSha256,
      approvalReceiptSha256:r.approvalReceiptSha256};
    }
    if(x.action==='v2-open'){
     const latest=result.revisions?.at(-1)||result.baseline;
     if(result.status!=='V2_ACTIVE'||!uuid(result.claim?.document?.sessionId)||
        latest?.document?.session?.planVersion!==2||
        latest.document.session.sessionId!==result.claim.document.sessionId)
      throw Error('Invalid V2 activation result.');
     selectedSession={sessionId:result.claim.document.sessionId,planVersion:2,
      revision:latest.document.version,sha256:latest.receipt.sha256};
    }
    emit('v1-pilot-response',{requestId:x.requestId,action:x.action,
     approvedSha256:approvedForSyncState.sha256,result});
   }catch(error){
    emit('v1-pilot-failed',{requestId:x.requestId,action:x.action,
     message:String(error?.message||error).slice(0,350)});
   }finally{working=false;}
   return;
  }
  if(event.data.kind==='prepare-sync-checkpoint'&&approvedForSyncState&&!syncPrepared){
   const x=event.data;
   if(!uuid(x.requestId)||x.expectedApprovedSha256!==approvedForSyncState.sha256||
      x.expectedSessionId!==approvedForSyncState.sessionId||
      x.expectedRevision!==approvedForSyncState.revision||
      !/^[a-f0-9]{64}$/.test(x.boardFingerprintSha256||'')||
      !/^\d+$/.test(x.editorId||'')||
      typeof x.boardVerifiedAt!=='string')return;
   working=true;
   try{
    const result=await onPrepareSync({
     expectedApprovedSha256:x.expectedApprovedSha256,
     expectedSessionId:x.expectedSessionId,
     expectedRevision:x.expectedRevision,
     boardFingerprintSha256:x.boardFingerprintSha256,
     boardVerifiedAt:x.boardVerifiedAt,
     editorId:x.editorId
    });
    if(result?.status!=='PREPARED_NO_WRITES'||
       result.approvedSha256!==approvedForSyncState.sha256||
       result.checkpoint?.name!=='sync-v1-prepared.json'||
       !/^[a-f0-9]{64}$/.test(result.checkpoint.sha256||'')||
       !result.checkpoint.eTag||result.mondayWrites!==0||
       result.writeAuthorization!=='NOT_GRANTED')
     throw Error('Nem igazolt a szinkron 0-írásos checkpoint.');
    syncPrepared=true;
    emit('sync-checkpoint-stored',{
     requestId:x.requestId,status:result.status,
     approvedSha256:result.approvedSha256,
     checkpoint:result.checkpoint,mondayWrites:0,
     writeAuthorization:'NOT_GRANTED'
    });
    onStatus('sync-prepared');
   }catch(error){
    blocked=true;
    emit('sync-checkpoint-failed',{
     requestId:x.requestId,message:String(error?.message||error).slice(0,350)});
    onStatus('blocked');
   }finally{working=false;}
   return;
  }
  if(event.data.kind==='versioned-sync-request'&&
     selectedSession?.planVersion===3&&v3Approved&&approved){
   const x=event.data,requestId=x.requestId;
   if(!uuid(requestId)||pilotSeen.has(requestId)||
      !['inspect','begin','ahead','result','finish','v4-ready'].includes(x.action)||
      x.expectedSessionId!==selectedSession.sessionId||
      x.expectedRevision!==selectedSession.revision||
      x.expectedDraftSha256!==selectedSession.sha256||
      x.expectedApprovedSha256!==v3Approved.approvedSha256||
      x.expectedApprovalReceiptSha256!==v3Approved.approvalReceiptSha256)
    return;
   pilotSeen.add(requestId);working=true;
   try{
    const result=await onVersionedSync({action:x.action,
     requestId,editorId:x.editorId,payload:x.payload||{},
     expectedSessionId:x.expectedSessionId,
     expectedRevision:x.expectedRevision,
     expectedDraftSha256:x.expectedDraftSha256,
     expectedApprovedSha256:x.expectedApprovedSha256,
     expectedApprovalReceiptSha256:x.expectedApprovalReceiptSha256});
    if(result===undefined||result===null)
     throw Error('A V3 Sync naplovalasza hianyzik.');
    emit('versioned-sync-response',{requestId,action:x.action,result});
    onStatus('v3-'+x.action);
   }catch(error){
    emit('versioned-sync-failed',{requestId,action:x.action,
     message:String(error?.message||error).slice(0,350)});
    if(!['inspect','v4-ready'].includes(x.action))blocked=true;
    onStatus('v3-sync-failed');
   }finally{working=false;}
   return;
  }
  if(!selectedSession||approved)return;
  if(event.data.kind==='versioned-approval-request'&&selectedSession.planVersion===3){
   const x=event.data,req=x.requestId;
   if(!uuid(req)||pilotSeen.has(req)||!['inspect','approve'].includes(x.action)||
      x.expectedSessionId!==selectedSession.sessionId||
      x.expectedRevision!==selectedSession.revision||
      x.expectedDraftSha256!==selectedSession.sha256)return;
   pilotSeen.add(req);working=true;
   try{
    const result=await onVersionedApproval({
     action:x.action,requestId:req,editorId:x.editorId,
     expectedSessionId:x.expectedSessionId,
     expectedRevision:x.expectedRevision,
     expectedDraftSha256:x.expectedDraftSha256,
     expectedGenerationSha256:x.expectedGenerationSha256,
     expectedPredecessorSha256:x.expectedPredecessorSha256,
     boardFingerprintSha256:x.boardFingerprintSha256,
     boardVerifiedAt:x.boardVerifiedAt,
     boardSnapshot:x.boardSnapshot,
     mondayConfirmed:x.mondayConfirmed,
     executionId:x.executionId
    });
    if(result?.boardId!==boardId||result.planVersion!==3||
       result.sessionId!==selectedSession.sessionId||
       result.revision!==selectedSession.revision||
       result.sourceDraftSha256!==selectedSession.sha256||
       result.mondayWrites!==0||
       result.mondaySyncAllowed!==false||
       (x.action==='inspect'&&result.status!=='DRAFT_READY')||
       (x.action==='approve'&&!['READY_TO_SYNC','READY_TO_CLOSE'].includes(result.status)))
      throw Error('V3 Approved Plan ellenorzott valasza nem egyezik.');
    if(x.action==='approve'){
     approved=true;
     if(!/^[a-f0-9]{64}$/.test(result.approvedSha256||'')||
        !/^[a-f0-9]{64}$/.test(result.approvalReceiptSha256||''))
      throw Error('Az Approved V3 igazolas hianyos.');
     v3Approved={approvedSha256:result.approvedSha256,
      approvalReceiptSha256:result.approvalReceiptSha256};
    }
    emit('versioned-approval-response',{requestId:req,action:x.action,result});
    onStatus(x.action==='approve'?'approved':'reviewed');
   }catch(error){
    if(x.action==='approve')blocked=true;
    emit('versioned-approval-failed',{requestId:req,action:x.action,
     message:String(error?.message||error).slice(0,350)});
    onStatus(x.action==='approve'?'blocked':'review-failed');
   }finally{working=false;}
   return;
  }
  if(event.data.kind==='save-revision'){
   const draft=event.data.draft,requestId=event.data.requestId;
   if(!uuid(requestId)||!draft||typeof draft!=='object'||
      draft.boardId!==boardId||
      draft.session?.sessionId!==selectedSession.sessionId||
      draft.session?.planVersion!==selectedSession.planVersion||
      draft.version!==selectedSession.revision+1)return;
   working=true;
   try{
    const result=await onSaveRevision({draft,requestId,
     sessionId:selectedSession.sessionId});
    if(result?.status!=='SAVED'||result.sessionId!==selectedSession.sessionId||
       result.revision!==draft.version||
       !/^[a-f0-9]{64}$/.test(result.receipt?.sha256||'')||
       !result.receipt.eTag)
     throw Error('Nem igazolt a DRAFT mentése.');
    selectedSession={...selectedSession,revision:result.revision,sha256:result.receipt.sha256};
    emit('revision-saved',{requestId,revision:result.revision,
     receipt:{sha256:result.receipt.sha256,eTag:result.receipt.eTag,
      name:result.receipt.name,verification:result.receipt.verification}});
    onStatus('saved');
   }catch(error){
    blocked=true;
    emit('revision-failed',{requestId,message:String(error?.message||error).slice(0,300)});
    onStatus('blocked');
   }finally{working=false;}
  }else if(event.data.kind==='approve-plan'&&selectedSession.planVersion===1){
   const x=event.data;
   if(!uuid(x.requestId)||x.expectedSessionId!==selectedSession.sessionId||
      x.expectedRevision!==selectedSession.revision||
      x.expectedSha256!==selectedSession.sha256||
      !/^[a-f0-9]{64}$/.test(x.boardFingerprintSha256||'')||
      typeof x.boardVerifiedAt!=='string'||
      !/^\d+$/.test(x.editorId||''))return;
   working=true;
   try{
    const result=await onApprovePlan({
     expectedSessionId:x.expectedSessionId,
     expectedRevision:x.expectedRevision,
     expectedSha256:x.expectedSha256,
     boardFingerprintSha256:x.boardFingerprintSha256,
     boardVerifiedAt:x.boardVerifiedAt,editorId:x.editorId,
     requestId:x.requestId});
    if(result?.status!=='APPROVED_PLAN_V1_STORED'||
       result.sessionId!==selectedSession.sessionId||
       result.revision!==selectedSession.revision||
       result.finalDraftSha256!==selectedSession.sha256||
       !/^[a-f0-9]{64}$/.test(result.approvedPlan?.sha256||'')||
       !result.approvedPlan?.eTag||result.mondayWrites!==0)
     throw Error('Nem igazolt az Approved Plan V1 véglegesítése.');
    approved=true;
    emit('approval-stored',{requestId:x.requestId,revision:result.revision,
     finalDraftSha256:result.finalDraftSha256,
     approvedPlan:result.approvedPlan,
     receiptSha256:result.receiptSha256,
     mondayWrites:0,mondaySyncAllowed:false});
    onStatus('approved');
   }catch(error){
    blocked=true;
    emit('approval-failed',{requestId:x.requestId,
     message:String(error?.message||error).slice(0,350)});
    onStatus('blocked');
   }finally{working=false;}
  }
 };
 win.addEventListener('message',handler);
 // Nonce is unguessable and opener origin is established by the hello roundtrip.
 try{win.opener.postMessage({protocol:SINGLE_DRAFT_PROTOCOL,
  kind:'ready',nonce,boardId},'*');}catch{/* User can retry opening. */}
 function selected(verified){
  if(closed||!origin||working||approved||blocked||selectedSession||verified?.status!=='ACTIVE'||
     verified.boardId!==boardId||!uuid(verified.sessionId)||
     !Number.isSafeInteger(verified.revision)||verified.revision<0||
     verified.draft?.session?.sessionId!==verified.sessionId||
     verified.draft?.session?.planVersion!==verified.planVersion||
     ![1,3].includes(verified.planVersion)||
     verified.draft.version!==verified.revision||
     verified.receipt?.verification!=='content-sha256-and-etag'||
     !/^[a-f0-9]{64}$/.test(verified.receipt.sha256||''))
   return false;
  const sent=emit('session-selected',{sessionId:verified.sessionId,
   revision:verified.revision,versionLabel:verified.versionLabel,
   draft:structuredClone(verified.draft),
   receipt:{sha256:verified.receipt.sha256,eTag:verified.receipt.eTag,
    name:verified.receipt.name,verification:verified.receipt.verification}});
  if(sent)selectedSession={sessionId:verified.sessionId,planVersion:verified.planVersion,
   revision:verified.revision,sha256:verified.receipt.sha256};
  return sent;
 }
 function approvedForSync(verified){
  if(closed||!origin||working||blocked||selectedSession||
     approvedForSyncState||verified?.status!=='APPROVED_V1_VERIFIED'||
     verified.boardId!==boardId||!uuid(verified.sessionId)||
     verified.planVersion!==1||verified.revision<1||
     verified.receipt?.name!=='approved-v1.json'||
     verified.receipt.verification!=='content-sha256-and-etag'||
     !/^[a-f0-9]{64}$/.test(verified.receipt.sha256||'')||
     verified.approvedPlan?.sourceDraft?.sha256!==verified.sourceDraftSha256||
     verified.mondayWrites!==0||verified.mondaySyncAllowed!==false)
   return false;
  const sent=emit('approved-sync-selected',{
   sessionId:verified.sessionId,revision:verified.revision,
   approvedPlan:structuredClone(verified.approvedPlan),
   receipt:verified.receipt,
   approvalReceiptSha256:verified.approvalReceiptSha256,
   freezeSha256:verified.freezeSha256,
   sourceDraftSha256:verified.sourceDraftSha256,
   mondayWrites:0,mondaySyncAllowed:false});
  if(sent)approvedForSyncState={sessionId:verified.sessionId,
   revision:verified.revision,sha256:verified.receipt.sha256};
  return sent;
 }
 const close=()=>{closed=true;win.removeEventListener('message',handler);};
 return Object.freeze({active:true,selected,approvedForSync,close,
  ready:()=>!!origin,session:()=>selectedSession,
  syncSession:()=>approvedForSyncState,
  v3Approved:()=>v3Approved});
}
