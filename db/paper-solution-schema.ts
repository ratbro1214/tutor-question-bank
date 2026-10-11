import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { papers, paperQuestions } from './schema';
import { paperImportBatches } from './paper-batch-schema';
import { questionLibraryScopes } from './canonical-schema';

export const paperSolutionSources=sqliteTable('paper_solution_sources',{
 id:text('id').primaryKey(),paperId:text('paper_id').notNull().references(()=>papers.id),batchId:text('batch_id').notNull().references(()=>paperImportBatches.id),
 scopeId:text('scope_id').notNull().references(()=>questionLibraryScopes.id),ownerId:text('owner_id').notNull(),filename:text('filename').notNull(),storageKey:text('storage_key').notNull(),fileHash:text('file_hash').notNull(),
 status:text('status').notNull().default('uploaded'),version:text('version').notNull(),pages:text('pages'),error:text('error').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('uq_solution_source_file').on(t.paperId,t.ownerId,t.fileHash),check('ck_solution_source_status',sql`${t.status} IN ('uploaded','ready','failed')`)]);
export const paperSolutionEntries=sqliteTable('paper_solution_entries',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>paperSolutionSources.id),entryKey:text('entry_key').notNull(),data:text('data').notNull(),
},t=>[uniqueIndex('uq_solution_entry_key').on(t.sourceId,t.entryKey)]);
export const paperSolutionMatches=sqliteTable('paper_solution_matches',{
 entryId:text('entry_id').primaryKey().references(()=>paperSolutionEntries.id),questionId:text('question_id').references(()=>paperQuestions.id),status:text('status').notNull(),proposal:text('proposal').notNull(),
 revision:integer('revision').notNull().default(1),questionSnapshot:text('question_snapshot').notNull().default(''),teacherText:text('teacher_text'),reviewer:text('reviewer'),updatedAt:text('updated_at').notNull(),
},t=>[check('ck_solution_match_status',sql`${t.status} IN ('MATCHED','NEEDS_REVIEW','UNMATCHED','CONFIRMED')`)]);
export const paperSolutionMatchHistory=sqliteTable('paper_solution_match_history',{
 id:text('id').primaryKey(),entryId:text('entry_id').notNull().references(()=>paperSolutionEntries.id),revision:integer('revision').notNull(),operationId:text('operation_id').notNull(),snapshot:text('snapshot').notNull(),reviewer:text('reviewer').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('uq_solution_match_revision').on(t.entryId,t.revision),uniqueIndex('uq_solution_match_operation').on(t.entryId,t.operationId)]);
export const paperSolutionReviews=sqliteTable('paper_solution_reviews',{
 id:text('id').primaryKey(),entryId:text('entry_id').notNull().references(()=>paperSolutionEntries.id),matchRevision:integer('match_revision').notNull(),operationId:text('operation_id').notNull(),
 mode:text('mode').notNull(),status:text('status').notNull(),input:text('input').notNull(),result:text('result'),teacherResult:text('teacher_result'),teacherStatus:text('teacher_status').notNull().default('pending'),
 model:text('model').notNull(),promptVersion:text('prompt_version').notNull(),elapsedMs:integer('elapsed_ms').notNull().default(0),error:text('error').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
 leaseToken:text('lease_token'),leaseUntil:text('lease_until'),
},t=>[uniqueIndex('uq_solution_review_operation').on(t.entryId,t.operationId),check('ck_solution_review_status',sql`${t.status} IN ('quality_pending','methods_pending','completed','failed')`),check('ck_solution_review_teacher',sql`${t.teacherStatus} IN ('pending','accepted','rejected')`)]);
