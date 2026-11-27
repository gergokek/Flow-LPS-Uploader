"""Synthetic check using the real app callback and inline UI. No external writes."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import re,json,os,shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
app=(root/'app.js').read_text()
handler=re.search(r'onPilotRequest:(async request=>\{.*?\n\}),onStatus:state=>\{',app,re.S).group(1)
begin=handler[handler.index("if(action==='begin')"):handler.index("if(action==='ahead')")]
assert 'window.confirm' not in begin and 'beginV1FullSyncWithConsent' in begin
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/index.html'
with sync_playwright() as pw:
 executable=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
 browser=pw.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1024,'height':900})
 context.route('**/index.html',lambda route:route.fulfill(content_type='text/html',body='''<!doctype html><html lang="hu"><head><title>Uploader TEST fixture</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>M-Flow TEST - synthetic consent check</h1><section><h2>Approved Plan V1</h2><output id="approvedV1SyncResult"></output></section></main></body></html>'''))
 parent=context.new_page();parent.goto(url)
 with parent.expect_popup() as popup: parent.evaluate('(url)=>window.open(url,"_blank")',url)
 page=popup.value;page.wait_for_load_state()
 page.evaluate('''async handler=>{
 const {beginV1FullSyncWithConsent}=await import('/full-sync-consent-ui.js');
 window.identity={homeAccountId:'test-home',tenantId:'test-tenant'};
 window.beginCalls=0;window.nativeCalls=0;window.answer=null;window.recovery=false;window.lastConsent=null;
 window.confirm=()=>{window.nativeCalls++;return false;};
 const projectBoard={value:'5107075373'},msal={getAllAccounts:()=>[window.identity]};
 const selected={receipt:{sha256:'a'.repeat(64)},sessionId:'test-session',revision:4};
 let singleSyncSelected=selected;
 const singleBridge={active:true,ready:()=>true,syncSession:()=>({sha256:'a'.repeat(64),sessionId:'test-session',revision:4})};
 const singleSyncStore={fullSync:{inspect:async()=>({status:window.recovery?'RECONCILIATION_AVAILABLE':'READY_TO_SYNC',reconciliation:window.recovery?{step:2,taskId:'102',taskName:'Synthetic task',approvedNote:'Note ',observedNote:'Note',sha256:'c'.repeat(64)}:null,verifiedTaskCount:1,remainingTaskCount:49,changedTaskCount:50,ledgerSha256:'b'.repeat(64)}),
  begin:async args=>{if(args.userConfirmed!==true)throw Error('No consent');window.lastConsent=args.acceptedReconciliationSha256;window.beginCalls++;return {remainingTaskCount:49};}}};
 const approvedV1SyncOutput=document.querySelector('#approvedV1SyncResult');
 const callback=eval('('+handler+')');
 window.start=()=>{window.answer=null;window.pending=callback({action:'full-begin',requestId:'test-request',expectedApprovedSha256:'a'.repeat(64),expectedSessionId:'test-session',expectedRevision:4,payload:{ledgerSha256:'b'.repeat(64)}}).then(x=>window.answer={ok:true,result:x}).catch(e=>window.answer={ok:false,error:e.message});};
}''',handler)
 parent.bring_to_front();page.evaluate('start()')
 page.wait_for_selector('#approveV1FullSync',state='attached');page.wait_for_timeout(150)
 assert page.evaluate('beginCalls')==0 and page.evaluate('nativeCalls')==0 and page.evaluate('answer') is None
 page.bring_to_front();page.keyboard.press('Enter');page.wait_for_timeout(100)
 assert page.evaluate('beginCalls')==0
 out=root/'artifacts/consent';out.mkdir(parents=True,exist_ok=True)
 page.screenshot(path=str(out/'full-sync-consent-ready.png'),full_page=True)
 page.locator('#approveV1FullSync').click();page.wait_for_function('answer!==null')
 assert page.evaluate('answer.ok') and page.evaluate('beginCalls')==1 and page.evaluate('nativeCalls')==0
 page.evaluate('start()');page.locator('#cancelV1FullSync').click();page.wait_for_function('answer!==null')
 assert not page.evaluate('answer.ok') and 'Megse gombjaval' in page.evaluate('answer.error') and page.evaluate('beginCalls')==1
 page.evaluate('start()');page.wait_for_selector('#approveV1FullSync')
 page.evaluate("identity={homeAccountId:'changed',tenantId:'test-tenant'}")
 page.wait_for_function('answer!==null');assert not page.evaluate('answer.ok') and page.evaluate('beginCalls')==1
 page.evaluate("identity={homeAccountId:'test-home',tenantId:'test-tenant'};recovery=true;start()")
 page.wait_for_selector('#approveV1FullSync')
 text=page.locator('#v1FullSyncConsent').inner_text()
 assert '"Note "' in text and '"Note"' in text and '48 tovabbi feladat' in text
 page.screenshot(path=str(out/'full-sync-reconciliation-consent.png'),full_page=True)
 page.locator('#approveV1FullSync').click();page.wait_for_function('answer!==null')
 assert page.evaluate('answer.ok') and page.evaluate('lastConsent')=='c'*64 and page.evaluate('beginCalls')==2
 report={'status':'PASSED','cases':['background request waits','no native dialog','Enter does not approve','explicit accept only','cancel writes nothing','identity change blocks','explicit variance description and acceptance binding'], 'syntheticBeginCalls':page.evaluate('beginCalls'),'nativeConfirmCalls':page.evaluate('nativeCalls'),'externalWrites':0}
 (out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
 context.close();browser.close()
server.shutdown()
