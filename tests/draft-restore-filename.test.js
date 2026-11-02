import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('DRAFT restore filename accepts a real SharePoint DRAFT name',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const section=source.slice(source.indexOf("document.querySelector('#restoreDraftFile')"));
 const match=section.match(/if\(!\/([^\n]*?)\/\.test\(file\.name\)/);
 assert.ok(match,'restore filename pattern exists');
 const pattern=new RegExp(match[1]);
 assert.equal(pattern.test('draft-vmvzdabkq-6cc4252b-6a1.json'),true);
 assert.equal(pattern.test('approved-vmvzdabkq-6cc4252b-6a1.json'),false);
});
