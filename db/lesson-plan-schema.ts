import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { canonicalQuestionRevisions } from './canonical-schema';

export const lessonPlans = sqliteTable('lesson_plans', {
  id: text('id').primaryKey().notNull(), ownerId: text('owner_id').notNull(),
  topic: text('topic').notNull(), stage: text('stage').notNull(), status: text('status').notNull().default('draft'),
  revision: integer('revision').notNull(), currentVersionId: text('current_version_id').notNull(),
  content: text('content').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('idx_lesson_owner_updated').on(t.ownerId, t.updatedAt),
  check('ck_lesson_owner', sql`length(trim(${t.ownerId})) > 0`),
  check('ck_lesson_revision', sql`${t.revision} > 0`),
  check('ck_lesson_status', sql`${t.status} IN ('draft','ready','archived')`),
  check('ck_lesson_content', sql`json_valid(${t.content}) AND json_type(${t.content}) = 'object'`),
]);
export const lessonPlanVersions = sqliteTable('lesson_plan_versions', {
  id: text('id').primaryKey().notNull(), planId: text('plan_id').notNull().references(() => lessonPlans.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(), content: text('content').notNull(), status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('uq_lesson_version_number').on(t.planId, t.revision),
  check('ck_lesson_version_revision', sql`${t.revision} > 0`),
  check('ck_lesson_version_status', sql`${t.status} IN ('draft','ready','archived')`),
  check('ck_lesson_version_content', sql`json_valid(${t.content}) AND json_type(${t.content}) = 'object'`),
]);
export const lessonPlanQuestions = sqliteTable('lesson_plan_questions', {
  versionId: text('version_id').notNull().references(() => lessonPlanVersions.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(), canonicalId: text('canonical_id').notNull(), revisionId: text('revision_id').notNull(),
  purpose: text('purpose').notNull(), notes: text('notes').notNull().default(''),
}, t => [uniqueIndex('uq_lesson_question_position').on(t.versionId, t.position),
  uniqueIndex('uq_lesson_question_identity').on(t.versionId, t.canonicalId),
  foreignKey({ columns: [t.canonicalId, t.revisionId], foreignColumns: [canonicalQuestionRevisions.canonicalQuestionId, canonicalQuestionRevisions.id] }).onDelete('restrict'),
  check('ck_lesson_question_position', sql`${t.position} >= 0`),
  check('ck_lesson_question_purpose', sql`${t.purpose} IN ('导入','讲解','练习','检测')`),
]);
