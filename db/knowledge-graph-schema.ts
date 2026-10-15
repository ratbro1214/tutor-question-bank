import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { knowledgePoints } from './schema';
import { canonicalQuestions, canonicalQuestionRevisions, questionLibraryScopes } from './canonical-schema';
import { paperSolutionReviews } from './paper-solution-schema';

export const mathMethods = sqliteTable('math_methods', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), scopeId: text('scope_id').notNull().references(() => questionLibraryScopes.id),
  revision: integer('revision').notNull(), operationId: text('operation_id').notNull(), status: text('status').notNull(),
  content: text('content').notNull(), source: text('source').notNull(), reviewer: text('reviewer'),
  mergedInto: text('merged_into').references((): AnySQLiteColumn => mathMethods.id), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('uq_math_method_owner_scope').on(t.id, t.ownerId, t.scopeId), index('idx_math_method_scope_status').on(t.ownerId, t.scopeId, t.status),
  uniqueIndex('uq_math_method_strategy_key').on(t.ownerId, t.scopeId, sql`json_extract(${t.content}, '$.strategy.key')`).where(sql`json_extract(${t.content}, '$.strategy.key') IS NOT NULL`),
  check('ck_math_method_status', sql`${t.status} IN ('candidate','approved','rejected')`), check('ck_math_method_json', sql`json_valid(${t.content}) AND json_valid(${t.source})`),
  check('ck_math_method_revision', sql`${t.revision}>0`), check('ck_math_method_review', sql`${t.status}<>'approved' OR ${t.reviewer} IS NOT NULL`)]);
export const mathMethodVersions = sqliteTable('math_method_versions', {
  operationId: text('operation_id').primaryKey(), methodId: text('method_id').notNull().references(() => mathMethods.id), revision: integer('revision').notNull(),
  snapshot: text('snapshot').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('uq_math_method_version').on(t.methodId, t.revision)]);
export const mathKnowledgeRelations = sqliteTable('math_knowledge_relations', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), scopeId: text('scope_id').notNull().references(() => questionLibraryScopes.id),
  relationKey: text('relation_key').notNull(), type: text('type').notNull(), fromKnowledge: integer('from_knowledge').references(() => knowledgePoints.id),
  toKnowledge: integer('to_knowledge').references(() => knowledgePoints.id), methodId: text('method_id'), canonicalId: text('canonical_id'), revisionId: text('revision_id'),
  reviewId: text('review_id').references(() => paperSolutionReviews.id), revision: integer('revision').notNull(), operationId: text('operation_id').notNull(),
  status: text('status').notNull(), source: text('source').notNull(), reviewer: text('reviewer'), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('uq_math_relation_identity').on(t.ownerId, t.scopeId, t.relationKey),
  index('idx_math_relation_from').on(t.ownerId, t.scopeId, t.fromKnowledge, t.status), index('idx_math_relation_to').on(t.ownerId, t.scopeId, t.toKnowledge, t.status),
  index('idx_math_relation_method').on(t.methodId, t.status), index('idx_math_relation_question').on(t.canonicalId, t.revisionId, t.status),
  foreignKey({ columns: [t.methodId, t.ownerId, t.scopeId], foreignColumns: [mathMethods.id, mathMethods.ownerId, mathMethods.scopeId] }),
  foreignKey({ columns: [t.scopeId, t.canonicalId], foreignColumns: [canonicalQuestions.scopeId, canonicalQuestions.id] }),
  foreignKey({ columns: [t.canonicalId, t.revisionId], foreignColumns: [canonicalQuestionRevisions.canonicalQuestionId, canonicalQuestionRevisions.id] }),
  check('ck_math_relation_status', sql`${t.status} IN ('candidate','approved','rejected')`), check('ck_math_relation_revision', sql`${t.revision}>0`),
  check('ck_math_relation_source', sql`json_valid(${t.source})`), check('ck_math_relation_review', sql`${t.status}<>'approved' OR ${t.reviewer} IS NOT NULL`),
  check('ck_math_relation_endpoints', sql`(${t.type} IN ('contains','prerequisite','related') AND ${t.fromKnowledge} IS NOT NULL AND ${t.toKnowledge} IS NOT NULL AND ${t.fromKnowledge}<>${t.toKnowledge} AND ${t.methodId} IS NULL AND ${t.canonicalId} IS NULL AND ${t.revisionId} IS NULL AND ${t.reviewId} IS NULL) OR (${t.type}='applies' AND ${t.fromKnowledge} IS NULL AND ${t.toKnowledge} IS NOT NULL AND ${t.methodId} IS NOT NULL AND ${t.canonicalId} IS NULL AND ${t.revisionId} IS NULL AND ${t.reviewId} IS NULL) OR (${t.type}='uses' AND ${t.fromKnowledge} IS NULL AND ${t.toKnowledge} IS NULL AND ${t.methodId} IS NOT NULL AND ${t.canonicalId} IS NOT NULL AND ${t.revisionId} IS NOT NULL AND ${t.reviewId} IS NOT NULL)`)]);
export const mathRelationVersions = sqliteTable('math_relation_versions', {
  operationId: text('operation_id').primaryKey(), relationId: text('relation_id').notNull().references(() => mathKnowledgeRelations.id), revision: integer('revision').notNull(),
  snapshot: text('snapshot').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('uq_math_relation_version').on(t.relationId, t.revision)]);
// Serialization for multi-statement CAS writes (including merges).
export const mathGraphLocks = sqliteTable('math_graph_locks', { ownerId: text('owner_id').primaryKey(), token: text('token').notNull() });
