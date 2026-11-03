import test from 'node:test';
import assert from 'node:assert/strict';
import {checkApproverPreflight} from '../approver-identity-preflight.js';
const tenantId='816099a1-2aff-441c-b4ef-9c3a405ac2fa';
const oid='e4c642e2-d5c5-40f7-b32c-af82bc281002';
const group='12c642e2-d5c5-40f7-b32c-af82bc281003';
const user={id:oid,displayName:'Example User',userPrincipalName:'user@example.com'};
function fixture({member=false,meStatus=200,groupStatus=200}={}){
 const calls=[];
 return {calls,options:{
  tenantId,accountTenantId:tenantId,getAccessToken:async()=> 'sample-token',
  fetcher:async(url,options)=>{
   calls.push({url,options});
   if(url.includes('checkMemberGroups'))return {ok:groupStatus===200,status:groupStatus,
    json:async()=>({value:member?[group]:[]})};
   return {ok:meStatus===200,status:meStatus,json:async()=>user};
  }
 }};
}
test('Graph identity verifies, but missing configured group never grants approval',async()=>{
 const f=fixture(),r=await checkApproverPreflight(f.options);
 assert.equal(r.identity.objectId,oid);
 assert.equal(r.checks.approverGroupMembership,'not-configured');
 assert.equal(r.eligibleForApproval,false);
 assert.equal(r.mondaySyncAllowed,false);
 assert.equal(f.calls.length,1);
 assert.match(f.calls[0].url,/\/me\?/);
});
test('optional group membership can be observed but never authorizes approval',async()=>{
 for(const member of [true,false]){
  const f=fixture({member}),r=await checkApproverPreflight({...f.options,approverGroupId:group});
  assert.equal(r.checks.approverGroupMembership,member?'member-reported-by-graph':'not-member');
  assert.equal(f.calls[1].options.method,'POST');
  assert.deepEqual(JSON.parse(f.calls[1].options.body),{groupIds:[group]});
  assert.equal(r.eligibleForApproval,false);
 }
});
test('wrong tenant, failed Graph and invalid group response fail closed',async()=>{
 const f=fixture();
 await assert.rejects(()=>checkApproverPreflight({...f.options,accountTenantId:'11111111-1111-4111-8111-111111111111'}),/tenant/);
 await assert.rejects(()=>checkApproverPreflight(fixture({meStatus:403}).options),/Graph \/me hiba/);
 await assert.rejects(()=>checkApproverPreflight({...fixture({groupStatus:403}).options,approverGroupId:group}),/csoportellenorzes/);
 const bad=fixture();
 bad.options.fetcher=async url=>url.includes('checkMemberGroups')?{ok:true,json:async()=>({value:['not-a-guid']})}:{ok:true,json:async()=>user};
 await assert.rejects(()=>checkApproverPreflight({...bad.options,approverGroupId:group}),/csoporttagsagi/);
});
