import { lessonContentSchema, lessonDraftSchema, type LessonContent } from './lesson-plan';
import { qualityPatchOriginal, qualityPatchSchema, type QualityPatch } from './lesson-quality-ai';

export function acceptLessonQualityPatch(current: LessonContent, original: string, raw: QualityPatch) {
  if (JSON.stringify(current) !== original) throw Error('检查依据已被修改，请重新检查；不会覆盖当前内容。');
  const patch = qualityPatchSchema.parse(raw);
  qualityPatchOriginal(current, patch);
  const next = patch.target === 'stageExplanation' ? { ...current, structure: { ...current.structure!, stages: current.structure!.stages.map((s, i) => i === patch.stageIndex ? { ...s, explanation: patch.text } : s) } } : { ...current, [patch.target]: patch.text };
  return lessonDraftSchema.parse({ ...next, aiBackups: [...current.aiBackups, { createdAt: new Date().toISOString(), action: '质量检查局部修改', original: JSON.stringify({ ...current, aiBackups: [] }) }].slice(-5) });
}
import type { LessonEdit, LessonGenerationResult } from './lesson-generation';

export function acceptLessonProposal(current: LessonContent, original: string, result: LessonGenerationResult, edit?: LessonEdit) {
  if (JSON.stringify(current) !== original) throw Error('生成依据已被修改，请重新生成；不会覆盖当前内容。');
  const structure = result.mode === 'full' ? { ...result.structure } : current.structure && edit ? {
    ...current.structure, stages: current.structure.stages.map((s, i) => i === edit.stageIndex ? result.stage : s),
  } : null;
  if (!structure) throw Error('局部修改的原教学环节已不存在。');
  if (result.questionStates) structure.examples = structure.examples.map(e => ({ ...e, answerStatus: result.questionStates?.find(q => q.canonicalId === e.canonicalId && q.revisionId === e.revisionId)?.answerStatus || 'missing' }));
  const snapshot = { ...current, aiBackups: [] };
  return lessonContentSchema.parse({ ...current, structure, duration: result.mode === 'stage' ? result.duration : current.duration,
    aiBackups: [...current.aiBackups, { createdAt: new Date().toISOString(), action: edit?.action || '生成整篇教案', original: JSON.stringify(snapshot) }].slice(-5) });
}
