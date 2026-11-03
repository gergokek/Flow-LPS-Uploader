import {app} from '@azure/functions';
import {DefaultAzureCredential} from '@azure/identity';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {verifyStoredDraft} from './verify-stored-draft.js';

const tenantId=process.env.AZURE_TENANT_ID;
const audience=process.env.FLOW_API_AUDIENCE;
const expectedOid=process.env.FLOW_ALLOWED_CALLER_OID;
const driveId=process.env.FLOW_DRIVE_ID;
const boardId=process.env.FLOW_BOARD_ID;
const configured=!!(tenantId&&audience&&expectedOid&&driveId&&boardId);
const issuer=configured?'https://login.microsoftonline.com/'+tenantId+'/v2.0':null;
const jwks=configured?createRemoteJWKSet(new URL('https://login.microsoftonline.com/'+tenantId+'/discovery/v2.0/keys')):null;
const credential=new DefaultAzureCredential();

async function authorize(headers){
 const value=headers.get('authorization')||'';
 if(!value.startsWith('Bearer ')||!jwks)throw new Error('Missing or invalid bearer token');
 const {payload}=await jwtVerify(value.slice(7),jwks,{issuer,audience,algorithms:['RS256']});
 const scopes=typeof payload.scp==='string'?payload.scp.split(' '):[];
 if(payload.tid!==tenantId||payload.oid!==expectedOid||!scopes.includes('Draft.Verify'))
  throw new Error('Caller is not entitled to verify DRAFT');
 return payload.oid;
}

app.http('verifyStoredDraft',{
 methods:['POST'],authLevel:'anonymous',route:'draft/verify-content',
 handler:async request=>{
  if(!configured)return {status:503,jsonBody:{error:'Server verification is not configured'}};
  try{await authorize(request.headers);}
  catch{return {status:401,jsonBody:{error:'Unauthorized'}};}
  try{
   const length=Number(request.headers.get('content-length')||0);
   if(length>1_000_000)return {status:413,jsonBody:{error:'Request too large'}};
   const text=await request.text();
   if(text.length>1_000_000)return {status:413,jsonBody:{error:'Request too large'}};
   const body=JSON.parse(text);
   const verified=await verifyStoredDraft({body,driveId,allowedBoardId:boardId,
    getGraphToken:async()=>{const token=await credential.getToken('https://graph.microsoft.com/.default');return token?.token;}});
   return {status:200,jsonBody:verified,headers:{'Cache-Control':'no-store'}};
  }catch(error){
   const status=error.status===400?400:422;
   return {status,jsonBody:{error:status===400?error.message:'Verification failed; DRAFT remains unapproved'},headers:{'Cache-Control':'no-store'}};
  }
 }
});
