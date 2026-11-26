import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('V3 setup is visibly separate from all legacy draft and approval controls',()=>{
 assert.match(index,/id="setupVersionFolders"/);
 assert.match(index,/id="versionFoldersResult"/);
 assert.match(index,/csak mappák/);
 assert.match(app,/store\.ensureVersion\(boardId,3\)/);
 assert.match(app,/layout\.versionRoot/);
 assert.match(app,/V3 DRAFT nincs elinditva/);
 assert.match(app,/window\.confirm/);
});
test('V3 setup is not automatic and cannot approve or write Monday tasks',()=>{
 const call=app.match(/store\.ensureVersion\(boardId,3\)/g)||[];
 assert.equal(call.length,1);
 assert.match(app,/versionFoldersButton\.addEventListener\('click'/);
 assert.doesNotMatch(app,/versionFoldersButton\.click\(/);
});
