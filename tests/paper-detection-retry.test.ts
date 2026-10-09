import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDetectionNetwork} from '../lib/paper-detection-retry';
test('a dropped provider connection or response body is retried',async()=>{
 let calls=0;
 const result=await retryDetectionNetwork(async()=>{if(++calls<3)throw Error('Network connection lost.');return 'ok';},new AbortController().signal,0);
 assert.equal(calls,3);assert.equal(result,'ok');
});
test('schema errors are not retried and persistent network errors stop after three attempts',async()=>{
 let calls=0;
 await assert.rejects(retryDetectionNetwork(async()=>{calls++;throw SyntaxError('Invalid JSON');},new AbortController().signal,0),/Invalid JSON/);assert.equal(calls,1);
 calls=0;await assert.rejects(retryDetectionNetwork(async()=>{calls++;throw TypeError('fetch failed');},new AbortController().signal,0),/fetch failed/);assert.equal(calls,3);
});
test('user cancellation ends retries',async()=>{
 const abort=new AbortController();let calls=0;
 await assert.rejects(retryDetectionNetwork(async()=>{calls++;abort.abort();throw Error('Network connection lost.');},abort.signal,0));assert.equal(calls,1);
});
