import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lessonContentSchema } from '../lib/lesson-plan';
import { alignStageMinutes, validateLessonStructure, type LessonStructure } from '../lib/lesson-structure';
import { acceptLessonProposal } from '../lib/lesson-ai-draft';
import { finalizeGeneratedLesson, finalizeEditedStage, generateLesson, lessonGenerationPrompt, type LessonAIQuestion } from '../lib/lesson-generation';
import { configuredExplanationProvider } from '../lib/ai-provider';
import type { ExplanationProvider } from '../lib/explanation-generation';

const id = randomUUID(), revisionId = randomUUID();
const content = lessonContentSchema.parse({ topic: 'TEST ONLY 函数', duration: 45, questions: [{ canonicalId: id, revisionId }] });
const question: LessonAIQuestion = { canonicalId: id, revisionId, text: 'TEST ONLY 题干', stage: '高中', identityStatus: 'ready', knowledge: [{ code: 'TEST', name: '测试知识点' }], difficulty: '基础', questionType: '证明题', sources: [], answerStatus: 'missing', reviewedExplanation: null };
const sample = (): LessonStructure => ({ objectives: ['测试目标'], prerequisites: ['测试前置知识'], focus: ['测试重点'], difficulties: ['测试难点'],
  stages: [
    { kind: '导入', title: '导入', minutes: 5, purpose: '测试目的', activities: '测试活动', questionIds: [], explanation: '测试讲解', followUps: ['测试追问'] },
    { kind: '讲解', title: '讲解', minutes: 35, purpose: '测试目的', activities: '测试活动', questionIds: [id], explanation: '教师核对答案后讲解', followUps: ['测试追问'] },
    { kind: '总结', title: '总结', minutes: 5, purpose: '测试目的', activities: '测试活动', questionIds: [], explanation: '测试总结', followUps: ['测试追问'] },
  ], examples: [{ canonicalId: id, revisionId, arrangement: '测试安排', keyIdeas: '待教师核对', followUps: ['测试追问'], mistakes: ['测试易错点'], answerStatus: 'reviewed' }],
  classroomQuestions: ['测试追问'], commonMistakes: ['测试易错点'], practiceSuggestions: ['用已选题复习'], summary: '测试总结' });
const config: ExplanationProvider = { apiKey: 'fixture-only', baseUrl: 'https://fixture.invalid/v1/', apiStyle: 'chat_completions', strictJsonSchema: true, model: 'fixture-only' };
const answer = (raw: unknown) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] });

test('description-led course design works without library questions and rejects invented references', async () => {
  const course = lessonContentSchema.parse({ topic: '导数与单调性', brief: '学生会求导，但不会讨论含参数的单调性；安排分层练习。' });
  const raw = sample(); raw.examples = []; raw.stages.forEach(s => { s.questionIds = []; });
  const result = await generateLesson(course, [], config, undefined, undefined, async (_url, init) => {
    const prompt = JSON.parse(JSON.parse(String(init!.body)).messages[1].content);
    assert.equal(prompt.lesson.brief, course.brief);
    assert.equal(prompt.questions.length, 0);
    return answer(raw);
  });
  assert.equal(result.mode, 'full');
  if (result.mode === 'full') {
    assert.equal(result.structure.examples.length, 0);
    assert.equal(result.structure.stages.reduce((sum, s) => sum + s.minutes, 0), 45);
    assert.ok(acceptLessonProposal(course, JSON.stringify(course), result).structure);
  }
  raw.stages[1].questionIds = [randomUUID()];
  assert.throws(() => finalizeGeneratedLesson(raw, course, []), /未选择/);
  assert.equal(lessonContentSchema.parse({ topic: '旧教案' }).brief, '');
});

test('full generation is structured, references selected versions and cannot elevate answer review', () => {
  const result = finalizeGeneratedLesson(sample(), content, [question]);
  assert.equal(result.structure.examples[0].answerStatus, 'missing');
  assert.equal(result.structure.stages.reduce((n, s) => n + s.minutes, 0), 45);
  assert.equal(finalizeGeneratedLesson(sample(), content, [{ ...question, answerStatus: 'unverified' }]).structure.examples[0].answerStatus, 'unverified');
  assert.equal(finalizeGeneratedLesson(sample(), content, [{ ...question, answerStatus: 'reviewed' }]).structure.examples[0].answerStatus, 'reviewed');
});
test('time adjustment allocates positive integer minutes with exact sum and deterministic remainder', () => {
  const raw = sample(); raw.stages[1].minutes = 20;
  const result = finalizeGeneratedLesson(raw, content, [question]);
  assert.equal(result.warnings.length, 1); assert.equal(result.structure.stages.reduce((n, s) => n + s.minutes, 0), 45);
  assert.deepEqual(alignStageMinutes(sample().stages, 3).map(s => s.minutes), [1, 1, 1]);
  assert.throws(() => alignStageMinutes(sample().stages, 2));
  assert.throws(() => alignStageMinutes([{ ...sample().stages[0], minutes: 0 }], 45));
});
test('reject fabricated IDs, wrong content version, missing examples, blank fields and invalid order', () => {
  for (const mutate of [
    (s: LessonStructure) => { s.stages[1].questionIds = [randomUUID()]; },
    (s: LessonStructure) => { s.examples[0].revisionId = randomUUID(); },
    (s: LessonStructure) => { s.examples = []; },
    (s: LessonStructure) => { s.stages[1].purpose = ' '; },
    (s: LessonStructure) => { s.stages.reverse(); },
    (s: LessonStructure) => { s.stages[1].questionIds = []; },
  ]) { const s = sample(); mutate(s); assert.throws(() => finalizeGeneratedLesson(s, content, [question])); }
  assert.throws(() => finalizeGeneratedLesson({ ...sample(), sources: ['模型伪造来源'] }, content, [question]));
});
test('local edit changes only one stage, preserving original duration except explicit time changes', () => {
  const original = lessonContentSchema.parse({ ...content, structure: sample() });
  const edit = { stageIndex: 1, action: '简化讲解' as const, instruction: '' };
  const result = finalizeEditedStage({ ...original.structure!.stages[1], explanation: '简化后的建议', minutes: 1 }, original, edit);
  assert.equal(result.stage.minutes, 35);
  const accepted = acceptLessonProposal(original, JSON.stringify(original), { mode: 'stage', ...result, model: 'fixture' }, edit);
  assert.deepEqual(accepted.structure!.stages[0], original.structure!.stages[0]);
  assert.deepEqual(accepted.structure!.stages[2], original.structure!.stages[2]);
  assert.deepEqual(accepted.structure!.examples, original.structure!.examples);
  assert.equal(original.structure!.stages[1].explanation, '教师核对答案后讲解');
  assert.equal(lessonContentSchema.parse(JSON.parse(accepted.aiBackups[0].original)).structure!.stages[1].explanation, original.structure!.stages[1].explanation);
  const time = finalizeEditedStage(original.structure!.stages[1], original, { ...edit, action: '调整课堂时间', minutes: 10 });
  assert.equal(time.duration, 20); assert.equal(time.stage.minutes, 10); assert.equal(time.warnings.length, 1);
  assert.throws(() => finalizeEditedStage({ ...original.structure!.stages[1], kind: '检测' }, original, edit));
});
test('full proposal retains teacher prose, keeps bounded backups and refuses stale acceptance', () => {
  const original = lessonContentSchema.parse({ ...content, goals: '教师确认目标', flow: '教师手写流程' });
  const result = { mode: 'full' as const, ...finalizeGeneratedLesson(sample(), original, [question]), model: 'fixture' };
  const accepted = acceptLessonProposal(original, JSON.stringify(original), result);
  assert.equal(accepted.goals, original.goals); assert.equal(accepted.flow, original.flow);
  assert.equal(original.structure, null);
  assert.throws(() => acceptLessonProposal({ ...original, goals: '新的目标' }, JSON.stringify(original), result), /已被修改/);
  let current = accepted;
  for (let i = 0; i < 6; i++) current = acceptLessonProposal(current, JSON.stringify(current), result);
  assert.equal(current.aiBackups.length, 5); assert.equal(JSON.parse(current.aiBackups[4].original).aiBackups.length, 0);
});
test('uses shared provider settings and sends authentic question context and structured JSON format', async () => {
  assert.equal(configuredExplanationProvider({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'fixture' }).strictJsonSchema, false);
  assert.equal(configuredExplanationProvider({ OPENAI_VISION_MODEL: 'existing-model' }).model, 'existing-model');
  const prompt = JSON.parse(lessonGenerationPrompt(content, [question]));
  assert.equal(prompt.questions[0].revisionId, revisionId); assert.equal(prompt.questions[0].reviewedExplanation, null);
  const result = await generateLesson(content, [question], config, undefined, undefined, async (url, init) => {
    assert.equal(url, 'https://fixture.invalid/v1/chat/completions');
    const body = JSON.parse(String(init!.body)); assert.equal(body.response_format.type, 'json_schema');
    assert.match(body.messages[0].content, /不能编造/); assert.match(body.messages[1].content, /测试知识点/);
    return answer(sample());
  });
  assert.equal(result.mode, 'full');
});
test('format retry is bounded, repairs invalid IDs by regeneration and does not retry service failure', async () => {
  let calls = 0;
  const result = await generateLesson(content, [question], config, undefined, undefined, async () => { calls++; return calls === 1 ? answer({ invalid: true }) : answer(sample()); });
  assert.equal(result.mode, 'full'); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(generateLesson(content, [question], config, undefined, undefined, async () => { calls++; return answer({ invalid: true }); }), /安全重试一次/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(generateLesson(content, [question], config, undefined, undefined, async () => { calls++; return new Response('', { status: 503 }); }), /HTTP 503/);
  assert.equal(calls, 1);
  assert.equal(content.structure, null);
});
test('Responses completed stream is reused; incomplete output never becomes a draft', async () => {
  const responses = { ...config, apiStyle: 'responses' };
  const result = await generateLesson(content, [question], responses, undefined, undefined, async (_url, init) => {
    assert.equal(JSON.parse(String(init!.body)).stream, true);
    return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output_text: JSON.stringify(sample()) } }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  });
  assert.equal(result.mode, 'full');
  await assert.rejects(generateLesson(content, [question], responses, undefined, undefined, async () => new Response('data: ' + JSON.stringify({ type: 'response.incomplete' }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } })), /响应不完整/);
});
test('missing model, cancellation before/during request, timeout and empty candidate set preserve original', async () => {
  await assert.rejects(generateLesson(content, [question], { ...config, apiKey: undefined }), /AI 不可用/);
  await assert.rejects(generateLesson(content, [], config), /所选题目读取不完整/);
  const cancelled = new AbortController(); cancelled.abort();
  let calls = 0;
  await assert.rejects(generateLesson(content, [question], config, undefined, cancelled.signal, async () => { calls++; return answer(sample()); }), /取消/); assert.equal(calls, 0);
  const wait: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(generateLesson(content, [question], { ...config, timeoutMs: 10 }, undefined, undefined, wait), /超时/);
    const abort = new AbortController(), pending = generateLesson(content, [question], config, undefined, abort.signal, wait); abort.abort(); await assert.rejects(pending, /取消/);
  } finally { clearTimeout(keepAlive); }
  assert.equal(content.structure, null);
});
test('persisted structure validation rejects mismatched total without changing original', () => {
  const s = sample(); s.stages[0].minutes = 6;
  assert.throws(() => lessonContentSchema.parse({ ...content, structure: s }), /时长/);
  assert.throws(() => validateLessonStructure(s, content.questions, 45), /时长/);
});
