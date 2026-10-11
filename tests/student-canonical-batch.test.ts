import test from 'node:test';
import assert from 'node:assert/strict';
import { importStudentQuestions } from '../lib/student-canonical-batch';

test('batch skips existing mappings, continues after errors and confirms reviewed selections', async () => {
  const posts: { url: string; body: unknown }[] = [], progress: number[] = [];
  const request = async <T,>(url: string, body?: unknown): Promise<T> => {
    if (url.includes('/2/')) throw Error('原图缺失');
    if (body) { posts.push({ url, body }); return { canonicalId: 'new', reused: false } as T; }
    return { snapshot: 'hash', text: '已审核题干', canonicalId: url.includes('/1/') ? 'existing' : null } as T;
  };
  const results = await importStudentQuestions(9, [1, 2, 3, 3], request, done => progress.push(done));
  assert.deepEqual(results.map(r => r.status), ['already', 'failed', 'added']);
  assert.equal(results[1].error, '原图缺失'); assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { studentId: 9, snapshot: 'hash', text: '已审核题干', confirmed: true });
  assert.deepEqual(progress, [1, 2, 3]);
});
test('abandoning page stops further imports after current completed work', async () => {
  const abort = new AbortController(), posts: string[] = [];
  const request = async <T,>(url: string, body?: unknown): Promise<T> => { if (body) { posts.push(url); return { canonicalId: 'new', reused: true } as T; } return { snapshot: 'hash', text: '已审核题干', canonicalId: null } as T; };
  const results = await importStudentQuestions(1, [1, 2, 3], request, () => abort.abort(), abort.signal);
  assert.equal(results.length, 1); assert.equal(results[0].status, 'reused'); assert.equal(posts.length, 1);
});
