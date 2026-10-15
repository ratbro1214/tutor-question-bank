import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { openMathCatalog } from '../lib/open-math';
import { methodContentSchema } from '../lib/knowledge-graph';
import { graphFixture } from './support/knowledge-graph-fixture';

test('公共资料快照完整，来源固定到版本，方法满足条件与局限要求', () => {
  const manifest = JSON.parse(readFileSync(new URL('../data/open-math/manifest.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  for (const source of manifest) for (const file of source.files) {
    const bytes = readFileSync(new URL(`../data/open-math/sources/${source.id}/${file.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  assert.ok(openMathCatalog.topics.length >= 150);
  assert.ok(openMathCatalog.methods.some(m => m.stage === '初中'));
  assert.ok(openMathCatalog.methods.some(m => m.stage === '高中'));
  for (const m of openMathCatalog.methods) {
    methodContentSchema.parse(m.content);
    assert.ok(m.source.url.includes(m.source.commit));
    assert.ok(m.topicIds.every(id => openMathCatalog.topics.some(t => t.id === id)));
  }
  assert.equal(openMathCatalog.topics.find(t => t.id === 'cnmt_s4na_quadratic_fn')?.chapter, '二次函数');
  assert.equal(openMathCatalog.topics.find(t => t.id === 'cnmt_s4na_quadratic_eq')?.chapter, '一元二次方程');
});

test('公共图谱关系端点存在，去重，无自环与先修循环', () => {
  const ids = new Set(openMathCatalog.topics.map(t => t.id));
  assert.equal(ids.size, openMathCatalog.topics.length);
  const keys = new Set<string>(), outgoing = new Map<string,string[]>();
  for (const e of openMathCatalog.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to));
    assert.notEqual(e.from, e.to);
    const key = e.from + ':' + e.to;
    assert.ok(!keys.has(key)); keys.add(key);
    outgoing.set(e.from, [...outgoing.get(e.from)||[],e.to]);
  }
  const active = new Set<string>(), done = new Set<string>();
  function visit(id:string) { assert.ok(!active.has(id), `先修循环：${id}`); if(done.has(id))return; active.add(id); for(const next of outgoing.get(id)||[])visit(next);active.delete(id);done.add(id); }
  for(const id of ids)visit(id);
});

test('公共方法副本不依赖已有题目解析，按待审核保存且保留来源，其他用户不可读取', async () => {
  const f = graphFixture();
  try {
    const reference = openMathCatalog.methods[0], id = randomUUID();
    const source = {origin:'manual' as const, evidence:null, note:`公共资料整理副本，待教师核查；${reference.source.repository} · ${reference.source.license} · ${reference.source.url}`};
    await f.store.writeMethod(id,{operationId:randomUUID(),expectedRevision:0,scopeId:'s',status:'candidate',content:reference.content,source});
    assert.equal((await f.store.getMethod(id)).source.note,source.note);
    assert.equal((await f.store.methods(true)).length,0);
    assert.equal((await f.store.methods(false)).length,1);
    await assert.rejects(f.other.getMethod(id),/无权访问/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM math_knowledge_relations').get()!.n,0);
  } finally { f.db.close(); }
});
