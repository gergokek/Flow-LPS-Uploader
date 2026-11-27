import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedReadCache} from '../verified-read-cache.js';
const meta={id:'file',name:'draft.json',eTag:'tag',size:10};
test('verified cache clones data and requires matching freshly read metadata',()=>{
 const cache=createVerifiedReadCache();
 const value={working:[{note:'original'}]};
 cache.put('path',{...meta,value,sha256:'a'.repeat(64)});
 const result=cache.get('path',meta);
 assert.equal(result.value.working[0].note,'original');
 result.value.working[0].note='tamper';
 assert.equal(cache.get('path',meta).value.working[0].note,'original');
 for(const key of ['id','name','eTag','size']){
  cache.put('path',{...meta,value,sha256:'a'.repeat(64)});
  assert.equal(cache.get('path',{...meta,[key]:key==='size'?11:'different'}),null);
 }
 cache.put('path',{...meta,value,sha256:'a'.repeat(64)});
 cache.discard('path');assert.equal(cache.get('path',meta),null);
});

test('cache is bounded and rejects unverified records',()=>{
 const cache=createVerifiedReadCache({maxEntries:1,maxBytes:16});
 cache.put('a',{...meta,value:{},sha256:'a'.repeat(64)});
 cache.put('b',{...meta,value:{},sha256:'b'.repeat(64)});
 assert.equal(cache.get('a',meta),null);
 assert.ok(cache.get('b',meta));
 cache.put('b',{...meta,value:{},sha256:'bad'});
 assert.equal(cache.get('b',meta),null);
});
