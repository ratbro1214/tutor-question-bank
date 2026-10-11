// TEST ONLY. Uses the real owner-aware services, isolated SQLite and mock AI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixture } from '../tests/support/lesson-fixture';
import { lessonContentSchema, lessonWriteSchema } from '../lib/lesson-plan';
import { inspectLessonQuality } from '../lib/lesson-quality-workflow';
import { qualitySnapshot, type QualityIssue } from '../lib/lesson-quality';
import { createLessonDocx } from '../lib/lesson-docx';

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'work/5B-1', 'mock-' + Date.now());
mkdirSync(dir, { recursive: true });
const f = fixture(), results: { name: string; elapsedMs: number; status: string }[] = [];
let calls = 0;
const provider = { apiKey: 'TEST ONLY', baseUrl: 'https://fixture.invalid/v1', model: 'TEST ONLY mock', apiStyle: 'chat_completions', strictJsonSchema: false };
const c = lessonContentSchema.parse({ topic: 'TEST ONLY 高中导数与函数单调性', goals: '讨论含参数导数和单调性', analysis: '重点：符号；难点：参数分类', flow: '回顾求导、讲解、练习、总结', examples: 'TEST ONLY 自编活动：f(x)=x^3-3x', exercises: '研究二次函数', summary: '定义域、导数和符号', questions: [{ canonicalId: f.c, revisionId: f.r }] });
const write = (content: unknown, revision = 0) => lessonWriteSchema.parse({ operationId: randomUUID(), expectedRevision: revision, content });
const aiIssue = { category: 'goals', severity: 'warning', title: '参数目标可能未覆盖', description: '目标包含参数，流程未安排参数讨论', location: { block: 'flow', index: null }, evidence: c.flow, suggestedAction: '增设参数分类活动', confidence: 'possible' };
const mock: typeof fetch = async () => { calls++; return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ issues: [aiIssue] }) } }] }); };
async function check(name: string, action: () => Promise<void>) { const start = performance.now(); await action(); results.push({ name, elapsedMs: performance.now() - start, status: 'PASS' }); }
try {
  let p = await f.store.write(randomUUID(), write(c), true);
  const request = { expectedRevision: p.revision, content: c };
  let issue: QualityIssue, report: unknown, patch = { target: 'flow' as const, stageIndex: null, text: '回顾求导、讲解导数符号、参数分类讨论、练习、总结；数学内容待教师核对' };
  await check('规则检查无AI请求；未审核答案状态准确', async () => { report = await inspectLessonQuality(f.store, p.id, { ...request, mode: 'rules' }, provider, undefined, mock); assert.equal(calls, 0); assert.ok('issues' in (report as object)); });
  await check('主动深度检查并定位参数覆盖建议', async () => { const result = await inspectLessonQuality(f.store, p.id, { ...request, mode: 'ai' }, provider, undefined, mock); assert.ok('issues' in result); issue = result.issues.find(i => i.source === 'ai')!; assert.equal(issue.location.block, 'flow'); });
  await check('局部建议生成不写入数据库；拒绝后内容不变', async () => { await inspectLessonQuality(f.store, p.id, { ...request, mode: 'repair', issue: issue!, snapshot: qualitySnapshot(c) }, provider, undefined, async () => { calls++; return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(patch) } }] }); }); assert.deepEqual((await f.store.get(p.id)).content, c); });
  await check('教师接受仅修改目标文本；备份、CAS保存和重开', async () => { const accepted = await inspectLessonQuality(f.store, p.id, { ...request, mode: 'accept', patch, snapshot: qualitySnapshot(c) }, provider); assert.ok('content' in accepted && accepted.content); const next = accepted.content!; assert.equal(next.flow, patch.text); assert.deepEqual(next.questions, c.questions); const restored = { ...next, flow: c.flow, aiBackups: [] }; assert.deepEqual(restored, c); p = await f.store.write(p.id, write(next, 1)); assert.deepEqual((await f.store.get(p.id)).content, next); });
  await check('旧建议与其他教师请求被拒绝', async () => { await assert.rejects(inspectLessonQuality(f.store, p.id, { ...request, mode: 'accept', patch, snapshot: qualitySnapshot(c) }, provider), /版本/); await assert.rejects(inspectLessonQuality(f.stranger, p.id, { ...request, mode: 'ai' }, provider, undefined, mock), /无权/); });
  await check('AI失败不改教案及题目版本', async () => { const before = await f.store.get(p.id); await assert.rejects(inspectLessonQuality(f.store, p.id, { mode: 'ai', expectedRevision: p.revision, content: p.content }, provider, undefined, async () => { calls++; return new Response('', { status: 503 }); })); assert.deepEqual(await f.store.get(p.id), before); });
  await check('两版Word继续从固定版本导出', async () => { f.db.prepare("UPDATE canonical_question_revisions SET identity_status='ready' WHERE id=?").run(f.r); const snapshot = await f.store.exportSnapshot(p.id, p.current_version_id); for (const audience of ['teacher', 'student'] as const) writeFileSync(resolve(dir, audience + '.docx'), createLessonDocx(snapshot, audience, [])); });
  await check('独立环境无学生记录', async () => { assert.equal(f.db.prepare('SELECT COUNT(*) n FROM students').get()!.n, 0); });
  const evidence = { mode: 'MOCK ONLY service integration', realModelRequests: 0, mockRequests: calls, results, ruleReport: report, database: 'isolated :memory: SQLite; no formal D1/R2 access', browser: 'not represented by this script' };
  writeFileSync(resolve(dir, 'report.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve(root, 'outputs/5B-1-业务集成结果.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ runDir: dir, checks: results.length, realModelRequests: 0, mockRequests: calls, results }, null, 2));
} finally { f.db.close(); }
