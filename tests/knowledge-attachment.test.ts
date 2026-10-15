import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { graphFixture } from './support/knowledge-graph-fixture';
import { importKnowledgeCatalog } from '../lib/knowledge_graph/seed-store';
import { KnowledgeAttachmentStore, tryAttachKnowledge } from '../lib/knowledge_graph/attachment-store';
import { analysisFromClassification, knowledgeAnalysisSchema, type KnowledgeAnalysis } from '../lib/knowledge_graph/analysis';
import { buildClassificationFromCandidate, classificationCandidateSchemaForStage, normalizeClassificationTags, type MathClassificationCandidate, type VisionExtraction } from '../lib/classification';

const catalog = JSON.parse(readFileSync(new URL('../data/knowledge_graph/senior-math-v1.json', import.meta.url), 'utf8'));
const analysis: KnowledgeAnalysis = { main_knowledge: '二次函数', secondary_knowledge: ['函数单调性'], exam_point: '二次函数区间最值', question_type: '含参数二次函数最值问题' };
function fixture() {
  const f = graphFixture(); importKnowledgeCatalog(f.db, catalog);
  function classify(value: KnowledgeAnalysis = analysis, id = f.a.c) {
    f.db.prepare('UPDATE canonical_question_revisions SET payload=? WHERE canonical_question_id=?').run(JSON.stringify({ classification: { education_stage: '高中', chapter: { code: 'HS-FUNCTION' }, knowledge_points: [{ name: '二次函数' }], knowledge_graph: value } }), id);
  }
  classify(); classify(analysis, f.b.c);
  const store = new KnowledgeAttachmentStore(f.binding, 'teacher', ['s'], true);
  const other = new KnowledgeAttachmentStore(f.binding, 'other', ['other']);
  const node = (code: string) => f.db.prepare('SELECT * FROM knowledge_nodes WHERE code=?').get(code)!;
  const approve = async (code: string) => { const n = node(code); await store.reviewNode(String(n.id), String(n.updated_at)); };
  return { ...f, classify, store, other, node, approve };
}

test('AI schema is senior-only, graph output survives classification and legacy fallback remains explicit', () => {
  assert.ok(classificationCandidateSchemaForStage('高中').required.includes('knowledge_graph'));
  assert.ok(!classificationCandidateSchemaForStage('初中').required.includes('knowledge_graph'));
  const extraction: VisionExtraction = { extracted_question: '求二次函数最值', presentation_form: '解答题', has_diagram: false, extraction_confidence: 1, needs_review: false, review_reasons: [], extraction_notes: '' };
  const candidate: MathClassificationCandidate = { chapter_code: 'HS-FUNCTION', core_knowledge_point_codes: ['HS-FUNC-EXTREMUM'], auxiliary_knowledge_point_codes: [], method_codes: [], question_type: '函数性质与图像分析', difficulty: '中等', confidence: 1, needs_followup: false, needs_review: false, review_reasons: [], classification_notes: '比较区间最值', knowledge_graph: analysis };
  const result = normalizeClassificationTags(buildClassificationFromCandidate('高中', extraction, candidate));
  assert.deepEqual(result.knowledge_graph, analysis);
  assert.deepEqual(analysisFromClassification(result), analysis);
  assert.equal(analysisFromClassification({ ...result, education_stage: '初中' }), null);
  assert.equal(analysisFromClassification({ ...result, knowledge_graph: { main_knowledge: 123 } }), null);
  assert.equal(analysisFromClassification({ education_stage: '高中', knowledge_points: [{ name: '二次函数' }] })?.exam_point, '');
  assert.throws(() => knowledgeAnalysisSchema.parse({ ...analysis, main_knowledge: 'x'.repeat(121) }));
});

test('known labels map to seeded nodes, weights sum to one, retries preserve size and no AI record is approved', async () => {
  const f = fixture(); try {
    const first = await f.store.attach(f.a.c, f.a.r);
    assert.equal(first.status, 'attached'); assert.equal('proposed' in first && first.proposed, 0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_nodes').get()?.n, 392);
    assert.equal(f.db.prepare('SELECT count(*) n FROM question_knowledge_relation').get()?.n, 4);
    assert.equal(f.db.prepare("SELECT sum(weight) w FROM question_knowledge_relation WHERE role IN ('main','secondary')").get()?.w, 1);
    assert.equal((await f.store.list()).nodes.length, 0);
    await f.store.attach(f.a.c, f.a.r);
    assert.equal(f.db.prepare('SELECT count(*) n FROM question_knowledge_relation').get()?.n, 4);
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_relation_evidence').get()?.n, 4);
    assert.equal(f.db.prepare("SELECT count(*) n FROM question_knowledge_relation WHERE knowledge_review_status='approved'").get()?.n, 0);
  } finally { f.db.close(); }
});

test('unknown labels create scoped candidates, repeats reuse them and other teachers cannot see or approve them', async () => {
  const f = fixture(); try {
    f.classify({ main_knowledge: '待审新知识', secondary_knowledge: [], exam_point: '待审新考点', question_type: '待审新题型' });
    const result = await f.store.attach(f.a.c);
    assert.equal('proposed' in result && result.proposed, 3);
    await f.store.attach(f.a.c);
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_nodes').get()?.n, 395);
    assert.equal((await f.other.list(true)).nodes.length, 392);
    assert.equal((await f.store.list(true)).nodes.length, 395);
    const candidate = f.db.prepare("SELECT * FROM knowledge_nodes WHERE name='待审新知识'").get()!;
    await assert.rejects(f.other.reviewNode(String(candidate.id), String(candidate.updated_at)), /无权/);
    await assert.rejects(f.other.questionLinks(f.a.c), /无权/);
    await assert.rejects(f.other.attach(f.a.c), /无权/);
    await assert.rejects(f.store.reviewNode(String(candidate.id), String(candidate.updated_at)), /上级/);
    await f.approve('HS'); await f.approve('FUNC');
    await f.store.reviewNode(String(candidate.id), String(candidate.updated_at), String(f.node('FUNC').id));
    assert.ok((await f.store.list()).nodes.some(n => n.id === candidate.id));
    assert.ok(!(await f.other.list()).nodes.some(n => n.id === candidate.id));
  } finally { f.db.close(); }
});

test('aliases resolving to the same node are deduplicated and retain main weight one', async () => {
  const f = fixture(); try {
    f.classify({ main_knowledge: '函数单调性', secondary_knowledge: ['函数的单调性'], exam_point: '', question_type: '' });
    await f.store.attach(f.a.c);
    const rows = f.db.prepare('SELECT role,weight FROM question_knowledge_relation').all();
    assert.equal(rows.length, 1); assert.equal(rows[0].role, 'main'); assert.equal(rows[0].weight, 1);
  } finally { f.db.close(); }
});

test('ambiguous names produce a pending candidate instead of an arbitrary match', async () => {
  const f = fixture(); try {
    f.db.prepare("INSERT INTO knowledge_nodes(id,code,name,level,source,metadata) VALUES('ambiguous','ambiguous','二次函数',3,'ai',?)").run(JSON.stringify({ scope_id: 's' }));
    f.classify({ main_knowledge: '二次函数', secondary_knowledge: [], exam_point: '', question_type: '' });
    const result = await f.store.attach(f.a.c);
    assert.equal('proposed' in result && result.proposed, 1);
    const row = f.db.prepare('SELECT n.metadata FROM knowledge_nodes n JOIN question_knowledge_relation r ON r.knowledge_id=n.id').get()!;
    assert.equal(JSON.parse(String(row.metadata)).ambiguous, true);
    await f.store.attach(f.a.c);
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_nodes').get()?.n, 394);
  } finally { f.db.close(); }
});

test('formal counts require approved node and link, exclude other scopes, trash and old revisions', async () => {
  const f = fixture(); try {
    f.classify({ main_knowledge: '二次函数', secondary_knowledge: [], exam_point: '', question_type: '' });
    await f.store.attach(f.a.c); await f.other.attach(f.b.c);
    const links = await f.store.questionLinks(f.a.c), id = String(links[0].knowledge_id);
    await assert.rejects(f.store.reviewLink(f.a.c, id, f.a.r, String(links[0].updated_at)), /先审核/);
    await f.approve('HS'); await f.approve('FUNC'); await f.approve('FUNC.QUADRATIC');
    await f.store.reviewLink(f.a.c, id, f.a.r, String(links[0].updated_at));
    const before = f.db.prepare('SELECT * FROM question_knowledge_relation WHERE question_id=?').all(f.a.c);
    await f.store.attach(f.a.c);
    assert.deepEqual(f.db.prepare('SELECT * FROM question_knowledge_relation WHERE question_id=?').all(f.a.c), before);
    assert.equal((await f.store.list()).nodes.find(n => n.id === id)?.question_count, 1);
    assert.equal((await f.other.list()).nodes.find(n => n.id === id)?.question_count, 0);
    f.db.prepare("INSERT INTO math_library_trash(canonical_question_id,deleted_by) VALUES(?,'teacher')").run(f.a.c);
    assert.equal((await f.store.list()).nodes.find(n => n.id === id)?.question_count, 0);
    await assert.rejects(f.store.attach(f.a.c), /无权/);
    f.db.prepare('DELETE FROM math_library_trash WHERE canonical_question_id=?').run(f.a.c);
    f.db.prepare(`INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,education_stage,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,change_reason)
      SELECT 'new-revision',canonical_question_id,2,subject,education_stage,'changed',normalized_text,normalized_hash,content_schema_version,normalization_version,payload,identity_status,'edit' FROM canonical_question_revisions WHERE id=?`).run(f.a.r);
    f.db.prepare("UPDATE canonical_questions SET current_revision_id='new-revision' WHERE id=?").run(f.a.c);
    assert.equal((await f.store.list()).nodes.find(n => n.id === id)?.question_count, 0);
    assert.equal((await f.store.questionLinks(f.a.c))[0].stale, 1);
    await assert.rejects(f.store.attach(f.a.c, f.a.r), /版本已变化/);
    await f.store.attach(f.a.c, 'new-revision');
    assert.equal((await f.store.questionLinks(f.a.c))[0].knowledge_review_status, 'pending');
  } finally { f.db.close(); }
});

test('curator restriction, source races, approval races and batch failures preserve data', async () => {
  const f = fixture(); try {
    await assert.rejects(f.other.reviewNode(String(f.node('HS').id), String(f.node('HS').updated_at)), /维护者/);
    f.race(() => f.db.prepare("UPDATE canonical_question_revisions SET payload='{}' WHERE id=?").run(f.a.r));
    await assert.rejects(f.store.attach(f.a.c), /题目可能已变化/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM question_knowledge_relation').get()?.n, 0);
    f.classify({ main_knowledge: '失败候选', secondary_knowledge: [], exam_point: '考点', question_type: '' });
    f.fail(true); await assert.rejects(f.store.attach(f.a.c), /挂载未完成/); f.fail(false);
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_nodes').get()?.n, 392);
    const root = f.node('HS');
    f.race(() => f.db.prepare("UPDATE knowledge_nodes SET updated_at='changed' WHERE id=?").run(root.id));
    await assert.rejects(f.store.reviewNode(String(root.id), String(root.updated_at)), /审核期间/);
    assert.equal(f.node('HS').knowledge_review_status, 'pending');
  } finally { f.db.close(); }
});

test('paper-source fallback attaches only the current mapped text and checks concurrent classification changes', async () => {
  const f = fixture(); try {
    const s = f.solution();
    f.db.prepare("UPDATE canonical_question_revisions SET payload='{}' WHERE id=?").run(f.a.r);
    const classification = JSON.stringify({ education_stage: '高中', knowledge_graph: analysis });
    f.db.prepare('UPDATE paper_questions SET classification=? WHERE id=?').run(classification, s.qid);
    assert.equal((await f.store.attach(f.a.c)).status, 'attached');
    f.race(() => f.db.prepare("UPDATE paper_questions SET classification='{}' WHERE id=?").run(s.qid));
    await assert.rejects(f.store.attach(f.a.c), /挂载未完成/);
    f.db.prepare("UPDATE paper_questions SET classification=?,question_text='different' WHERE id=?").run(classification, s.qid);
    assert.equal((await f.store.attach(f.a.c)).status, 'skipped');
  } finally { f.db.close(); }
});

test('evidence foreign key rejects another question revision and optional hook reports missing setup', async () => {
  const f = fixture(); try {
    await f.store.attach(f.a.c);
    assert.throws(() => f.db.prepare('UPDATE knowledge_relation_evidence SET revision_id=? WHERE question_id=?').run(f.b.r, f.a.c), /FOREIGN KEY/);
    f.db.exec('DROP TABLE knowledge_relation_evidence');
    assert.equal((await tryAttachKnowledge(f.binding, 'teacher', ['s'], f.a.c)).status, 'deferred');
    assert.equal(f.db.prepare('SELECT count(*) n FROM question_knowledge_relation').get()?.n, 4);
  } finally { f.db.close(); }
});

test('cross-chapter edge review requires both endpoints and the shared curator role', async () => {
  const f = fixture(); try {
    const edge = f.db.prepare("SELECT * FROM knowledge_edges WHERE source_id=? AND target_id=? AND relation_type='prerequisite'").get(f.node('FUNC.LOG').id, f.node('FUNC.EXP').id)!;
    await assert.rejects(f.other.reviewEdge(String(edge.id), String(edge.updated_at)), /维护者/);
    await assert.rejects(f.store.reviewEdge(String(edge.id), String(edge.updated_at)), /两端节点/);
    await f.approve('HS'); await f.approve('FUNC'); await f.approve('FUNC.LOG'); await f.approve('FUNC.EXP');
    await f.store.reviewEdge(String(edge.id), String(edge.updated_at));
    assert.ok((await f.store.list()).edges.some(e => e.id === edge.id));
    await assert.rejects(f.store.reviewEdge(String(edge.id), String(edge.updated_at)), /变化/);
  } finally { f.db.close(); }
});
