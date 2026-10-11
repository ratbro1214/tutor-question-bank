import { z } from 'zod';
import { lessonStructureSchema, lessonDraftStructureSchema, validateLessonStructure } from './lesson-structure';

const text = z.string().max(20000);
export const lessonQuestionSchema = z.object({
  canonicalId: z.string().uuid(), revisionId: z.string().uuid(),
  purpose: z.enum(['导入', '讲解', '练习', '检测']).default('讲解'), notes: text.default(''),
}).strict();
const lessonContentObject = z.object({
  schemaVersion: z.literal(1).default(1),
  topic: z.string().trim().min(1, '请填写教学专题。').max(160),
  stage: z.enum(['初中', '高中']).default('高中'), grade: z.string().max(30).default('高三'),
  duration: z.number().int().min(1).max(480).default(45),
  scenario: z.enum(['一对一家教', '小班教学', '专题复习']).default('一对一家教'),
  goals: text.default(''), baseline: text.default(''), analysis: text.default(''),
  flow: text.default(''), examples: text.default(''), exercises: text.default(''), summary: text.default(''),
  studentSummary: text.default(''), answerLines: z.number().int().min(2).max(20).default(6),
  questions: z.array(lessonQuestionSchema).max(30).default([]),
  structure: lessonStructureSchema.nullable().default(null),
  aiBackups: z.array(z.object({ createdAt: z.string().datetime(), action: z.string().max(80), original: z.string().max(512000) }).strict()).max(5).default([]),
}).strict();
export const lessonDraftSchema = lessonContentObject.extend({ structure: lessonDraftStructureSchema.nullable().default(null) });
export const lessonContentSchema = lessonContentObject.superRefine((value, ctx) => {
  if (new Set(value.questions.map(q => q.canonicalId)).size !== value.questions.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '同一 Canonical 题目不能重复添加。', path: ['questions'] });
  if (value.structure) try { validateLessonStructure(value.structure, value.questions, value.duration); }
  catch (e) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message, path: ['structure'] }); }
});
export type LessonContent = z.infer<typeof lessonContentSchema>;
export const lessonWriteObject = z.object({
  operationId: z.string().uuid(), expectedRevision: z.number().int().min(0),
  status: z.enum(['draft', 'ready', 'archived']).default('draft'), content: lessonDraftSchema,
}).strict();
export const lessonWriteSchema = lessonWriteObject.superRefine((value, ctx) => {
  if (value.status === 'ready') {
    const parsed = lessonContentSchema.safeParse(value.content);
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['content', ...issue.path] });
  }
});
export type LessonWrite = z.infer<typeof lessonWriteSchema>;
export type LessonPlan = {
  id: string; revision: number; current_version_id: string; status: 'draft' | 'ready' | 'archived';
  created_at: string; updated_at: string; content: LessonContent;
  versions: { id: string; revision: number; created_at: string }[];
  resources: { canonicalId: string; revisionId: string; text: string; imageUrl: string | null; identityStatus: string }[];
};
export const lessonStatusLabels = { draft: '草稿', ready: '教师已确认', archived: '已归档' };
