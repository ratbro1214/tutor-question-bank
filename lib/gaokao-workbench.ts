import { z } from 'zod';
import { chaptersForStage, taxonomyForStage } from './taxonomy';
import { normalizeClassificationTags, questionTypes, validateClassification, type Classification } from './classification';
import { cropRegionSchema } from './paper';

export const gaokaoEditSchema = z.object({
  paperId: z.string().uuid(), number: z.number().int().positive(), expectedRevision: z.number().int().nonnegative(),
  expectedContentRevision: z.string().uuid().nullable(), text: z.string().trim().min(1).max(16000),
  chapter: z.string(), knowledge: z.array(z.string()).min(1).max(4),
  difficulty: z.enum(['基础', '中等', '较难']), questionType: z.enum(questionTypes),
  regions: z.array(cropRegionSchema).min(1).max(20),
}).strict();
export function gaokaoClassification(input: z.infer<typeof gaokaoEditSchema>, previous?: Classification | null): Classification {
  const chapter = chaptersForStage('高中').find(c => c[0] === input.chapter);
  const points = input.knowledge.map(code => taxonomyForStage('高中').find(p => p[0] === code && p[2] !== 'METHOD'));
  if (!chapter || points.some(p => !p) || new Set(input.knowledge).size !== input.knowledge.length) throw new Error('请选择有效的高中章节和知识点。');
  const classification = normalizeClassificationTags({ schema_version: '1.0', taxonomy_version: 'cn-senior-math-1.0', subject: '高中数学', education_stage: '高中', extracted_question: input.text, chapter: { code: chapter[0], name: chapter[1] }, knowledge_points: points.map(p => ({ code: p![0], name: p![1] })), methods: previous?.methods || [], difficulty: input.difficulty, question_type: input.questionType, confidence: 1, needs_review: false, review_reasons: [], classification_notes: '教师在高考真题工作台核对分类。' });
  const issues = validateClassification(classification);
  if (issues.length) throw new Error(issues.map(i => i.message).join('；'));
  return classification;
}
