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
 assert.doesNotMatch(app,/requestPlanningStartConsent\(\{[\s\S]*?host:approvedV1SyncOutput\.parentElement/);
});
test('Uploader reports cancellation or expired V3 start consent without silent waiting state',()=>{
 assert.match(app,/A V3\.0 masodik jovahagyasa nem sikerult/);
 assert.match(app,/A V3\.0 masodik jovahagyasat megszakitottak/);
 assert.match(app,/approvedV1SyncOutput\.textContent='V3\.0 inditas: varakozas/);
 assert.match(app,/store\.planningActions\.execute\(\{\.\.\.args,/);
});