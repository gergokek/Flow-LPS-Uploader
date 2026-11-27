// Read-only summary for the isolated Uploader TEST V3 folder inventory.
// This does not certify Approved/Sync completeness and cannot call a writer.
import {versionLayout,lifecycleFileName,draftFileName} from './version-workspace-layout.js';
const ok=(x,msg)=>{if(!x)throw Error(msg);};
export function summarizeVersionedApprovalInventory({boardId,planVersion,sessionFiles,
 draftFiles,approvedFiles,syncFiles}={}){
 const layout=versionLayout(boardId,planVersion);
 ok(boardId==='5107075373'&&planVersion===3&&!layout.legacy,
  'Csak az izolalt V3 TEST tarhely vizsgalhato.');
 const groups=[sessionFiles,draftFiles,approvedFiles,syncFiles];
 ok(groups.every(Array.isArray),'Hianyos V3 fajllista.');
 for(const entries of groups){
  ok(entries.every(x=>typeof x?.name==='string'&&x.id&&x.eTag)&&
   new Set(entries.map(x=>x.name)).size===entries.length&&
   new Set(entries.map(x=>x.id)).size===entries.length,
   'Ismeretlen vagy duplikalt SharePoint fajlmetadata.');
 }
 const allowedSessions=new Set(['version-info.json',
  lifecycleFileName(3,'claim'),lifecycleFileName(3,'freeze'),
  lifecycleFileName(3,'approval-receipt'),lifecycleFileName(3,'closure')]);
 const allowedDraft=name=>name===draftFileName(3)||
  /^draft-v3-r[0-9]{6}\.json$/.test(name);
 ok(sessionFiles.every(x=>allowedSessions.has(x.name))&&
  draftFiles.every(x=>allowedDraft(x.name))&&
  approvedFiles.every(x=>x.name===lifecycleFileName(3,'approved'))&&
  syncFiles.every(x=>x.name===lifecycleFileName(3,'completion')||
   /^sync-v3-step-[0-9]{6}-(ahead|result)\.json$/.test(x.name)),
  'Ismeretlen verzios fajl. A jo vahagyas nem folytathato.');
 const names=entries=>new Set(entries.map(x=>x.name));
 const sessions=names(sessionFiles),drafts=names(draftFiles),
  approved=names(approvedFiles),sync=names(syncFiles);
 const hasFreeze=sessions.has(lifecycleFileName(3,'freeze')),
  hasReceipt=sessions.has(lifecycleFileName(3,'approval-receipt')),
  hasApproved=approved.has(lifecycleFileName(3,'approved'));
 const hasFinal=sync.has(lifecycleFileName(3,'completion'));
 const hasSync=syncFiles.length>0;
 let status='DRAFT_IN_PROGRESS';
 if(!sessions.has('version-info.json')&&!sessions.has(lifecycleFileName(3,'claim'))&&
  draftFiles.length===0&&!hasFreeze&&!hasApproved&&!hasSync)
  status='NO_SESSION';
 else if(!sessions.has('version-info.json')||
         !sessions.has(lifecycleFileName(3,'claim'))||
         !drafts.has(draftFileName(3)))status='INCOMPLETE_REQUIRES_REVIEW';
 else if(hasFinal)status='SYNC_FILES_REQUIRE_VERIFICATION';
 else if(hasSync)status='SYNC_FILES_REQUIRE_VERIFICATION';
 else if(hasFreeze||hasReceipt||hasApproved)
  status=hasFreeze&&hasReceipt&&hasApproved?'APPROVAL_FILES_REQUIRE_VERIFICATION':
   'APPROVAL_INCOMPLETE';
 // File names alone are never evidence of approval or completed sync.
 return Object.freeze({status,readOnly:true,mondayWrites:0,
  planVersion,sessionFileCount:sessionFiles.length,draftFileCount:draftFiles.length,
  approvedFileCount:approvedFiles.length,syncFileCount:syncFiles.length,
  approvalVerified:false,syncVerified:false,
  paths:Object.freeze({session:layout.session,drafts:layout.drafts,
   approved:layout.approved,sync:layout.sync})});
}
export function versionedApprovalInventoryMessage(r){
 ok(r?.planVersion===3&&r.readOnly===true&&r.mondayWrites===0,
  'Nem ellenorzott UI allapot.');
 const explanation={
  NO_SESSION:'Meg nincs V3 munkamenet.',
  DRAFT_IN_PROGRESS:'A V3 DRAFT fajlok jelen vannak. Jo vahagyas nem igazolt.',
  INCOMPLETE_REQUIRES_REVIEW:'Hianyos V3 munkamenet. Kulon egyeztetes szukseges.',
  APPROVAL_INCOMPLETE:'Megkezdett, de hianyos jovahagyasi fajllanc.',
  APPROVAL_FILES_REQUIRE_VERIFICATION:'Jovahagyasi fajlok jelen vannak, de teljes tartalmi igazolas kell.',
  SYNC_FILES_REQUIRE_VERIFICATION:'Szinkronfajlok jelen vannak, de a teljes naplolanc nincs igazolva.'
 }[r.status];
 ok(explanation,'Ismeretlen V3 UI allapot.');
 return 'V3 tarhely – fajllista ellenorzes (nem jovahagyas):\n'+
  explanation+'\nSession: '+r.sessionFileCount+' fajl | Drafts: '+
  r.draftFileCount+' | Approved: '+r.approvedFileCount+
  ' | Sync: '+r.syncFileCount+
  '\nApproved igazolt: nem | Szinkron igazolt: nem | Monday-iras: 0.';
}
