"""One-time TEST-only patch, bound to the reviewed app blob. No service writes."""
from pathlib import Path
from hashlib import sha1
p=Path('app.js')
b=p.read_bytes()
assert sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='5b0aaf298dc531e7c0d030d22e6b957e2158a609', 'Unexpected application source'
s=b.decode()
start=s.index("  if(action==='begin'){",s.index('},onPilotRequest:async request=>{'))
end=s.index("  if(action==='ahead'){",start)
old=s[start:end]
assert "throw Error('A teljes szinkron inditasat megszakitottad. Nem tortent iras.');" in old
assert len(old)<1000
new='''  if(action==='begin'){
   const selected=singleSyncSelected,store=singleSyncStore,opener=window.opener;
   const isCurrent=()=>singleSyncSelected===selected&&singleSyncStore===store&&
    projectBoard.value.trim()==='5107075373'&&
    msal.getAllAccounts()[0]?.homeAccountId===createdBy&&
    msal.getAllAccounts()[0]?.tenantId===account.tenantId&&
    singleBridge.active&&singleBridge.ready()&&
    singleBridge.syncSession()?.sha256===request.expectedApprovedSha256&&
    singleBridge.syncSession()?.sessionId===request.expectedSessionId&&
    singleBridge.syncSession()?.revision===request.expectedRevision&&
    !!opener&&window.opener===opener&&!opener.closed;
   return beginV1FullSyncWithConsent({full,args,
    host:approvedV1SyncOutput.parentElement,output:approvedV1SyncOutput,isCurrent});
  }
'''
s=s[:start]+new+s[end:]
s="import {beginV1FullSyncWithConsent} from './full-sync-consent-ui.js';\n"+s
assert s.count('return beginV1FullSyncWithConsent(')==1
p.write_text(s)
p=Path('styles.css')
s=p.read_text()
assert '.v1-full-sync-consent' not in s
p.write_text(s+'\n/* Explicit asynchronous V1 consent, never a native popup. */\n'+
 '.v1-full-sync-consent{border:2px solid #195b94;background:#f2f7ff}\n'+
 '#approveV1FullSync{background:#195b94;color:#fff;border-color:#195b94}\n')
