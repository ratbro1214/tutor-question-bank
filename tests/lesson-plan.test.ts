import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { LessonStore } from '../lib/lesson-plan-store';
import { lessonContentSchema, lessonWriteSchema } from '../lib/lesson-plan';
import { moveLessonQuestion, selectLessonQuestion } from '../lib/lesson-question-selection';
import { libraryBase, libraryWhere, parseLibraryFilters } from '../lib/math-library-query';
import { emptyExplanation } from '../lib/question-explanation';
import { createLessonDraft } from '../lib/lesson-generation-workflow';
import { acceptLessonProposal } from '../lib/lesson-ai-draft';

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  let fail = false, race: (() => void) | null = null;
  const binding = { prepare(sql: string) {
    let values: (string | number)[] = [];
    const statement = { bind(...v: (string | number)[]) { values = v; return statement; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } };
    return statement;
  }, async batch(statements: { run(): unknown }[]) {
    if (race) { const callback = race; race = null; callback(); }
    db.exec('BEGIN'); try { const results = statements.map((s, i) => { const r = s.run(); if (fail && i === 1) throw Error('injected database failure'); return r; }); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; }
  } } as unknown as D1Database;
  const c = randomUUID(), r = randomUUID(), c2 = randomUUID(), r2 = randomUUID();
  db.exec(`INSERT INTO question_library_scopes(id,code,name,scope_type,kind) VALUES ('s','s','TEST ONLY','legacy_private','private'),('other','other','TEST ONLY','legacy_private','private')`);
  for (const [id, rev, scope] of [[c, r, 's'], [c2, r2, 'other']]) {
    db.prepare(`INSERT INTO canonical_questions(id,scope_id,subject,status) VALUES (?,?,'math','active')`).run(id, scope);
    db.prepare(`INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,change_reason) VALUES (?,?,1,'math','TEST ONLY: f(x)=x^2','x','h','v1','v1','{}','test')`).run(rev, id);
    db.prepare('UPDATE canonical_questions SET current_revision_id=? WHERE id=?').run(rev, id);
  }
  return { db, store: new LessonStore(binding, 'teacher', ['s']), stranger: new LessonStore(binding, 'stranger', ['other']), c, r, c2, r2,
    fail(value: boolean) { fail = value; }, race(callback: () => void) { race = callback; } };
}
const write = (content: unknown, revision = 0) => lessonWriteSchema.parse({ operationId: randomUUID(), expectedRevision: revision, content });

test('export reads the requested saved version, preserves original records and rejects inaccessible or incomplete references', async () => {
  const f = fixture(); try {
    f.db.prepare("UPDATE canonical_question_revisions SET identity_status='ready' WHERE id=?").run(f.r);
    const source = randomUUID(), occurrence = randomUUID();
    f.db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title) VALUES(?,'s','other','TEST ONLY SOURCE')").run(source);
    f.db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,image_key,mapping_status) VALUES(?,?,?,?,'other','test:export','original.png','confirmed')").run(occurrence, f.c, f.r, source);
    const plan = await f.store.write(randomUUID(), write({ topic: '已保存专题', studentSummary: '学生已保存提要', questions: [{ canonicalId: f.c, revisionId: f.r }] }), true);
    await f.store.write(plan.id, write({ ...plan.content, topic: '新专题', studentSummary: '新提要' }, 1));
    const exported = await f.store.exportSnapshot(plan.id, plan.current_version_id);
    assert.equal(exported.content.topic, '已保存专题'); assert.equal(exported.content.studentSummary, '学生已保存提要'); assert.equal(exported.revision, 1);
    assert.equal(exported.questions[0].text, plan.resources[0].text); assert.equal(exported.questions[0].images[0].url, `/api/math-library/${f.c}/image/${occurrence}`);
    assert.equal(exported.questions[0].sources[0].title, 'TEST ONLY SOURCE');
    await assert.rejects(f.stranger.exportSnapshot(plan.id, plan.current_version_id), /无权/);
    await assert.rejects(f.store.exportSnapshot(plan.id, randomUUID()), /版本不存在/);
    f.db.prepare("UPDATE canonical_question_revisions SET identity_status='incomplete' WHERE id=?").run(f.r);
    f.db.prepare("UPDATE question_occurrences SET image_key=NULL WHERE id=?").run(occurrence);
    await assert.rejects(f.store.exportSnapshot(plan.id, plan.current_version_id), /缺少完整题干或原图/);
    assert.equal((await f.store.get(plan.id)).revision, 2);
  } finally { f.db.close(); }
});

test('AI context uses pinned historical revision and only matching reviewed explanations', async () => {
  const f = fixture(); try {
    const text = 'TEST ONLY: f(x)=x^2', source = randomUUID(), occurrence = randomUUID();
    f.db.prepare('UPDATE canonical_question_revisions SET payload=?,education_stage=? WHERE id=?').run(JSON.stringify({ classification: { knowledge_points: [{ code: 'TEST', name: '测试知识点' }], difficulty: '基础', question_type: '直接计算' } }), '高中', f.r);
    f.db.exec("INSERT INTO students(id,name) VALUES(1,'TEST ONLY')");
    f.db.prepare("INSERT INTO questions(id,student_id,image_key,original_filename,image_mime_type,extracted_question,chapter_code,chapter_name,question_type,difficulty,ai_classification,teacher_confirmed_classification) VALUES(1,1,'test.png','test.png','image/png',?,'TEST','TEST','直接计算','基础','{}','{}')").run(text);
    f.db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title) VALUES(?,'s','student_archive','TEST ONLY SOURCE')").run(source);
    f.db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,mapping_status) VALUES(?,?,?,?,'student_archive','test:1','confirmed')").run(occurrence, f.c, f.r, source);
    f.db.prepare("INSERT INTO question_module_links(id,module_type,module_record_id,canonical_question_id,occurrence_id,legacy_student_question_id,observed_source_hash) VALUES(?,'student_question','1',?,?,1,'TEST')").run(randomUUID(), f.c, occurrence);
    const explanation = { ...emptyExplanation, answer: 'TEST ONLY', approach: '测试思路', steps: [{ title: '测试', content: '测试内容' }] };
    f.db.prepare("INSERT INTO question_explanations(question_id,content,source_text,origin,reviewed,updated_at) VALUES(1,?,?,'manual',1,'2026-10-09')").run(JSON.stringify(explanation), text);
    const newest = randomUUID();
    f.db.prepare("INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,change_reason) VALUES(?,?,2,'math','TEST ONLY NEW TEXT','new','new','v1','v1','{}','test')").run(newest, f.c);
    f.db.prepare('UPDATE canonical_questions SET current_revision_id=? WHERE id=?').run(newest, f.c);
    const content = lessonContentSchema.parse({ topic: 'TEST ONLY', questions: [{ canonicalId: f.c, revisionId: f.r }] });
    let q = (await f.store.aiQuestions(content))[0];
    assert.equal(q.text, text); assert.equal(q.revisionId, f.r); assert.equal(q.knowledge[0].code, 'TEST'); assert.equal(q.sources[0].title, 'TEST ONLY SOURCE');
    assert.equal(q.answerStatus, 'reviewed'); assert.deepEqual(q.reviewedExplanation, explanation);
    f.db.exec('UPDATE question_explanations SET reviewed=0'); q = (await f.store.aiQuestions(content))[0];
    assert.equal(q.answerStatus, 'unverified'); assert.equal(q.reviewedExplanation, null);
    f.db.exec("UPDATE question_explanations SET source_text='STALE',reviewed=1"); q = (await f.store.aiQuestions(content))[0];
    assert.equal(q.answerStatus, 'missing'); assert.equal(q.reviewedExplanation, null);
    await assert.rejects(f.stranger.aiQuestions(content), /题目引用/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get()?.n, 0);
  } finally { f.db.close(); }
});

test('draft generation with real database references never writes; acceptance persists structure and original backup', async () => {
  const f = fixture(); try {
    const plan = await f.store.write(randomUUID(), write({ topic: 'TEST ONLY', questions: [{ canonicalId: f.c, revisionId: f.r }] }), true);
    const request = { expectedRevision: plan.revision, content: plan.content };
    const provider = { apiKey: 'fixture', baseUrl: 'https://fixture.invalid', apiStyle: 'chat_completions', model: 'fixture', strictJsonSchema: true };
    const stage = { kind: '导入', title: '测试', minutes: 5, purpose: '测试', activities: '测试', questionIds: [f.c], explanation: '待核验', followUps: ['测试'] };
    const result = { objectives: ['测试'], prerequisites: ['测试'], focus: ['测试'], difficulties: ['测试'], stages: [stage, { ...stage, kind: '总结', minutes: 40, questionIds: [] }], examples: [{ canonicalId: f.c, revisionId: f.r, arrangement: '测试', keyIdeas: '待核验', followUps: ['测试'], mistakes: ['测试'], answerStatus: 'reviewed' }], classroomQuestions: ['测试'], commonMistakes: ['测试'], practiceSuggestions: ['测试'], summary: '测试' };
    const reply = () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
    const generated = await createLessonDraft(f.store, plan.id, request, provider, undefined, async (_url, init) => {
      const prompt = JSON.parse(JSON.parse(String(init!.body)).messages[1].content);
      assert.equal(prompt.questions[0].text, plan.resources[0].text); assert.equal(prompt.questions[0].canonicalId, f.c);
      return reply();
    });
    assert.equal((await f.store.get(plan.id)).content.structure, null); assert.equal((await f.store.get(plan.id)).revision, 1);
    const accepted = acceptLessonProposal(plan.content, JSON.stringify(plan.content), generated);
    const saved = await f.store.write(plan.id, write(accepted, 1));
    assert.deepEqual((await f.store.get(plan.id)).content.structure, saved.content.structure);
    assert.equal(saved.content.structure?.examples[0].answerStatus, 'missing');
    assert.deepEqual(JSON.parse(saved.content.aiBackups[0].original).questions, plan.content.questions);
    await assert.rejects(createLessonDraft(f.store, plan.id, request, provider, undefined, async () => reply()), /已更新/);
    await assert.rejects(createLessonDraft(f.stranger, plan.id, { ...request, expectedRevision: 2 }, provider), /无权/);
    const before = JSON.stringify(saved.content);
    await assert.rejects(createLessonDraft(f.store, plan.id, { ...request, expectedRevision: 2, content: saved.content }, provider, undefined, async () => new Response('', { status: 503 })), /HTTP 503/);
    assert.equal(JSON.stringify((await f.store.get(plan.id)).content), before);
    await assert.rejects(createLessonDraft(f.store, plan.id, { ...request, expectedRevision: 2, content: saved.content }, provider, undefined, async () => {
      await f.store.write(plan.id, write({ ...saved.content, goals: '教师新修改' }, 2)); return reply();
    }), /生成期间/);
    assert.equal((await f.store.get(plan.id)).content.goals, '教师新修改');
  } finally { f.db.close(); }
});

test('shared Canonical SQL review filter searches actual accessible records only', () => {
  const f = fixture(); try {
    f.db.prepare("UPDATE canonical_question_revisions SET identity_status='ready',education_stage='高中' WHERE id IN (?,?)").run(f.r, f.r2);
    const where = libraryWhere(parseLibraryFilters(new URLSearchParams('review=ready&stage=高中&q=TEST')));
    const rows = f.db.prepare(libraryBase(['s']) + 'SELECT c.id FROM library c' + where.sql).all('s', ...where.values);
    assert.deepEqual(rows.map(row => row.id), [f.c]);
    const missing = libraryWhere(parseLibraryFilters(new URLSearchParams('review=needs_review')));
    assert.equal(f.db.prepare(libraryBase(['s']) + 'SELECT c.id FROM library c' + missing.sql).all('s', ...missing.values).length, 0);
  } finally { f.db.close(); }
});

test('source filtering returns one identity across repeated sources and excludes inaccessible scope', () => {
  const f = fixture(); try {
    for (const [index,canonical,revision,scope] of [[0,f.c,f.r,'s'],[1,f.c,f.r,'s'],[2,f.c2,f.r2,'other']] as const) {
      const source = randomUUID(), occurrence = randomUUID();
      f.db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title) VALUES (?,?,'student_archive','TEST ONLY')").run(source,scope);
      f.db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,mapping_status) VALUES (?,?,?,?,'student_archive',?,'confirmed')").run(occurrence,canonical,revision,source,'test-'+index);
    }
    const where=libraryWhere(parseLibraryFilters(new URLSearchParams('source=student_archive')));
    assert.deepEqual(f.db.prepare(libraryBase(['s'])+'SELECT c.id FROM library c'+where.sql).all('s',...where.values).map(row=>row.id),[f.c]);
    const papers=libraryWhere(parseLibraryFilters(new URLSearchParams('source=math_paper')));
    assert.equal(f.db.prepare(libraryBase(['s'])+'SELECT c.id FROM library c'+papers.sql).all('s',...papers.values).length,0);
    assert.throws(()=>parseLibraryFilters(new URLSearchParams('source=invalid')));
  } finally { f.db.close(); }
});

test('manual selection, purpose, replacement and ordering survive save and reopen', async () => {
  const f = fixture(); try {
    f.db.prepare('UPDATE canonical_questions SET scope_id=? WHERE id=?').run('s', f.c2);
    const first = await f.store.write(randomUUID(), write({ topic: 'TEST ONLY 手动选题', questions: [{ canonicalId: f.c, revisionId: f.r, purpose: '导入', notes: '保留备注' }] }), true);
    const replaced = selectLessonQuestion(first.content.questions, { canonicalId: f.c2, revisionId: f.r2, purpose: '讲解', notes: '' }, f.c);
    const added = selectLessonQuestion(replaced, { canonicalId: f.c, revisionId: f.r, purpose: '检测', notes: '' });
    const ordered = moveLessonQuestion(added, 1, -1);
    await f.store.write(first.id, write({ ...first.content, questions: ordered }, first.revision));
    const reopened = await f.store.get(first.id);
    assert.deepEqual(reopened.content.questions, ordered);
    assert.deepEqual(f.db.prepare('SELECT canonical_id,purpose FROM lesson_plan_questions WHERE version_id=? ORDER BY position').all(reopened.current_version_id).map(row => [row.canonical_id, row.purpose]), [[f.c, '检测'], [f.c2, '导入']]);
    assert.equal(reopened.resources[1].revisionId, f.r2);
    assert.equal((await f.store.get(first.id, first.current_version_id)).content.questions[0].canonicalId, f.c);
  } finally { f.db.close(); }
});

test('manual lesson with Canonical revision persists, reopens and retains history', async () => {
  const f = fixture(); try {
    const id = randomUUID(), input = write({ topic: '导数与函数单调性', questions: [{ canonicalId: f.c, revisionId: f.r }] });
    const first = await f.store.write(id, input, true); assert.equal(first.content.duration, 45); assert.equal(first.resources[0].revisionId, f.r);
    const saved = await f.store.write(id, write({ ...first.content, flow: '导入 5 分钟；讲解 25 分钟；练习 10 分钟；总结 5 分钟' }, 1));
    assert.equal(saved.revision, 2); assert.equal((await f.store.get(id)).content.flow, saved.content.flow);
    assert.equal((await f.store.get(id, input.operationId)).content.flow, '');
    f.db.prepare('UPDATE canonical_questions SET current_revision_id=NULL WHERE id=?').run(f.c);
    assert.equal((await f.store.get(id)).resources[0].revisionId, f.r);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_questions').get()?.n, 2);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.db.close(); }
});
test('duplicate submit is idempotent; stale or reused operation cannot overwrite', async () => {
  const f = fixture(); try {
    const id = randomUUID(), input = write({ topic: '专题' }); await f.store.write(id, input, true); await f.store.write(id, input, true);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_versions').get()?.n, 1);
    await assert.rejects(f.store.write(id, { ...input, content: lessonContentSchema.parse({ topic: '不同内容' }) }, true), /重复提交/);
    const next = write({ topic: '更新' }, 1); await f.store.write(id, next); await f.store.write(id, next);
    await assert.rejects(f.store.write(id, write({ topic: '旧窗口' }, 1)), /其他窗口/);
    assert.equal((await f.store.get(id)).content.topic, '更新');
  } finally { f.db.close(); }
});
test('owner access, invalid identity, cross-scope and mismatched revisions are blocked', async () => {
  const f = fixture(); try {
    const id = randomUUID(); await f.store.write(id, write({ topic: '私人教案' }), true);
    assert.equal((await f.stranger.list()).length, 0); await assert.rejects(f.stranger.get(id), /无权/);
    await assert.rejects(f.stranger.write(id, write({ topic: '越权修改' }, 1)), /无权/);
    for (const [canonicalId, revisionId] of [[randomUUID(), f.r], [f.c, f.r2], [f.c2, f.r2]])
      await assert.rejects(f.store.write(randomUUID(), write({ topic: '非法', questions: [{ canonicalId, revisionId }] }), true), /题目引用/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get()?.n, 1);
    assert.throws(() => new LessonStore({} as D1Database, '', []), /登录/);
  } finally { f.db.close(); }
});
test('copy, archive, restore and stage/topic filtering retain source versions', async () => {
  const f = fixture(); try {
    const id = randomUUID(), source = await f.store.write(id, write({ topic: '导数' }), true);
    const copy = await f.store.write(randomUUID(), write({ ...source.content, topic: '导数（副本）' }), true);
    await f.store.write(id, { ...write(source.content, 1), status: 'archived' });
    assert.equal((await f.store.list('高中', '导数')).length, 1);
    assert.equal((await f.store.list('', '', 'archived')).length, 1);
    await f.store.write(id, write(source.content, 2)); assert.equal((await f.store.list()).length, 2);
    assert.equal((await f.store.get(copy.id)).revision, 1); assert.equal((await f.store.get(id)).versions.length, 3);
    assert.equal((await f.store.list('', '%')).length, 0);
  } finally { f.db.close(); }
});
test('transaction failures and races leave no partial version or question records', async () => {
  const f = fixture(); try {
    const id = randomUUID(), first = await f.store.write(id, write({ topic: '原始' }), true);
    f.fail(true); await assert.rejects(f.store.write(id, write({ ...first.content, topic: '失败', questions: [{ canonicalId: f.c, revisionId: f.r }] }, 1)), /injected/);
    assert.equal((await f.store.get(id)).revision, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_questions').get()?.n, 0);
    f.fail(false); f.race(() => f.db.prepare('UPDATE lesson_plans SET revision=2,current_version_id=? WHERE id=?').run(randomUUID(), id));
    await assert.rejects(f.store.write(id, write({ topic: '输掉并发' }, 1)), /保存冲突/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_versions').get()?.n, 1);
  } finally { f.db.close(); }
});
test('input limits and same-identity references are validated', () => {
  assert.throws(() => lessonContentSchema.parse({ topic: ' ', duration: 0 }));
  assert.throws(() => lessonContentSchema.parse({ topic: '主题', duration: 481 }));
  const canonicalId = randomUUID(), revisionId = randomUUID();
  assert.throws(() => lessonContentSchema.parse({ topic: '主题', questions: [{ canonicalId, revisionId }, { canonicalId, revisionId }] }));
});
test('simultaneous retries create one plan and one version', async () => {
  const f = fixture(); try {
    const id = randomUUID(), input = write({ topic: '同时提交', questions: [{ canonicalId: f.c, revisionId: f.r }] });
    const result = await Promise.all([f.store.write(id, input, true), f.store.write(id, input, true)]);
    assert.equal(result[0].id, result[1].id); assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_versions').get()?.n, 1);
    const update = write({ ...result[0].content, goals: '并发重试' }, 1);
    await Promise.all([f.store.write(id, update), f.store.write(id, update)]);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_versions').get()?.n, 2);
    assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_questions').get()?.n, 2);
  } finally { f.db.close(); }
});
