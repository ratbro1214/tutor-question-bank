import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lessonContentSchema, lessonDraftSchema, lessonWriteSchema } from '../lib/lesson-plan';
import { checkLessonQuality, qualitySnapshot, type QualityIssue } from '../lib/lesson-quality';
import { finalizeAIQuality, qualityAIContext, qualityRepairTarget, requestQualityJSON } from '../lib/lesson-quality-ai';
import { inspectLessonQuality } from '../lib/lesson-quality-workflow';
import { acceptLessonQualityPatch } from '../lib/lesson-ai-draft';
import { fixture } from './support/lesson-fixture';
import type { LessonStructure } from '../lib/lesson-structure';

export function qualitySample(): LessonStructure {
  return { objectives: ['用导数研究函数单调性'], prerequisites: ['求导公式'], focus: ['导数符号'], difficulties: ['定义域'],
    stages: [
      { kind: '导入', title: 'TEST ONLY 回顾', minutes: 5, purpose: '回顾求导', activities: '口头提问', questionIds: [], explanation: '复习求导公式', followUps: ['先确定什么？'] },
      { kind: '讲解', title: 'TEST ONLY 函数单调性', minutes: 30, purpose: '讨论导数符号', activities: '制作符号表', questionIds: [], explanation: '先求导再判断符号', followUps: ['为何检查定义域？'] },
      { kind: '总结', title: 'TEST ONLY 总结', minutes: 10, purpose: '总结', activities: '复述流程', questionIds: [], explanation: '总结方法', followUps: ['关键步骤？'] },
    ], examples: [], classroomQuestions: ['导数符号和单调性有何关系？'], commonMistakes: ['遗漏定义域'], practiceSuggestions: ['独立作答'], summary: '先定义域再求导' };
}
const content = () => lessonContentSchema.parse({ topic: 'TEST ONLY 高中导数与函数单调性', structure: qualitySample() });
const config = { apiKey: 'TEST ONLY', baseUrl: 'https://test.invalid/v1', model: 'TEST ONLY', apiStyle: 'chat_completions', strictJsonSchema: false };
const answer = (raw: unknown) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] });
const write = (value: unknown, revision = 0) => lessonWriteSchema.parse({ operationId: randomUUID(), expectedRevision: revision, content: value });
const aiIssue = () => ({ category: 'goals', severity: 'warning', title: '目标可能未覆盖', description: '含参数讨论未见活动依据', location: { block: 'stage', index: 1 }, evidence: '先求导再判断符号', suggestedAction: '增加参数分类讨论', confidence: 'possible' });

test('45 minute complete draft has no rule issues; exact 50/38 minute differences', () => {
  assert.equal(checkLessonQuality(content()).issues.length, 0);
  for (const [minutes, text] of [[35, '超出 5'], [23, '缺少 7']] as const) {
    const c = content(); c.structure!.stages[1].minutes = minutes;
    assert.match(checkLessonQuality(c).issues.find(i => i.category === 'time' && i.severity === 'error')!.evidence, new RegExp(text));
  }
});
test('invalid and missing stage time diagnosed; subjective allocation only suggestion', () => {
  for (const minutes of [0, -1, NaN, undefined]) {
    const c = content(); c.structure!.stages[0].minutes = minutes as number;
    assert.ok(checkLessonQuality(c).issues.some(i => i.title.includes('时长缺失')));
  }
  assert.equal(checkLessonQuality(content()).issues.some(i => i.category === 'time' && i.severity === 'error'), false);
});
test('deleted, duplicate, wrong-revision references are precise; plain numbers are not evidence of old prose', () => {
  const c = content(), id = randomUUID(), rev = randomUUID();
  c.structure!.stages[1].questionIds = [id, id];
  c.structure!.examples = [{ canonicalId: id, revisionId: rev, arrangement: '安排', keyIdeas: '思路', followUps: ['追问'], mistakes: ['遗漏'], answerStatus: 'reviewed' }];
  const issues = checkLessonQuality(c).issues;
  assert.ok(issues.some(i => i.title.includes('已移除'))); assert.ok(issues.some(i => i.title.includes('重复'))); assert.ok(issues.some(i => i.title.includes('版本')));
  c.examples = '例题1，f(x)=123'; c.structure = qualitySample();
  assert.equal(checkLessonQuality(c).issues.filter(i => i.category === 'reference').length, 0);
  assert.equal(checkLessonQuality(c, [], 1, true).issues.find(i => i.title.includes('旧题正文'))?.severity, 'suggestion');
});
test('incomplete drafts save-schema passes; strict confirmation/export stays strict', () => {
  const c = content(); c.structure!.stages[1].minutes = 40; c.structure!.objectives = []; c.structure!.stages[0].explanation = '';
  assert.ok(lessonDraftSchema.parse(c)); assert.ok(write(c));
  assert.throws(() => lessonWriteSchema.parse({ ...write(c), status: 'ready' })); assert.throws(() => lessonContentSchema.parse(c));
  assert.ok(checkLessonQuality(c).issues.some(i => i.category === 'completeness'));
});
test('answer statuses reviewed/unverified/missing/unknown use authority, never mutable example label', () => {
  const c = content(), id = randomUUID(), rev = randomUUID(); c.questions = [{ canonicalId: id, revisionId: rev, purpose: '练习', notes: '' }]; c.structure!.stages[1].questionIds = [id];
  for (const status of ['reviewed', 'unverified', 'missing'] as const) {
    const issues = checkLessonQuality(c, [{ canonicalId: id, revisionId: rev, answerStatus: status }]).issues;
    assert.equal(issues.some(i => i.category === 'answer'), status !== 'reviewed');
  }
  assert.equal(checkLessonQuality(c).issues.find(i => i.category === 'answer')?.confidence, 'insufficient');
});
test('AI schema rejects severe factual claims and fabricated locations become overall insufficient advice', () => {
  assert.throws(() => finalizeAIQuality({ issues: [{ ...aiIssue(), severity: 'error' }] }, content(), []));
  assert.throws(() => finalizeAIQuality({ issues: [{ ...aiIssue(), source: 'rule' }] }, content(), []));
  const result = finalizeAIQuality({ issues: [{ ...aiIssue(), evidence: '不存在的内容', location: { block: 'stage', index: 15 } }] }, content(), []);
  assert.deepEqual(result[0].location, { block: 'overall', index: null }); assert.equal(result[0].confidence, 'insufficient');
});
test('mathematics always suspected; knowledge without verified labels always insufficient', () => {
  const issues = finalizeAIQuality({ issues: [{ ...aiIssue(), category: 'math' }, { ...aiIssue(), category: 'knowledge' }] }, content(), []);
  assert.match(issues[0].title, /疑似/); assert.match(issues[0].description, /尚未完成数学正确性验证/); assert.equal(issues[1].confidence, 'insufficient');
});
test('evidence from a different block cannot manufacture a precise location; export settings never enter AI context', () => {
  const c = content(); c.goals = '教学目标独有证据';
  const issues = finalizeAIQuality({ issues: [{ ...aiIssue(), evidence: c.goals }] }, c, []);
  assert.deepEqual(issues[0].location, { block: 'overall', index: null });
  const context = qualityAIContext(c, [], []);
  assert.equal('answerLines' in context.lesson, false); assert.equal('aiBackups' in context.lesson, false);
  assert.ok('selectedQuestions' in context.lesson);
});
test('service distinguishes explicit human knowledge review from AI needs_review=false', async () => {
  const f = fixture(); try {
    const c = content(); c.questions = [{ canonicalId: f.c, revisionId: f.r, purpose: '讲解', notes: '' }];
    const payload = { classification: { knowledge_points: [{ code: 'TEST', name: 'TEST ONLY 导数' }], needs_review: false } };
    f.db.prepare('UPDATE canonical_question_revisions SET payload=? WHERE id=?').run(JSON.stringify(payload), f.r);
    assert.equal((await f.store.aiQuestions(c))[0].knowledgeReviewed, false);
    f.db.prepare('UPDATE canonical_question_revisions SET payload=? WHERE id=?').run(JSON.stringify({ ...payload, human_review: { reviewer: 'TEST ONLY', reviewed_at: new Date().toISOString(), content_complete: true } }), f.r);
    assert.equal((await f.store.aiQuestions(c))[0].knowledgeReviewed, true);
  } finally { f.db.close(); }
});
test('local patch only changes target explanation plus bounded backup; rejection and stale acceptance preserve original', () => {
  const c = content(), before = structuredClone(c), patch = { target: 'stageExplanation' as const, stageIndex: 1, text: '补充参数讨论，待教师核对' };
  const accepted = acceptLessonQualityPatch(c, qualitySnapshot(c), patch);
  assert.deepEqual(c, before); assert.equal(accepted.structure!.stages[1].explanation, patch.text);
  accepted.structure!.stages[1].explanation = c.structure!.stages[1].explanation; accepted.aiBackups = []; assert.deepEqual(accepted, c);
  assert.throws(() => acceptLessonQualityPatch({ ...c, goals: '更改目标' }, qualitySnapshot(c), patch), /已被修改/);
  assert.throws(() => acceptLessonQualityPatch(c, qualitySnapshot(c), { ...patch, target: 'revisionId' } as never));
});
test('reference/answer/time and overall advice cannot be automatically repaired', () => {
  const issue = checkLessonQuality({ ...content(), goals: '' }).issues[0];
  for (const category of ['reference', 'answer', 'time'] as const) assert.equal(qualityRepairTarget({ ...issue, category, location: { block: 'stage', index: 1 } }, content()), null);
});
test('shared chat and Responses transports; HTTP failure, bad JSON, incomplete, cancellation and timeout', async () => {
  assert.deepEqual(await requestQualityJSON({}, 'lesson_quality', config, undefined, async () => answer({ issues: [] })), { issues: [] });
  assert.deepEqual(await requestQualityJSON({}, 'lesson_quality', { ...config, apiStyle: 'responses' }, undefined, async () => new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output_text: '{"issues":[]}' } }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } })), { issues: [] });
  for (const response of [new Response('', { status: 503 }), answer('{bad'), Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })]) await assert.rejects(requestQualityJSON({}, 'lesson_quality', config, undefined, async () => response));
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(requestQualityJSON({}, 'lesson_quality', config, controller.signal, async () => { calls++; return answer({}); })); assert.equal(calls, 0);
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(requestQualityJSON({}, 'lesson_quality', { ...config, timeoutMs: 5 }, undefined, async (_url, init) => new Promise((_r, reject) => init!.signal!.addEventListener('abort', () => reject(Error('timeout'))))), /超时/); } finally { clearTimeout(keepAlive); }
});
test('real SQLite service: rule check zero model calls, partial draft saves, permission and CAS protections', async () => {
  const f = fixture(); try {
    let c = content(); c.questions = [{ canonicalId: f.c, revisionId: f.r, purpose: '讲解', notes: '' }]; c.structure!.stages[1].questionIds = [f.c];
    const p = await f.store.write(randomUUID(), write(c), true);
    let calls = 0; const fetcher: typeof fetch = async () => { calls++; return answer({ issues: [aiIssue()] }); };
    const report = await inspectLessonQuality(f.store, p.id, { mode: 'rules', expectedRevision: p.revision, content: c }, config, undefined, fetcher);
    assert.equal(report.aiRequests, 0); assert.equal(calls, 0); assert.ok('issues' in report && report.issues.some(i => i.category === 'answer'));
    await assert.rejects(inspectLessonQuality(f.stranger, p.id, { mode: 'ai', expectedRevision: 1, content: c }, config, undefined, fetcher), /无权/); assert.equal(calls, 0);
    c.structure!.stages[1].minutes = 40; c.structure!.stages[0].explanation = '';
    const p2 = await f.store.write(p.id, write(c, 1)); assert.equal(p2.revision, 2);
    await assert.rejects(inspectLessonQuality(f.store, p.id, { mode: 'ai', expectedRevision: 1, content: c }, config, undefined, fetcher), /版本/);
    await assert.rejects(f.store.write(p.id, write(c, 1)), /修改/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM students').get()!.n, 0);
  } finally { f.db.close(); }
});
test('real service: analysis, targeted repair, accept without write, save, concurrent stale and failure retention', async () => {
  const f = fixture(); try {
    const c = content(), p = await f.store.write(randomUUID(), write(c), true);
    const args = { expectedRevision: 1, content: c };
    const result = await inspectLessonQuality(f.store, p.id, { ...args, mode: 'ai' }, config, undefined, async () => answer({ issues: [aiIssue()] }));
    assert.ok('issues' in result); const issue = (result as { issues: QualityIssue[] }).issues.find(i => i.source === 'ai')!;
    const patch = { target: 'stageExplanation', stageIndex: 1, text: 'TEST ONLY 补充含参数讨论；教师核对' };
    const suggestion = await inspectLessonQuality(f.store, p.id, { ...args, mode: 'repair', issue, snapshot: qualitySnapshot(c) }, config, undefined, async () => answer(patch));
    assert.deepEqual((await f.store.get(p.id)).content, c); assert.equal(suggestion.aiRequests, 1);
    await assert.rejects(inspectLessonQuality(f.store, p.id, { ...args, mode: 'repair', issue, snapshot: qualitySnapshot(c) }, config, undefined, async () => answer({ ...patch, target: 'summary' })), /范围/);
    await assert.rejects(inspectLessonQuality(f.store, p.id, { ...args, mode: 'ai' }, config, undefined, async () => new Response('', { status: 503 })), /503/);
    const accepted = await inspectLessonQuality(f.store, p.id, { ...args, mode: 'accept', patch, snapshot: qualitySnapshot(c) }, config);
    assert.ok('content' in accepted); const next = (accepted as { content: typeof c }).content;
    assert.equal(next.structure!.stages[1].explanation, patch.text); assert.equal(next.aiBackups.length, 1);
    assert.deepEqual((await f.store.get(p.id)).content, c);
    await f.store.write(p.id, write(next, 1));
    await assert.rejects(inspectLessonQuality(f.store, p.id, { ...args, mode: 'accept', patch, snapshot: qualitySnapshot(c) }, config), /版本/);
    await assert.rejects(inspectLessonQuality(f.store, p.id, { expectedRevision: 2, content: next, mode: 'ai' }, config, undefined, async () => { await f.store.write(p.id, write({ ...next, goals: '新的目标' }, 2)); return answer({ issues: [] }); }), /期间服务器版本/);
  } finally { f.db.close(); }
});
test('service pinning diagnoses wrong revision and revoked scope without sending inaccessible text to AI', async () => {
  const f = fixture(); try {
    const c = content(), p = await f.store.write(randomUUID(), write(c), true);
    c.questions = [{ canonicalId: f.c, revisionId: f.r2, purpose: '讲解', notes: '' }];
    const report = await inspectLessonQuality(f.store, p.id, { mode: 'rules', expectedRevision: 1, content: c }, config);
    assert.ok('issues' in report && report.issues.some(i => i.title === '固定题目引用不可用'));
    let calls = 0; await assert.rejects(inspectLessonQuality(f.store, p.id, { mode: 'ai', expectedRevision: 1, content: c }, config, undefined, async () => { calls++; return answer({}); }), /引用/); assert.equal(calls, 0);
    assert.deepEqual((await f.store.get(p.id)).content, content());
  } finally { f.db.close(); }
});
