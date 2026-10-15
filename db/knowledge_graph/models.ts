import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { canonicalQuestions, canonicalQuestionRevisions, questionLibraryScopes } from '../canonical-schema';

export const knowledgeLevels = [1, 2, 3, 4, 5] as const;
export const knowledgeRelationTypes = ['belongs_to', 'prerequisite', 'related', 'contains', 'advanced'] as const;
export const knowledgeReviewStatuses = ['pending', 'approved'] as const;
const timestamp = (name: string) => text(name).notNull().default(sql`CURRENT_TIMESTAMP`);
const reviewFields = () => ({
  knowledgeReviewStatus: text('knowledge_review_status', { enum: knowledgeReviewStatuses }).notNull().default('pending'),
  source: text('source', { enum: ['manual', 'seed', 'ai'] }).notNull().default('manual'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// Stable codes identify concepts; names need not be unique across chapters.
export const knowledgeNodes = sqliteTable('knowledge_nodes', {
  id: text('id').primaryKey().notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  subject: text('subject').notNull().default('math'),
  stage: text('stage').notNull().default('senior_high'),
  curriculumVersion: text('curriculum_version').notNull().default('general-v1'),
  level: integer('level').notNull(),
  description: text('description').notNull().default(''),
  difficulty: integer('difficulty'),
  importance: text('importance', { enum: ['low', 'medium', 'high'] }),
  examFrequency: text('exam_frequency', { enum: ['low', 'medium', 'high'] }),
  metadata: text('metadata').notNull().default('{}'),
  ...reviewFields(),
}, t => [
  uniqueIndex('uq_knowledge_node_code').on(t.subject, t.stage, t.curriculumVersion, t.code),
  index('idx_knowledge_node_catalog').on(t.subject, t.stage, t.curriculumVersion, t.knowledgeReviewStatus, t.level),
  index('idx_knowledge_node_name').on(t.name, t.stage),
  check('ck_knowledge_node_identity', sql`length(trim(${t.id}))>0 AND length(trim(${t.code}))>0 AND length(trim(${t.name}))>0 AND length(trim(${t.subject}))>0 AND length(trim(${t.stage}))>0 AND length(trim(${t.curriculumVersion}))>0`),
  check('ck_knowledge_node_level', sql`${t.level} IN (1,2,3,4,5)`),
  check('ck_knowledge_node_difficulty', sql`${t.difficulty} IS NULL OR (${t.difficulty} BETWEEN 1 AND 5 AND typeof(${t.difficulty})='integer')`),
  check('ck_knowledge_node_importance', sql`${t.importance} IS NULL OR ${t.importance} IN ('low','medium','high')`),
  check('ck_knowledge_node_frequency', sql`${t.examFrequency} IS NULL OR ${t.examFrequency} IN ('low','medium','high')`),
  check('ck_knowledge_node_metadata', sql`json_valid(${t.metadata}) AND json_type(${t.metadata})='object'`),
  check('ck_knowledge_node_review', sql`${t.knowledgeReviewStatus} IN ('pending','approved') AND (${t.knowledgeReviewStatus}='pending' OR (${t.reviewedBy} IS NOT NULL AND length(trim(${t.reviewedBy}))>0 AND ${t.reviewedAt} IS NOT NULL AND length(trim(${t.reviewedAt}))>0))`),
  check('ck_knowledge_node_source', sql`${t.source} IN ('manual','seed','ai')`),
]);

export const knowledgeEdges = sqliteTable('knowledge_edges', {
  id: text('id').primaryKey().notNull(),
  sourceId: text('source_id').notNull().references(() => knowledgeNodes.id, { onDelete: 'restrict' }),
  targetId: text('target_id').notNull().references(() => knowledgeNodes.id, { onDelete: 'restrict' }),
  relationType: text('relation_type', { enum: knowledgeRelationTypes }).notNull(),
  description: text('description').notNull().default(''),
  ...reviewFields(),
}, t => [
  uniqueIndex('uq_knowledge_edge').on(t.sourceId, t.targetId, t.relationType),
  index('idx_knowledge_edge_out').on(t.sourceId, t.knowledgeReviewStatus, t.relationType),
  index('idx_knowledge_edge_in').on(t.targetId, t.knowledgeReviewStatus, t.relationType),
  check('ck_knowledge_edge_identity', sql`length(trim(${t.id}))>0`),
  check('ck_knowledge_edge_self', sql`${t.sourceId}<>${t.targetId}`),
  check('ck_knowledge_edge_type', sql`${t.relationType} IN ('belongs_to','prerequisite','related','contains','advanced')`),
  check('ck_knowledge_edge_review', sql`${t.knowledgeReviewStatus} IN ('pending','approved') AND (${t.knowledgeReviewStatus}='pending' OR (${t.reviewedBy} IS NOT NULL AND length(trim(${t.reviewedBy}))>0 AND ${t.reviewedAt} IS NOT NULL AND length(trim(${t.reviewedAt}))>0))`),
  check('ck_knowledge_edge_source', sql`${t.source} IN ('manual','seed','ai')`),
]);

// Canonical identity bridges uploaded paper questions and the existing question bank.
export const questionKnowledgeRelation = sqliteTable('question_knowledge_relation', {
  questionId: text('question_id').notNull(),
  knowledgeId: text('knowledge_id').notNull().references(() => knowledgeNodes.id, { onDelete: 'restrict' }),
  scopeId: text('scope_id').notNull().references(() => questionLibraryScopes.id, { onDelete: 'restrict' }),
  weight: real('weight').notNull().default(1),
  role: text('role', { enum: ['main', 'secondary', 'exam_point', 'question_type'] }).notNull().default('secondary'),
  ...reviewFields(),
}, t => [
  primaryKey({ columns: [t.questionId, t.knowledgeId] }),
  foreignKey({ columns: [t.scopeId, t.questionId], foreignColumns: [canonicalQuestions.scopeId, canonicalQuestions.id] }).onDelete('restrict'),
  index('idx_question_knowledge_lookup').on(t.scopeId, t.knowledgeId, t.knowledgeReviewStatus),
  check('ck_question_knowledge_weight', sql`${t.weight}>0 AND ${t.weight}<=1`),
  check('ck_question_knowledge_role', sql`${t.role} IN ('main','secondary','exam_point','question_type')`),
  check('ck_question_knowledge_review', sql`${t.knowledgeReviewStatus} IN ('pending','approved') AND (${t.knowledgeReviewStatus}='pending' OR (${t.reviewedBy} IS NOT NULL AND length(trim(${t.reviewedBy}))>0 AND ${t.reviewedAt} IS NOT NULL AND length(trim(${t.reviewedAt}))>0))`),
  check('ck_question_knowledge_source', sql`${t.source} IN ('manual','seed','ai')`),
]);

export type KnowledgeNode = typeof knowledgeNodes.$inferSelect;
export type NewKnowledgeNode = typeof knowledgeNodes.$inferInsert;
export type KnowledgeEdge = typeof knowledgeEdges.$inferSelect;
export type QuestionKnowledgeRelation = typeof questionKnowledgeRelation.$inferSelect;

// Evidence is separate to keep Phase 1 tables additive and retain source revision provenance.
export const knowledgeRelationEvidence = sqliteTable('knowledge_relation_evidence', {
  questionId: text('question_id').notNull(),
  knowledgeId: text('knowledge_id').notNull(),
  revisionId: text('revision_id').notNull(),
  analysisHash: text('analysis_hash').notNull(),
  createdAt: timestamp('created_at'),
}, t => [
  primaryKey({ columns: [t.questionId, t.knowledgeId] }),
  foreignKey({ columns: [t.questionId, t.knowledgeId], foreignColumns: [questionKnowledgeRelation.questionId, questionKnowledgeRelation.knowledgeId] }).onDelete('cascade'),
  foreignKey({ columns: [t.questionId, t.revisionId], foreignColumns: [canonicalQuestionRevisions.canonicalQuestionId, canonicalQuestionRevisions.id] }).onDelete('restrict'),
  index('idx_knowledge_evidence_revision').on(t.questionId, t.revisionId),
]);
