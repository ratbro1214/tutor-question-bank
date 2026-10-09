import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../lib/api-response';

test('handles plain-text 413 without a JSON parsing error', async () => {
 await assert.rejects(readApiResponse(new Response('Payload Too Large', { status: 413 })), /上传请求过大.*40MB/);
});
test('preserves structured API errors and handles HTML failures', async () => {
 await assert.rejects(readApiResponse(Response.json({ error: '文件内容不是 PDF。' }, { status: 400 })), /文件内容不是 PDF/);
 await assert.rejects(readApiResponse(new Response('<html>error</html>', { status: 502 })), /HTTP 502/);
});
test('reads successful JSON and reports malformed successful responses', async () => {
 assert.deepEqual(await readApiResponse(Response.json({ paper: { id: 'p' } })), { paper: { id: 'p' } });
 await assert.rejects(readApiResponse(new Response('not JSON')), /无法识别的响应/);
});
