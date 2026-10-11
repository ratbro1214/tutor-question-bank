// Runs the actual lesson services in a fresh, explicitly marked test database.
// Never opens the application's D1/R2 state. Live mode only sends synthetic data.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { LessonStore } from '../lib/lesson-plan-store';
import { lessonContentSchema, lessonWriteSchema, type LessonContent } from '../lib/lesson-plan';
import { libraryBase, libraryWhere, parseLibraryFilters } from '../lib/math-library-query';
import { createLessonDraft } from '../lib/lesson-generation-workflow';
import { acceptLessonProposal } from '../lib/lesson-ai-draft';
import { moveLessonStage } from '../lib/lesson-stage-edit';
import { selectLessonQuestion } from '../lib/lesson-question-selection';
import { configuredExplanationProvider } from '../lib/ai-provider';
import { createLessonDocx } from '../lib/lesson-docx';
import { loadLessonExportImages } from '../lib/lesson-export-client';
import type { LessonStructure } from '../lib/lesson-structure';

const live = process.argv.includes('--live');
const root = resolve(import.meta.dirname, '../..');
const runDir = resolve(root, 'work/5A-5', `${live ? 'live' : 'mock'}-${Date.now()}`);
mkdirSync(runDir, { recursive: true });
const db = new DatabaseSync(resolve(runDir, 'TEST-ONLY.sqlite'));
let failBatch = false;
const results: { name: string; status: string; milliseconds: number; error?: string }[] = [];
const calls: { mode: string; status?: number; milliseconds: number; outcome?: string }[] = [];
const report = { mode: live ? 'live-model-service-integration' : 'mock-model-service-integration',
  startedAt: new Date().toISOString(), runDir, dataSource: 'SELF AUTHORED TEST ONLY; fresh isolated SQLite; zero student rows',
  results, calls, model: '', modelCalls: 0, mockCalls: 0, completed: false };
async function check(name: string, action: () => unknown | Promise<unknown>) {
  const start = performance.now();
  try { const value = await action(); results.push({ name, status: 'PASS', milliseconds: Math.round(performance.now() - start) }); return value; }
  catch (error) { results.push({ name, status: 'FAIL', milliseconds: Math.round(performance.now() - start), error: (error as Error).message }); throw error; }
}
const write = (content: unknown, revision = 0) => lessonWriteSchema.parse({ operationId: randomUUID(), expectedRevision: revision, content });
const binding = { prepare(sql: string) {
  let values: (string | number)[] = [];
  const statement = { bind(...v: (string | number)[]) { values = v; return statement; },
    async first() { return db.prepare(sql).get(...values) || null; },
    async all() { return { results: db.prepare(sql).all(...values) }; },
    run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } };
  return statement;
}, async batch(statements: { run(): unknown }[]) {
  db.exec('BEGIN');
  try { const value = statements.map((s, i) => { const result = s.run(); if (failBatch && i === 1) throw Error('TEST ONLY database failure'); return result; }); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
} } as unknown as D1Database;
const store = new LessonStore(binding, 'TEST-ONLY-TEACHER', ['test-scope']);
const fixtureQuestions = [
  '【5A-5 自编测试题 1】求函数 \\(f(x)=x^{3}-3x\\) 的导数，并判断其单调区间。定义域为实数。',
  '【5A-5 自编测试题 2】已知 \\(f(x)=\\ln x-x\\)，定义域为 \\(x>0\\)。利用导数判断函数单调性。',
  '【5A-5 自编测试题 3】已知 \\(f(x)=x+\\frac{1}{x}\\)，定义域为 \\(x>0\\)。求导数并判断单调区间。',
  '【5A-5 自编测试题 4 替换题】函数 \\(f(x)=x^{2}-4x\\) 的定义域为实数。利用导数判断函数单调性。',
];
const refs = fixtureQuestions.map(() => ({ canonicalId: randomUUID(), revisionId: randomUUID(), purpose: '讲解' as const, notes: '明确标记的自编测试题；答案待教师核验' }));
function sample(content: LessonContent): LessonStructure {
  return { objectives: [content.goals], prerequisites: ['基本求导公式、定义域及不等式解法'], focus: ['导数符号与单调区间'], difficulties: ['定义域与临界点的处理'],
    stages: [
      { kind: '导入', title: 'TEST ONLY 回顾函数变化', minutes: 5, purpose: '联系变化率', activities: '教师提出定义域问题', questionIds: [], explanation: '先核对定义域', followUps: ['为什么要先看定义域？'] },
      { kind: '讲解', title: 'TEST ONLY 求导与符号表', minutes: 15, purpose: '建立判断流程', activities: '逐题核对条件', questionIds: [content.questions[0].canonicalId], explanation: '先求导，再分区间检查符号；答案待教师核验', followUps: ['临界点是否都在定义域内？'] },
      { kind: '练习', title: 'TEST ONLY 独立练习', minutes: 15, purpose: '迁移方法', activities: '写出完整推理', questionIds: content.questions.slice(1).map(q => q.canonicalId), explanation: '保留定义域、求导和符号表', followUps: ['分式分母对定义域有什么限制？'] },
      { kind: '检测', title: 'TEST ONLY 检查边界', minutes: 5, purpose: '核对必要条件', activities: '口头解释区间', questionIds: [], explanation: '不能忽略定义域', followUps: ['导数为零是否一定改变单调性？'] },
      { kind: '总结', title: 'TEST ONLY 总结流程', minutes: 5, purpose: '形成方法', activities: '复述判断流程', questionIds: [], explanation: '定义域、导数、符号、区间', followUps: ['本节最易遗漏哪一步？'] },
    ], examples: content.questions.map(q => ({ canonicalId: q.canonicalId, revisionId: q.revisionId, arrangement: '核对真实测试题条件后讲解', keyIdeas: '检查定义域并研究导数符号；待教师核验', followUps: ['区间端点怎么确定？'], mistakes: ['遗漏定义域'], answerStatus: 'missing' })),
    classroomQuestions: ['导数符号与单调性有什么关系？'], commonMistakes: ['遗漏定义域'], practiceSuggestions: ['完成已选真实测试题'], summary: '先看定义域，再求导并分析符号。' };
}
function readProvider() {
  const settings: Record<string, string> = {};
  // No settings or credentials are included in stdout, reports or fixtures.
  const varsPath = resolve(root, 'tutor-question-bank/.dev.vars');
  if (!existsSync(varsPath)) return configuredExplanationProvider(process.env);
  for (const line of readFileSync(varsPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) settings[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return configuredExplanationProvider(settings);
}
const provider = live ? readProvider() : { apiKey: 'TEST ONLY', baseUrl: 'https://fixture.invalid/v1', apiStyle: 'chat_completions', model: 'TEST ONLY mock', strictJsonSchema: true };
report.model = provider.model;
const modelFetch: typeof fetch = async (url, init) => {
  const start = performance.now();
  if (live) {
    report.modelCalls++;
    try { const response = await fetch(url, init); calls.push({ mode: 'live', status: response.status, milliseconds: Math.round(performance.now() - start) }); return response; }
    catch { calls.push({ mode: 'live', outcome: 'transport failure or timeout', milliseconds: Math.round(performance.now() - start) }); throw Error('model transport failed'); }
  }
  report.mockCalls++;
  const request = JSON.parse(String(init!.body));
  const prompt = JSON.parse(request.messages[1].content);
  const output = prompt.edit ? { ...prompt.edit.originalStage, explanation: 'TEST ONLY 局部重新生成：检查定义域，再求导及分析符号。' } : sample(activeContent);
  calls.push({ mode: 'mock', status: 200, milliseconds: Math.round(performance.now() - start) });
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
};
let activeContent: LessonContent;
try {
  if (!existsSync(resolve(root, 'work/5A-5/TEST-ONLY-original.png'))) throw Error('Run scripts/make-lesson-5a5-image.py before acceptance; no model request was sent.');
  db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(resolve(root, 'tutor-question-bank/drizzle')).filter(n => n.endsWith('.sql')).sort()) db.exec(readFileSync(resolve(root, 'tutor-question-bank/drizzle', file), 'utf8'));
  db.exec("INSERT INTO question_library_scopes(id,code,name,scope_type,kind) VALUES ('test-scope','TEST-5A5','TEST ONLY','legacy_private','private')");
  const source = randomUUID();
  db.prepare("INSERT INTO source_documents(id,scope_id,source_type,title) VALUES(?,'test-scope','other','5A-5 自编测试题集 非真实考试来源')").run(source);
  for (let i = 0; i < refs.length; i++) {
    const q = refs[i];
    db.prepare("INSERT INTO canonical_questions(id,scope_id,subject,status) VALUES(?,'test-scope','math','active')").run(q.canonicalId);
    const classification = { education_stage: '高中', chapter: { code: 'TEST-DERIVATIVE', name: '导数' }, knowledge_points: [{ code: 'TEST-MONOTONICITY', name: '导数与函数单调性' }], difficulty: '基础', question_type: '解答题', needs_review: false };
    db.prepare("INSERT INTO canonical_question_revisions(id,canonical_question_id,revision,subject,original_text,normalized_text,normalized_hash,content_schema_version,normalization_version,payload,change_reason,education_stage,identity_status) VALUES(?,?,1,'math',?,?,'TEST','v1','v1',?,'TEST ONLY','高中','ready')").run(q.revisionId, q.canonicalId, fixtureQuestions[i], fixtureQuestions[i], JSON.stringify({ classification }));
    db.prepare('UPDATE canonical_questions SET current_revision_id=? WHERE id=?').run(q.revisionId, q.canonicalId);
    if (i === 0) db.prepare("INSERT INTO question_occurrences(id,canonical_question_id,content_revision_id,source_document_id,source_type,occurrence_key,image_key,mapping_status) VALUES(?,?,?,?,'other','TEST-5A5-IMAGE','TEST-ONLY.png','confirmed')").run(randomUUID(), q.canonicalId, q.revisionId, source);
  }
  const before = JSON.stringify(db.prepare('SELECT id,current_revision_id FROM canonical_questions ORDER BY id').all());
  const id = randomUUID();
  let plan = await check('01 create 45-minute task', () => store.write(id, write({ topic: '【5A-5 测试】高中导数与函数单调性', duration: 45 }), true)) as Awaited<ReturnType<LessonStore['get']>>;
  activeContent = lessonContentSchema.parse({ ...plan.content, goals: '理解导数符号与单调性的关系；能先确定定义域，再求导并用符号表写出单调区间。', studentSummary: '判断流程：定义域 → 求导 → 分析导数符号 → 写出单调区间。公式：\\(f(x)=x+\\frac{1}{x}\\)，\\(f\'(x)=1-\\frac{1}{x^{2}}\\)。' });
  plan = await check('02 save teaching goals', () => store.write(id, write(activeContent, plan.revision))) as typeof plan;
  await check('03 retrieve derivative questions with existing Canonical SQL', () => {
    const where = libraryWhere(parseLibraryFilters(new URLSearchParams('stage=高中&knowledge=TEST-MONOTONICITY&q=导数')));
    assert.equal(db.prepare(libraryBase(['test-scope']) + 'SELECT c.id FROM library c' + where.sql).all('test-scope', ...where.values).length, 4);
  });
  activeContent = lessonContentSchema.parse({ ...plan.content, questions: refs.slice(0, 3) });
  plan = await check('04 select and save three marked test questions', () => store.write(id, write(activeContent, plan.revision))) as typeof plan;
  await check('05 generate and accept structured lesson', async () => {
    const generated = await createLessonDraft(store, id, { expectedRevision: plan.revision, content: activeContent }, provider, undefined, modelFetch);
    activeContent = acceptLessonProposal(activeContent, JSON.stringify(activeContent), generated);
    assert.equal(activeContent.structure!.stages.reduce((n, s) => n + s.minutes, 0), 45);
  });
  await check('06 change teaching order', () => { activeContent = lessonContentSchema.parse({ ...activeContent, structure: { ...activeContent.structure!, stages: moveLessonStage(activeContent.structure!.stages, 3, -1) } }); });
  await check('07 replace one example and reassign its stage manually', () => {
    const removed = refs[1].canonicalId;
    const questions = selectLessonQuestion(activeContent.questions, refs[3], removed);
    // Same removal behavior as the editor, then teacher explicitly checks the new stage reference.
    const structure = { ...activeContent.structure!, examples: activeContent.structure!.examples.filter(e => e.canonicalId !== removed),
      stages: activeContent.structure!.stages.map(s => ({ ...s, questionIds: s.questionIds.map(q => q === removed ? refs[3].canonicalId : q) })) };
    activeContent = lessonContentSchema.parse({ ...activeContent, questions, structure });
    assert.equal(activeContent.questions.length, 3);
  });
  await check('08 regenerate only one explanation', async () => {
    const stageIndex = activeContent.structure!.stages.findIndex(s => s.questionIds.includes(refs[3].canonicalId));
    const edit = { stageIndex, action: '重新生成单个环节' as const, instruction: '针对当前引用题目重写讲解。保留环节类型及分钟数；没有已审核解析时明确待教师核验。' };
    const original = structuredClone(activeContent);
    const generated = await createLessonDraft(store, id, { expectedRevision: plan.revision, content: activeContent, edit }, provider, undefined, modelFetch);
    activeContent = acceptLessonProposal(activeContent, JSON.stringify(activeContent), generated, edit);
    activeContent.structure!.stages.forEach((s, i) => { if (i !== stageIndex) assert.deepEqual(s, original.structure!.stages[i]); });
  });
  await check('09 save and reopen exact content', async () => { plan = await store.write(id, write(activeContent, plan.revision)); assert.deepEqual((await store.get(id)).content, activeContent); });
  await check('10 export teacher and student Word from the same saved version', async () => {
    const snapshot = await store.exportSnapshot(id, plan.current_version_id);
    // Original test chart is produced locally; no real exam or student image is copied.
    const png = readFileSync(resolve(root, 'work/5A-5/TEST-ONLY-original.png'));
    const images = snapshot.questions.flatMap(q => q.images.map(img => ({ id: img.id, data: new Uint8Array(png), width: 640, height: 340, type: 'png' as const })));
    const archives = ['teacher', 'student'].map(a => {
      const bytes = createLessonDocx(snapshot, a as 'teacher' | 'student', images);
      writeFileSync(resolve(runDir, `${a}.docx`), bytes);
      const files = unzipSync(bytes); const xml = strFromU8(files['word/document.xml']);
      for (const text of ['自编测试题 1', '自编测试题 3', '自编测试题 4']) assert.ok(xml.includes(text));
      assert.match(xml, /<m:f>/); assert.match(xml, /<m:sSup>/); assert.match(xml, /<w:drawing>/);
      assert.deepEqual(files['word/media/image1.png'], new Uint8Array(png));
      return files;
    });
    assert.equal(strFromU8(archives[0]['docProps/custom.xml']), strFromU8(archives[1]['docProps/custom.xml']));
    assert.doesNotMatch(strFromU8(archives[1]['word/document.xml']), /参考答案|课堂追问|明确标记的自编测试题；答案待教师核验/);
    writeFileSync(resolve(runDir, 'saved-snapshot.json'), JSON.stringify(snapshot, null, 2));
    await assert.rejects(loadLessonExportImages(snapshot, new AbortController().signal, undefined, async () => new Response('', { status: 404 })), /导出已停止/);
    assert.throws(() => createLessonDocx(snapshot, 'teacher', []), /原图未能读取/);
  });
  await check('empty results do not invent questions', () => {
    const where = libraryWhere(parseLibraryFilters(new URLSearchParams('q=不存在_5A5')));
    assert.equal(db.prepare(libraryBase(['test-scope']) + 'SELECT c.id FROM library c' + where.sql).all('test-scope', ...where.values).length, 0);
  });
  await check('AI HTTP 503 leaves saved content unchanged (injected)', async () => {
    await assert.rejects(createLessonDraft(store, id, { expectedRevision: plan.revision, content: activeContent }, { ...provider, apiKey: 'TEST ONLY' }, undefined, async () => new Response('', { status: 503 })), /HTTP 503/);
    assert.deepEqual((await store.get(id)).content, activeContent);
  });
  await check('invalid identity or revision is rejected', async () => { await assert.rejects(store.write(id, write({ ...activeContent, structure: null, questions: [{ ...refs[0], revisionId: randomUUID() }] }, plan.revision)), /题目引用/); });
  await check('simultaneous duplicate submission produces one version', async () => {
    const input = write(activeContent, plan.revision); const count = plan.versions.length;
    const values = await Promise.all([store.write(id, input), store.write(id, input)]); plan = values[0];
    assert.equal(plan.versions.length, count + 1);
  });
  await check('save conflict does not overwrite', async () => { await assert.rejects(store.write(id, write({ ...activeContent, goals: 'STALE' }, plan.revision - 1)), /其他窗口/); assert.deepEqual((await store.get(id)).content, activeContent); });
  await check('database failure rolls back task, version and references (injected)', async () => {
    const before = JSON.stringify((await store.get(id)));
    failBatch = true;
    try { await assert.rejects(store.write(id, write({ ...activeContent, goals: 'FAILED' }, plan.revision)), /database failure/); } finally { failBatch = false; }
    assert.equal(JSON.stringify(await store.get(id)), before);
  });
  await check('private owner protection and no dependency on students', async () => {
    await assert.rejects(new LessonStore(binding, 'OTHER TEACHER', ['test-scope']).get(id), /无权/);
    for (const table of ['students', 'questions', 'papers', 'paper_questions']) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n, 0);
    assert.equal(JSON.stringify(db.prepare('SELECT id,current_revision_id FROM canonical_questions ORDER BY id').all()), before);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  report.completed = true;
} catch (error) {
  if (!results.some(r => r.status === 'FAIL')) results.push({ name: 'fixture setup', status: 'FAIL', milliseconds: 0, error: (error as Error).message });
  process.exitCode = 1;
}
finally {
  db.close();
  writeFileSync(resolve(runDir, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ runDir, completed: report.completed, modelCalls: report.modelCalls, mockCalls: report.mockCalls, results }));
}
