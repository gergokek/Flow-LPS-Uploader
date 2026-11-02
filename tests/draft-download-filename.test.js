import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('downloaded DRAFT filename validation accepts saved version name',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const match=source.match(/if\(!file\|\|!\/(\^draft-.*?\$)\/\.test\(file\.name\)/);
 assert.ok(match,'filename validator exists');
 const validator=new RegExp(match[1]);
 assert.equal(validator.test('draft-vmvzdabkq-6cc4252b-6a1.json'),true);
 assert.equal(validator.test('approved-vmvzdabkq-6cc4252b-6a1.json'),false);
});
