import { z } from 'zod';
import { lessonDraftSchema } from './lesson-plan';
import { LessonError, type LessonStore } from './lesson-plan-store';
import { LessonGenerationError, type LessonAIQuestion } from './lesson-generation';
import type { ExplanationProvider } from './explanation-generation';
import { checkLessonQuality, qualityIssueSchema, qualitySnapshot, type QualityQuestion } from './lesson-quality';
import { finalizeAIQuality, qualityAIContext, qualityPatchOriginal, qualityPatchSchema, qualityRepairTarget, requestQualityJSON } from './lesson-quality-ai';
import { acceptLessonQualityPatch } from './lesson-ai-draft';

export const qualityRequestSchema = z.object({ mode: z.enum(['rules', 'ai', 'repair', 'accept']), expectedRevision: z.number().int().min(1), content: lessonDraftSchema,
  removedQuestions: z.boolean().default(false), issue: qualityIssueSchema.optional(), snapshot: z.string().max(512000).optional(), patch: qualityPatchSchema.optional() }).strict();
export async function inspectLessonQuality(store: LessonStore, id: string, raw: unknown, config: ExplanationProvider, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  const start = performance.now();
  // Ownership check precedes parsing or returning any supplied private report.
  const saved = await store.get(id), input = qualityRequestSchema.parse(raw), content = input.content;
  if (saved.revision !== input.expectedRevision) throw new LessonError('服务器版本已变化，请重新载入并检查；当前草稿保留。', 409);
  const fresh = async () => { if ((await store.get(id)).revision !== input.expectedRevision) throw new LessonError('检查期间服务器版本已变化，请重新检查。', 409); };
  if (input.mode === 'accept') {
    if (!input.patch || input.snapshot !== qualitySnapshot(content)) throw new LessonError('建议已过期，请重新检查。', 409);
    await store.resources(content); await fresh();
    return { content: acceptLessonQualityPatch(content, input.snapshot, input.patch), elapsedMs: performance.now() - start, aiRequests: 0 };
  }
  const questions: LessonAIQuestion[] = [], states: QualityQuestion[] = [];
  for (const q of content.questions) {
    try { const records = await store.aiQuestions({ ...content, questions: [q] }); questions.push(...records); states.push(...records); }
    catch (e) { if (!(e instanceof LessonError && [400, 403, 422].includes(e.status))) throw e; states.push({ ...q, answerStatus: 'missing', invalid: true }); }
  }
  const report = checkLessonQuality(content, states, input.expectedRevision, input.removedQuestions);
  if (input.mode === 'rules') { await fresh(); return { ...report, elapsedMs: performance.now() - start }; }
  if (states.some(q => q.invalid)) throw new LessonError('请先处理不可用题目引用，再运行 AI；快速检查仍可使用。', 422);
  let aiRequests = 0;
  const countedFetch: typeof fetch = async (...args) => { aiRequests++; return fetcher(...args); };
  try {
    if (input.mode === 'ai') {
      const result = await requestQualityJSON(qualityAIContext(content, questions, report.issues), 'lesson_quality', config, signal, countedFetch);
      const issues = finalizeAIQuality(result, content, questions); await fresh();
      return { ...report, issues: [...report.issues, ...issues], elapsedMs: performance.now() - start, aiRequests, model: config.model };
    }
    if (!input.issue || input.snapshot !== qualitySnapshot(content)) throw new LessonError('问题依据已过期，请重新检查。', 409);
    const target = qualityRepairTarget(input.issue, content);
    if (!target) throw new LessonError('此问题需要教师手动核对；仅支持明确文本字段或单环节讲解的局部建议。', 422);
    const originalText = qualityPatchOriginal(content, target);
    const rawPatch = await requestQualityJSON({ context: qualityAIContext(content, questions, report.issues), issue: input.issue, target, originalText }, 'lesson_quality_patch', config, signal, countedFetch);
    const patch = qualityPatchSchema.parse(rawPatch);
    if (patch.target !== target.target || patch.stageIndex !== target.stageIndex) throw new LessonGenerationError('AI 建议越过指定修改范围，已拒绝；原教案保留。');
    await fresh();
    return { patch, originalText, snapshot: report.snapshot, revision: input.expectedRevision, elapsedMs: performance.now() - start, aiRequests, model: config.model };
  } catch (e) {
    if (e instanceof Error) Object.assign(e, { aiRequests, elapsedMs: performance.now() - start });
    throw e;
  }
}
