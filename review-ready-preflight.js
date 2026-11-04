import {validateEditedDraft} from './edited-draft-validator.js';
import {verifyGraphDraftContent} from './graph-draft-content-verifier.js';
import {checkApproverPreflight} from './approver-identity-preflight.js';

// Explicit, read-only review preflight for the last verified DRAFT in this tab.
// It does not authorize an approval, export an approved plan, or write to Monday.
export async function inspectSavedDraftForReview({
 draftText,saved,boardId,driveId,tenantId,accountTenantId,
 getAccessToken,fetcher=fetch
}={}){
 const current=await validateEditedDraft(draftText,boardId);
 if(!saved||saved.boardId!==boardId||saved.version!==current.version||
    saved.sha256!==current.sha256||saved.bytes!==current.bytes||
    saved.verification!=='content-sha256-and-etag'||
    typeof saved.name!=='string'||
    !/^draft-v[1-9]\d*-[A-Za-z0-9_-]{8,100}\.json$/.test(saved.name)||
    !saved.name.startsWith('draft-v'+current.version+'-')||
    typeof saved.id!=='string'||!saved.id||
    typeof saved.eTag!=='string'||!saved.eTag)
  throw new Error('Nincs az aktualis DRAFT-verziohoz tartozo teljesen ellenorzott SharePoint-mentes.');
 const requestText=JSON.stringify({
  schemaVersion:1,format:'flow-lps-draft-review-request',
  status:'REVIEW_REQUEST',isApprovedPlan:false,
  approvalDecision:null,mondaySyncAllowed:false,
  draft:{boardId,version:current.version,taskCount:current.taskCount,
   sha256:current.sha256,bytes:current.bytes}
 });
 // Independently read the previously saved immutable filename from Graph.
 const evidence=await verifyGraphDraftContent({
  requestText,boardId,driveId,fileName:saved.name,getAccessToken,fetcher
 });
 if(evidence.sharePoint.itemId!==saved.id||
    evidence.sharePoint.eTag!==saved.eTag||
    evidence.sha256!==saved.sha256||evidence.bytes!==saved.bytes)
  throw new Error('A SharePoint-fajl az elozo mentesi igazolas ota megvaltozott.');
 // Graph /me confirms Entra identity, not Monday identity or approver authority.
 const identity=await checkApproverPreflight({
  getAccessToken,fetcher,tenantId,accountTenantId
 });
 return Object.freeze({
  status:'REVIEW_PREFLIGHT_BLOCKED',
  boardId,version:current.version,taskCount:current.taskCount,
  sha256:current.sha256,bytes:current.bytes,
  file:{name:saved.name,id:saved.id,eTag:saved.eTag},
  identity:identity.identity,
  checks:{
   graphContent:'verified-sha256-and-etag',
   graphMetadata:'stable',
   entraIdentity:'verified-graph-me',
   separateApproverRole:'not-required',
   trustedAuthorization:'not-established',
   mondaySourceConflict:'not-checked-in-uploader'
  },
  eligibleForApproval:false,isApprovedPlan:false,mondaySyncAllowed:false
 });
}
