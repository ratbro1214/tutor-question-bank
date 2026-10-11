import { lessonContentSchema } from './lesson-plan';
import { LessonError, type LessonStore } from './lesson-plan-store';
import { generateLesson, lessonGenerationRequestSchema } from './lesson-generation';
import type { ExplanationProvider } from './explanation-generation';

// A generation request only reads the saved plan and authoritative question records.
export async function createLessonDraft(store: LessonStore, id: string, raw: unknown, config: ExplanationProvider, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  const current = await store.get(id), input = lessonGenerationRequestSchema.parse(raw);
  if (input.expectedRevision !== current.revision) throw new LessonError('服务器教案已更新，请核对版本后再生成；当前草稿保留。', 409);
  const content = lessonContentSchema.parse(input.content), questions = await store.aiQuestions(content);
  const result = await generateLesson(content, questions, config, input.edit, signal, fetcher);
  if ((await store.get(id)).revision !== input.expectedRevision) throw new LessonError('生成期间服务器教案已更新，请重新核对后生成；当前草稿保留。', 409);
  const finalQuestions = await store.aiQuestions(content);
  if (result.mode === 'full') result.structure.examples = result.structure.examples.map(e => ({ ...e, answerStatus: finalQuestions.find(q => q.canonicalId === e.canonicalId)!.answerStatus }));
  return { ...result, questionStates: finalQuestions.map(q => ({ canonicalId: q.canonicalId, revisionId: q.revisionId, answerStatus: q.answerStatus })) };
}
