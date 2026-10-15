import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { graphFixture } from './support/knowledge-graph-fixture';
import { gaokaoEditSchema, gaokaoClassification } from '../lib/gaokao-workbench';
import { gaokaoSaveStatements, type GaokaoSave } from '../lib/gaokao-save';
import { libraryBase, libraryWhere, parseLibraryFilters } from '../lib/math-library-query';
import type { PaperQuestionRow } from '../lib/paper-server';

function fixture() {
  const f = graphFixture(), paper = randomUUID(), source = randomUUID();
  f.db.prepare("INSERT INTO papers VALUES(?,'TEST GAOKAO','test.pdf','test/source','application/pdf',?,'now')").run(paper, paper);
  f.db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title,math_paper_id) VALUES(?,'s','math_paper','TEST GAOKAO',?)").run(source, paper);
  const input = gaokaoEditSchema.parse({ paperId: paper, number: 1, expectedRevision: 0, expectedContentRevision: null, text: 'TEST 求样本 6,8,4,5,12 的中位数。', chapter: 'HS-STATISTICS', knowledge: ['HS-STAT-CENTER'], difficulty: '基础', questionType: '统计图表分析', regions: [{ page: 1, x: .1, y: .2, width: .8, height: .1 }] });
  const context: GaokaoSave = { input, old: null, link: null, source: { id: source }, key: 'test/crop.jpg', imageKey: 'test/crop.jpg', classification: gaokaoClassification(input), owner: 'teacher', scopeId: 's', now: 'now', hash: 'testhash', paperYear: 2026, paperVolume: 1, textSource: 'test', pdfSource: 'test' };
  function current(canonical: string) {
    const row = f.db.prepare('SELECT * FROM paper_questions WHERE paper_id=?').get(paper) as unknown as PaperQuestionRow;
    const revision = f.db.prepare('SELECT r.id,r.revision FROM canonical_questions c JOIN canonical_question_revisions r ON r.id=c.current_revision_id WHERE c.id=?').get(canonical)!;
    return { ...context, old: row, link: { id: canonical, current_revision_id: String(revision.id), revision: Number(revision.revision) }, input: { ...input, expectedRevision: row.revision, expectedContentRevision: String(revision.id) } };
  }
  return { ...f, context, current, paper };
}
test('拒绝无效分类、方法标签、重复知识点与超出页边界的裁剪', () => {
  const f = fixture(); try {
    assert.throws(() => gaokaoClassification({ ...f.context.input, knowledge: ['INVALID'] }));
    assert.throws(() => gaokaoClassification({ ...f.context.input, knowledge: ['HS-STAT-CENTER', 'HS-STAT-CENTER'] }));
    assert.equal(gaokaoEditSchema.safeParse({ ...f.context.input, knowledge: [] }).success, false);
    assert.equal(gaokaoEditSchema.safeParse({ ...f.context.input, regions: [{ page: 1, x: .9, y: .2, width: .8, height: .1 }] }).success, false);
  } finally { f.db.close(); }
});
test('单题入库后按章节与知识点检索；重裁剪保存同一身份，保留旧版本', async () => {
  const f = fixture(); try {
    const first = gaokaoSaveStatements(f.binding, { ...f.context, referenceExplanation: '{"answer":"TEST REFERENCE"}' }); await f.binding.batch(first.statements);
    const filters = libraryWhere(parseLibraryFilters(new URLSearchParams({ chapter: 'HS-STATISTICS', knowledge: 'HS-STAT-CENTER', paper: f.paper })));
    assert.deepEqual(f.db.prepare(libraryBase(['s']) + 'SELECT c.id FROM library c' + filters.sql).all('s', ...filters.values).map(r => r.id), [first.canonical]);
    const before = f.current(first.canonical), second = gaokaoSaveStatements(f.binding, { ...before, key: 'test/new.jpg', imageKey: 'test/new.jpg' });
    await f.binding.batch(second.statements);
    assert.equal(second.canonical, first.canonical);
    assert.equal(f.db.prepare('SELECT count(*) n FROM paper_questions WHERE paper_id=?').get(f.paper)!.n, 1);
    assert.equal(f.db.prepare('SELECT explanation FROM paper_questions WHERE paper_id=?').get(f.paper)!.explanation, '{"answer":"TEST REFERENCE"}');
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_question_revisions WHERE canonical_question_id=?').get(first.canonical)!.n, 2);
    assert.equal(f.db.prepare('SELECT image_key FROM question_occurrences WHERE canonical_question_id=?').get(first.canonical)!.image_key, 'test/new.jpg');
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
    await assert.rejects(f.binding.batch(gaokaoSaveStatements(f.binding, before).statements));
    assert.equal(f.current(first.canonical).old.image_key, 'test/new.jpg');
  } finally { f.db.close(); }
});
test('其他页面修改题图和写入失败均回滚，不生成半套来源记录', async () => {
  const f = fixture(); try {
    const first = gaokaoSaveStatements(f.binding, f.context); await f.binding.batch(first.statements);
    const stale = f.current(first.canonical);
    f.race(() => f.db.prepare("UPDATE paper_questions SET revision=revision+1,image_key='other.jpg' WHERE id=?").run(stale.old.id));
    await assert.rejects(f.binding.batch(gaokaoSaveStatements(f.binding, stale).statements));
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_question_revisions WHERE canonical_question_id=?').get(first.canonical)!.n, 1);
    assert.equal(f.current(first.canonical).old.image_key, 'other.jpg');
    f.fail(true);
    await assert.rejects(f.binding.batch(gaokaoSaveStatements(f.binding, f.current(first.canonical)).statements), /injected write failure/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_question_revisions WHERE canonical_question_id=?').get(first.canonical)!.n, 1);
  } finally { f.db.close(); }
});
