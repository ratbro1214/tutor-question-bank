import { z } from 'zod';

const requiredText = z.string().trim().min(1, '必要教学内容不能为空。').max(6000);
const texts = z.array(requiredText).min(1).max(20);
export const stageKinds = ['导入', '讲解', '练习', '检测', '总结'] as const;
export const lessonStageSchema = z.object({
  kind: z.enum(stageKinds), title: requiredText, minutes: z.number().int().min(1).max(480),
  purpose: requiredText, activities: requiredText,
  questionIds: z.array(z.string().uuid()).max(30), explanation: requiredText, followUps: texts,
}).strict();
export const lessonStructureSchema = z.object({
  objectives: texts, prerequisites: texts, focus: texts, difficulties: texts,
  stages: z.array(lessonStageSchema).min(2).max(16),
  examples: z.array(z.object({ canonicalId: z.string().uuid(), revisionId: z.string().uuid(),
    arrangement: requiredText, keyIdeas: requiredText, followUps: texts, mistakes: texts,
    answerStatus: z.enum(['reviewed', 'unverified', 'missing']),
  }).strict()).max(30),
  classroomQuestions: texts, commonMistakes: texts, practiceSuggestions: texts, summary: requiredText,
}).strict();
export type LessonStructure = z.infer<typeof lessonStructureSchema>;
export type LessonStage = z.infer<typeof lessonStageSchema>;
// Incomplete text and time allocations are valid drafts, never validated AI output.
const draftText = z.string().max(6000);
const draftTexts = z.array(draftText).max(20);
export const lessonDraftStructureSchema = lessonStructureSchema.extend({
  objectives: draftTexts, prerequisites: draftTexts, focus: draftTexts, difficulties: draftTexts,
  classroomQuestions: draftTexts, commonMistakes: draftTexts, practiceSuggestions: draftTexts, summary: draftText,
  stages: z.array(lessonStageSchema.extend({ title: draftText, purpose: draftText, activities: draftText,
    explanation: draftText, followUps: draftTexts, minutes: z.number().int().min(0).max(480) })).max(16),
  examples: z.array(lessonStructureSchema.shape.examples.element.extend({ arrangement: draftText, keyIdeas: draftText, followUps: draftTexts, mistakes: draftTexts })).max(30),
});
export const answerStatusLabels = { reviewed: '已有教师审核解析；AI 讲解仍待教师确认', unverified: '已有解析未经审核，答案未核验', missing: '缺少可用解析，答案未核验' };
export function validateLessonStructure(structure: LessonStructure, questions: { canonicalId: string; revisionId: string }[], duration: number, strictFlow = false) {
  const allowed = new Map(questions.map(q => [q.canonicalId, q.revisionId]));
  if (structure.stages.reduce((n, s) => n + s.minutes, 0) !== duration) throw Error('教学环节时长之和须与课程总时长一致。');
  if (strictFlow && (structure.stages[0].kind !== '导入' || structure.stages.at(-1)?.kind !== '总结')) throw Error('教学流程须从导入开始、以总结结束。');
  let order = -1;
  for (const stage of structure.stages) {
    const next = stageKinds.indexOf(stage.kind);
    if (strictFlow && next < order) throw Error('教学环节顺序应为导入、讲解、练习、检测、总结。');
    order = next;
    if (new Set(stage.questionIds).size !== stage.questionIds.length || stage.questionIds.some(id => !allowed.has(id))) throw Error('教学环节引用了未选择的题目或重复 ID。');
  }
  const seen = new Set<string>();
  for (const example of structure.examples) {
    if (allowed.get(example.canonicalId) !== example.revisionId || seen.has(example.canonicalId)) throw Error('例题身份、版本或重复引用无效。');
    seen.add(example.canonicalId);
  }
}
export function alignStageMinutes(stages: LessonStage[], duration: number): LessonStage[] {
  if (!Number.isInteger(duration) || duration < stages.length || duration > 480) throw Error('课程时长不足以分配每个环节至少一分钟。');
  if (!stages.length || stages.some(s => !Number.isFinite(s.minutes) || s.minutes < 1)) throw Error('请先为每个教学环节填写有效的正数时长。');
  const sum = stages.reduce((n, s) => n + s.minutes, 0), remaining = duration - stages.length;
  const shares = stages.map(s => remaining * s.minutes / sum), minutes = shares.map(n => 1 + Math.floor(n));
  const remainder = duration - minutes.reduce((a, b) => a + b, 0);
  const order = shares.map((n, i) => ({ i, fraction: n - Math.floor(n) })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < remainder; i++) minutes[order[i].i]++;
  return stages.map((s, i) => ({ ...s, minutes: minutes[i] }));
}

const stringJson = { type: 'string' }, stringArrayJson = { type: 'array', minItems: 1, maxItems: 20, items: stringJson };
const objectJson = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
export const lessonStageJsonSchema = objectJson({ kind: { type: 'string', enum: stageKinds }, title: stringJson, minutes: { type: 'integer', minimum: 1, maximum: 480 }, purpose: stringJson, activities: stringJson,
  questionIds: { type: 'array', maxItems: 30, items: stringJson }, explanation: stringJson, followUps: stringArrayJson });
export const lessonStructureJsonSchema = objectJson({ objectives: stringArrayJson, prerequisites: stringArrayJson, focus: stringArrayJson, difficulties: stringArrayJson,
  stages: { type: 'array', minItems: 2, maxItems: 16, items: lessonStageJsonSchema },
  examples: { type: 'array', maxItems: 30, items: objectJson({ canonicalId: stringJson, revisionId: stringJson, arrangement: stringJson, keyIdeas: stringJson, followUps: stringArrayJson, mistakes: stringArrayJson, answerStatus: { type: 'string', enum: ['reviewed', 'unverified', 'missing'] } }) },
  classroomQuestions: stringArrayJson, commonMistakes: stringArrayJson, practiceSuggestions: stringArrayJson, summary: stringJson });
