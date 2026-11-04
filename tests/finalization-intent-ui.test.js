import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Uploader shows confirmation as a review intent and offers no approval write action',async()=>{
 const [html,app,receiver]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../app.js',import.meta.url),'utf8'),
  readFile(new URL('../draft-handoff-receiver.js',import.meta.url),'utf8')
 ]);
 assert.match(html,/id="finalizationIntentResult"/);
 assert.match(html,/jóváhagyott terv/);
 assert.match(app,/savedReview\.currentProof\(\)/);
 assert.match(app,/onFinalizationIntent:async/);
 assert.match(app,/Approved-Plans és Monday változatlan/);
 assert.match(receiver,/REVIEW_INTENT_ONLY/);
 assert.doesNotMatch(html,/id="approve-final-plan"|id="sync-monday"/);
});
