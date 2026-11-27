import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('V3 start consent is visibly mounted before the Uploader status output',()=>{
 const host=html.indexOf('id="planningStartConsentHost"');
 const output=html.indexOf('id="approvedV1SyncResult"');
 const section=html.indexOf('id="approvedV1Sync"');
 assert.ok(section>=0&&host>section&&output>host);
 assert.match(html,/V3 DRAFT indításának külön Uploader-jóváhagyása/);
 assert.match(app,/host:planningStartConsentHost,state,isCurrent:current/);
 assert.doesNotMatch(app,/requestPlanningStartConsent\(\{\s*host:approvedV1SyncOutput\.parentElement/);
});
test('Uploader now surfaces each V3 post-consent phase and uncertain outcome',()=>{
 assert.match(app,/runPlanningStartFlow\(\{/);
 assert.match(app,/WAITING_FOR_UPLOADER_CONFIRMATION/);
 assert.match(app,/CREATING_OR_VERIFYING_SHAREPOINT/);
 assert.match(app,/READBACK_OF_V3_RECEIPTS/);
 assert.match(app,/ACTIVATING_MONDAY_EDITOR/);
 assert.match(app,/A V3 inditas nem sikerult/);
 assert.match(app,/Ne ismeteld az inditast/);
 assert.match(app,/store\.planningActions\.execute\(\{\.\.\.args,/);
});