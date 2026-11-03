const GRAPH='https://graph.microsoft.com/v1.0';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read-only identity and configured approver-group preflight.
// A browser-generated JSON report is never an authorization token or approval.
export async function checkApproverPreflight({getAccessToken,fetcher=fetch,tenantId,accountTenantId,approverGroupId=null}={}){
 if(typeof getAccessToken!=='function'||typeof fetcher!=='function'||!uuid.test(tenantId||'')||
    accountTenantId!==tenantId)throw new Error('Nem ervenyes Microsoft Entra munkamenet vagy tenant.');
 const token=await getAccessToken();
 if(typeof token!=='string'||!token)throw new Error('Microsoft Graph access token hianyzik.');
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const response=await fetcher(GRAPH+'/me?$select=id,displayName,userPrincipalName',{
  method:'GET',cache:'no-store',redirect:'error',headers});
 if(!response.ok)throw new Error('Microsoft Graph /me hiba: HTTP '+response.status);
 const me=await response.json();
 if(!uuid.test(me?.id||'')||typeof me.userPrincipalName!=='string'||!me.userPrincipalName)
  throw new Error('A Graph felhasznaloi azonositoja hianyzik vagy hibas.');
 let membership='not-configured';
 if(approverGroupId!==null){
  if(!uuid.test(approverGroupId))throw new Error('Ervenytelen jovahagyoi csoportazonosito.');
  const groupResponse=await fetcher(GRAPH+'/me/checkMemberGroups',{
   method:'POST',cache:'no-store',redirect:'error',
   headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({groupIds:[approverGroupId]})});
  if(!groupResponse.ok)throw new Error('Jovahagyoi csoportellenorzes hiba: HTTP '+groupResponse.status);
  const data=await groupResponse.json();
  if(!Array.isArray(data?.value)||data.value.some(v=>typeof v!=='string'||!uuid.test(v)||
     v.toLowerCase()!==approverGroupId.toLowerCase()))
   throw new Error('Ervenytelen csoporttagsagi valasz.');
  membership=data.value.length===1?'member-reported-by-graph':'not-member';
 }
 return Object.freeze({
  schemaVersion:1,format:'flow-lps-approver-identity-preflight',
  status:'IDENTITY_ONLY',tenantId,
  identity:{objectId:me.id,displayName:typeof me.displayName==='string'?me.displayName:null,
   userPrincipalName:me.userPrincipalName},
  checks:{entraIdentity:'passed',approverGroupMembership:membership,
   trustedAuthorization:'not-established',liveMondayConflict:'not-checked'},
  eligibleForApproval:false,isApprovedPlan:false,mondaySyncAllowed:false
 });
}
