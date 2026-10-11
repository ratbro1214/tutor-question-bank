import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { graphFixture } from './support/knowledge-graph-fixture';
import { methodWriteSchema, relationWriteSchema, similarMethods, type RelationWrite } from '../lib/knowledge-graph';
import { initializePilot, pilotMethods } from '../lib/knowledge-graph-pilot';
const manual = { origin: 'manual' as const, note: 'TEST 教师依据', evidence: null };
const method = (status = 'approved', revision = 0) => methodWriteSchema.parse({ operationId: randomUUID(), expectedRevision: revision, scopeId: 's', status, content: pilotMethods[0], source: manual });
const edge = (from = 1, to = 2, type = 'prerequisite', status = 'approved') => relationWriteSchema.parse({ operationId: randomUUID(), expectedRevision: 0, scopeId: 's', status, type, fromKnowledge: from, toKnowledge: to, methodId: null, canonicalId: null, revisionId: null, source: manual });

test('contains 与 prerequisite 分别检测直接、间接循环，related 对称幂等，不破坏分类树', async () => { const f = graphFixture(); try {
  const before = f.db.prepare('SELECT * FROM knowledge_points').all();
  for (const type of ['contains', 'prerequisite']) { await f.store.writeRelation(randomUUID(), edge(1, 2, type)); await f.store.writeRelation(randomUUID(), edge(2, 3, type)); await assert.rejects(f.store.writeRelation(randomUUID(), edge(3, 1, type)), /循环/); }
  assert.throws(() => edge(1, 1)); await f.store.writeRelation(randomUUID(), edge(1, 3, 'related')); await assert.rejects(f.store.writeRelation(randomUUID(), edge(3, 1, 'related')), /已存在/);
  assert.deepEqual(f.db.prepare('SELECT * FROM knowledge_points').all(), before); assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
} finally { f.db.close(); } });
test('AI 候选不会自动成为事实，教师显式审核，编辑、撤销均保留历史和版本冲突保护', async () => { const f = graphFixture(); try {
  const s = f.solution(), candidate = await f.store.candidates(f.a.c, f.a.r, s.review);
  assert.equal(candidate.source.evidence.promptVersion, '5B-test'); assert.equal(candidate.source.evidence.model, 'mock');
  await assert.rejects(f.store.writeMethod(randomUUID(), { ...method(), content: candidate.content, source: candidate.source }), /候选/);
  const id = randomUUID(), input = { ...method('candidate'), content: candidate.content, source: candidate.source }; await f.store.writeMethod(id, input); await f.store.writeMethod(id, input);
  assert.equal((await f.store.methods()).length, 0); await f.store.writeMethod(id, { ...input, operationId: randomUUID(), expectedRevision: 1, status: 'approved' });
  assert.equal((await f.store.methods()).length, 1); assert.equal((await f.store.getMethod(id)).versions.length, 2);
  await assert.rejects(f.store.writeMethod(id, { ...input, operationId: randomUUID() }), /版本/);
  const aiRelation = { ...edge(), type: 'applies' as const, fromKnowledge: null, methodId: id, source: candidate.source };
  await assert.rejects(f.store.writeRelation(randomUUID(), aiRelation), /候选/);
  await f.store.writeRelation(randomUUID(), { ...aiRelation, status: 'candidate' });
  const relationId = randomUUID(), r = edge(1, 2, 'prerequisite', 'candidate'); await f.store.writeRelation(relationId, r); await f.store.writeRelation(relationId, r);
  assert.equal((await f.store.relations()).length, 0); await f.store.writeRelation(relationId, { ...r, operationId: randomUUID(), expectedRevision: 1, status: 'approved' });
  assert.equal((await f.store.relations()).length, 1); await f.store.revokeRelation(relationId, 2, randomUUID()); assert.equal((await f.store.relations()).length, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM math_relation_versions WHERE relation_id=?').get(relationId)!.n, 3);
  assert.equal((await f.store.relationHistory(relationId)).versions.length, 3);
  await assert.rejects(f.other.relationHistory(relationId), /无权/);
} finally { f.db.close(); } });
test('一题多方法、一法多题按具体解法版本关联，来源变化撤出正式查询，原数据保持', async () => { const f = graphFixture(); try {
  const q2 = f.question('s', 2), s1 = f.solution(), s2 = f.solution(q2.c, q2.r), ids = [randomUUID(), randomUUID()];
  for (const id of ids) await f.store.writeMethod(id, method());
  async function link(id: string, c: string, r: string, review: string) { const e = (await f.store.evidence(c, r, review)).evidence; return f.store.writeRelation(randomUUID(), { ...edge(), type: 'uses', fromKnowledge: null, toKnowledge: null, methodId: id, canonicalId: c, revisionId: r, source: { ...manual, evidence: e } }); }
  const relation = await link(ids[0], f.a.c, f.a.r, s1.review); await link(ids[1], f.a.c, f.a.r, s1.review); await link(ids[0], q2.c, q2.r, s2.review);
  assert.equal((await f.store.questions({ methodId: ids[0] })).items.length, 2); assert.equal((await f.store.questions({ canonicalId: f.a.c })).items[0].methods.length, 2);
  const oldQuestion = f.db.prepare('SELECT * FROM canonical_questions WHERE id=?').get(f.a.c);
  f.db.prepare("UPDATE paper_solution_reviews SET teacher_status='rejected' WHERE id=?").run(s1.review);
  assert.equal((await f.store.questions({ methodId: ids[0] })).items.length, 1); assert.equal((await f.store.relations(true, undefined, { canonicalId: f.a.c })).length, 0);
  await f.store.revokeRelation(relation.id, 1, randomUUID()); assert.deepEqual(f.db.prepare('SELECT * FROM canonical_questions WHERE id=?').get(f.a.c), oldQuestion);
} finally { f.db.close(); } });
test('方法与关系 ID、跨 scope 引用、解析来源均隔离，同 scope 的不同教师也不可读取', async () => { const f = graphFixture(); try {
  const id = randomUUID(), m = await f.store.writeMethod(id, method()), r = await f.store.writeRelation(randomUUID(), edge()); const solution = f.solution();
  for (const other of [f.other, f.sameScopeOther]) { await assert.rejects(other.getMethod(id), /无权/); await assert.rejects(other.getRelation(r.id), /无权/); await assert.rejects(other.writeMethod(id, method('approved', 1)), /无权/); assert.equal((await other.methods(false)).length, 0); }
  await assert.rejects(f.store.question(f.b.c), /无权/); await assert.rejects(f.sameScopeOther.evidence(f.a.c, f.a.r, solution.review), /已审核/);
  await assert.rejects(f.store.writeMethod(randomUUID(), { ...method(), scopeId: 'other' }), /无权/);
  await assert.rejects(f.other.writeRelation(randomUUID(), { ...edge(), scopeId: 'other', type: 'applies', fromKnowledge: null, methodId: m.id }), /无权/);
  assert.equal((await f.sameScopeOther.relations(false)).length, 0);
} finally { f.db.close(); } });
test('CAS 丢失者不能写版本；事务失败回滚；数据库循环守卫覆盖并发新增', async () => { const f = graphFixture(); try {
  const id = randomUUID(); await f.store.writeMethod(id, method()); f.race(() => f.db.prepare('UPDATE math_methods SET revision=2 WHERE id=?').run(id));
  await assert.rejects(f.store.writeMethod(id, method('approved', 1)), /冲突/); assert.equal((await f.store.getMethod(id)).versions.length, 1);
  f.fail(true); await assert.rejects(f.store.writeRelation(randomUUID(), edge()), /injected/); f.fail(false); assert.equal((await f.store.relations(false)).length, 0);
  f.race(() => f.db.prepare("INSERT INTO math_knowledge_relations(id,owner_id,scope_id,relation_key,type,from_knowledge,to_knowledge,revision,operation_id,status,source,reviewer,updated_at) VALUES('racer','teacher','s','racer','prerequisite',2,1,1,'race','approved',?,'teacher','now')").run(JSON.stringify(manual)));
  await assert.rejects(f.store.writeRelation(randomUUID(), edge()), /循环/); assert.equal((await f.store.relations()).length, 1);
} finally { f.db.close(); } });
test('合并保留来源方法、版本和所有证据；名称相同不能自动合并', async () => { const f = graphFixture(); try {
  const ids = [randomUUID(), randomUUID()]; for (const id of ids) await f.store.writeMethod(id, method()); assert.equal((await f.store.methods()).length, 2);
  const relation: RelationWrite = { ...edge(), type: 'applies', fromKnowledge: null, methodId: ids[0] }; await f.store.writeRelation(randomUUID(), relation);
  const merge = { operationId: randomUUID(), sourceRevision: 1, targetRevision: 1 }; await f.store.merge(ids[0], ids[1], merge); await f.store.merge(ids[0], ids[1], merge);
  assert.equal((await f.store.methods()).length, 1); assert.equal((await f.store.relations())[0].method_id, ids[1]); assert.equal((await f.store.getMethod(ids[0])).versions.length, 2);
  assert.equal(f.db.prepare('SELECT method_id FROM math_knowledge_relations').get()!.method_id, ids[0]); assert.ok(similarMethods(pilotMethods[0], await f.store.methods()).length);
} finally { f.db.close(); } });
test('专题初始化幂等，仅候选，无虚构题目；默认图谱不包含题目，分类检索分页有限', async () => { const f = graphFixture(); try {
  const before = f.db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n;
  const first = await initializePilot(f.store, 's'), second = await initializePilot(f.store, 's'); assert.equal(first.createdMethods, 5); assert.equal(second.createdMethods, 0); assert.equal(second.createdRelations, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_questions').get()!.n, before); assert.equal((await f.store.snapshot()).methods.length, 0); assert.equal((await f.store.snapshot('高中', 'HS-DERIVATIVE', false)).methods.length, 5);
  assert.ok(!('questions' in await f.store.snapshot())); assert.equal((await f.store.questions({ knowledge: 'HS-DERIVATIVE-MONOTONICITY' })).items.length, 0);
  for (let n = 1; n < 205; n++) f.question('s', n);
  const start = performance.now(), page = await f.store.questions({ knowledge: 'HS-DERIVATIVE-MONOTONICITY', approved: false, page: 2 });
  assert.equal(page.items.length, 20); assert.equal(page.total, 205); assert.equal(page.hasMore, true); assert.ok(performance.now() - start < 3000); await assert.rejects(f.store.questions({ page: 0, knowledge: 'x' }), /分页/);
  assert.equal(f.db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
} finally { f.db.close(); } });
test('失效的匹配、解析编辑或题目内容不能继续充当已审核证据', async () => { const f = graphFixture(); try {
  const s = f.solution(), extracted = await f.store.candidates(f.a.c, f.a.r, s.review), id = randomUUID();
  await f.store.writeMethod(id, { ...method('candidate'), content: extracted.content, source: extracted.source }); await f.store.writeMethod(id, { ...method('approved', 1), content: extracted.content, source: extracted.source });
  f.db.prepare('UPDATE paper_solution_matches SET revision=2 WHERE entry_id=?').run(s.entry);
  assert.equal((await f.store.methods()).length, 0); await assert.rejects(f.store.candidates(f.a.c, f.a.r, s.review), /已审核/);
  assert.equal((await f.store.getMethod(id)).evidenceValid, false);
} finally { f.db.close(); } });
test('专题初始化在教师修改名称和说明后仍幂等，不覆盖审核内容；缺失局限必须补充', async () => { const f = graphFixture(); try {
  await initializePilot(f.store, 's'); const m = (await f.store.methods(false))[0];
  await f.store.writeMethod(m.id, { ...method('approved', m.revision), content: { ...m.content, name: '教师修改的方法名称' }, source: { ...m.source, note: '教师重新编写的说明' } });
  const repeated = await initializePilot(f.store, 's'); assert.equal(repeated.createdMethods, 0); assert.equal(repeated.createdRelations, 0);
  assert.equal((await f.store.getMethod(m.id)).content.name, '教师修改的方法名称'); assert.equal((await f.store.getMethod(m.id)).status, 'approved');
  const s = f.solution(); f.db.prepare('UPDATE paper_solution_reviews SET result=? WHERE id=?').run(JSON.stringify({ ...s.result, quality: { ...s.result.quality, limitations: [] } }), s.review);
  const candidate = await f.store.candidates(f.a.c, f.a.r, s.review), id = randomUUID();
  await f.store.writeMethod(id, { ...method('candidate'), content: candidate.content, source: candidate.source });
  await assert.rejects(f.store.writeMethod(id, { ...method('approved', 1), content: candidate.content, source: candidate.source }), /真实适用局限/);
} finally { f.db.close(); } });
