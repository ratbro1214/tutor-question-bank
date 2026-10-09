import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { papers, paperQuestions } from './schema';
import { questionLibraryScopes, sourceDocuments, canonicalQuestions } from './canonical-schema';
export const paperImportBatches=sqliteTable('paper_import_batches',{
 id:text('id').primaryKey().notNull(),scopeId:text('scope_id').notNull().references(()=>questionLibraryScopes.id),
 status:text('status').notNull().default('processing'),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[check('ck_import_batch_status',sql`${t.status} IN ('processing','completed','completed_with_errors','failed')`)]);
export const paperImportFiles=sqliteTable('paper_import_files',{
 id:text('id').primaryKey().notNull(),batchId:text('batch_id').notNull().references(()=>paperImportBatches.id),position:integer('position').notNull(),filename:text('filename').notNull(),
 status:text('status').notNull().default('pending'),paperId:text('paper_id').references(()=>papers.id),sourceDocumentId:text('source_document_id').references(()=>sourceDocuments.id),error:text('error').notNull().default(''),
},t=>[uniqueIndex('uq_import_file_position').on(t.batchId,t.position),index('idx_paper_import_files_batch').on(t.batchId),check('ck_import_file_status',sql`${t.status} IN ('pending','processing','completed','needs_review','failed')`)]);
export const paperImportItems=sqliteTable('paper_import_items',{
 id:text('id').primaryKey().notNull(),fileId:text('file_id').notNull().references(()=>paperImportFiles.id),questionNumber:integer('question_number').notNull(),paperQuestionId:text('paper_question_id').references(()=>paperQuestions.id),
 normalizedText:text('normalized_text').notNull().default(''),textHash:text('text_hash'),status:text('status').notNull(),canonicalId:text('canonical_id').references(()=>canonicalQuestions.id),duplicateCanonicalId:text('duplicate_canonical_id').references(()=>canonicalQuestions.id),duplicateItemId:text('duplicate_item_id').references(():AnySQLiteColumn=>paperImportItems.id),observedHash:text('observed_hash'),reason:text('reason').notNull().default(''),decision:text('decision'),
},t=>[uniqueIndex('uq_import_item_number').on(t.fileId,t.questionNumber),index('idx_paper_import_items_hash').on(t.textHash),check('ck_import_item_status',sql`${t.status} IN ('NEW','DUPLICATE','NEEDS_REVIEW','FAILED')`)]);
