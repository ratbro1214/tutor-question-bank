import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { papers, paperQuestions, questions } from './schema';
import { englishPapers, englishQuestions } from './english-schema';

const timestamp = (name: string) => text(name).notNull().default(sql`CURRENT_TIMESTAMP`);

export const questionLibraryScopes = sqliteTable('question_library_scopes', {
  id: text('id').primaryKey().notNull(), code: text('code').notNull(), name: text('name').notNull(),
  scopeType: text('scope_type').notNull(), kind: text('kind').notNull(),
  ownerPrincipalId: text('owner_principal_id'), ownershipStatus: text('ownership_status').notNull().default('legacy_unassigned'),
  createdAt: timestamp('created_at'),
}, t => [
  uniqueIndex('uq_library_scope_code').on(t.code),
  check('ck_library_scope_type', sql`${t.scopeType} IN ('authorized_public','teacher_private','student_private','legacy_private')`),
  check('ck_library_scope_kind', sql`(${t.scopeType} = 'authorized_public' AND ${t.kind} = 'shared') OR (${t.scopeType} <> 'authorized_public' AND ${t.kind} = 'private')`),
  check('ck_library_scope_owner', sql`${t.ownershipStatus} IN ('known','legacy_unassigned') AND (${t.kind} <> 'private' OR ${t.ownershipStatus} <> 'known' OR length(trim(${t.ownerPrincipalId})) > 0 AND ${t.ownerPrincipalId} IS NOT NULL)`),
]);

export const canonicalQuestions = sqliteTable('canonical_questions', {
  id: text('id').primaryKey().notNull(), scopeId: text('scope_id').notNull().references(() => questionLibraryScopes.id, { onDelete: 'restrict' }),
  subject: text('subject').notNull().default('unknown'), status: text('status').notNull().default('provisional'),
  currentRevisionId: text('current_revision_id'), redirectToId: text('redirect_to_id').references((): AnySQLiteColumn => canonicalQuestions.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at'), updatedAt: timestamp('updated_at'),
}, t => [
  index('idx_canonical_scope').on(t.scopeId), uniqueIndex('uq_canonical_scope_id').on(t.scopeId, t.id),
  foreignKey({ columns: [t.id, t.currentRevisionId], foreignColumns: [canonicalQuestionRevisions.canonicalQuestionId, canonicalQuestionRevisions.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.scopeId, t.redirectToId], foreignColumns: [t.scopeId, t.id] }).onDelete('restrict'),
  check('ck_canonical_subject', sql`${t.subject} IN ('math','english','unknown')`),
  check('ck_canonical_status', sql`${t.status} IN ('provisional','active','merged','retired')`),
  check('ck_canonical_redirect', sql`${t.redirectToId} IS NULL OR (${t.status} = 'merged' AND ${t.redirectToId} <> ${t.id})`),
]);

export const canonicalQuestionRevisions = sqliteTable('canonical_question_revisions', {
  id: text('id').primaryKey().notNull(), canonicalQuestionId: text('canonical_question_id').notNull().references((): AnySQLiteColumn => canonicalQuestions.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(), subject: text('subject').notNull().default('unknown'), educationStage: text('education_stage'),
  originalText: text('original_text').notNull(), normalizedText: text('normalized_text').notNull(), normalizedHash: text('normalized_hash').notNull(),
  contentSchemaVersion: text('content_schema_version').notNull(), normalizationVersion: text('normalization_version').notNull(),
  payload: text('payload').notNull(), identityStatus: text('identity_status').notNull().default('incomplete'),
  supersedesId: text('supersedes_id'), changeReason: text('change_reason').notNull(), createdBy: text('created_by'), createdAt: timestamp('created_at'),
}, t => [
  uniqueIndex('uq_canonical_revision_number').on(t.canonicalQuestionId, t.revision), uniqueIndex('uq_canonical_revision_id').on(t.canonicalQuestionId, t.id),
  index('idx_canonical_revision_hash').on(t.normalizedHash), index('idx_canonical_revision_subject_stage').on(t.subject, t.educationStage),
  foreignKey({ columns: [t.canonicalQuestionId, t.supersedesId], foreignColumns: [t.canonicalQuestionId, t.id] }).onDelete('restrict'),
  check('ck_canonical_revision_positive', sql`${t.revision} > 0`),
  check('ck_canonical_revision_subject', sql`${t.subject} IN ('math','english','unknown')`),
  check('ck_canonical_revision_payload', sql`json_valid(${t.payload}) AND json_type(${t.payload}) = 'object'`),
  check('ck_canonical_revision_identity', sql`${t.identityStatus} IN ('incomplete','ready','needs_review')`),
  check('ck_canonical_revision_supersedes', sql`${t.supersedesId} IS NULL OR ${t.supersedesId} <> ${t.id}`),
]);

export const sourceDocuments = sqliteTable('source_documents', {
  id: text('id').primaryKey().notNull(), scopeId: text('scope_id').notNull().references(() => questionLibraryScopes.id, { onDelete: 'restrict' }),
  sourceType: text('source_type').notNull(), title: text('title').notNull(),
  mathPaperId: text('math_paper_id').references(() => papers.id, { onDelete: 'set null' }), englishPaperId: text('english_paper_id').references(() => englishPapers.id, { onDelete: 'set null' }),
  legacySourceKey: text('legacy_source_key'), fileStorage: text('file_storage').notNull().default('none'), storageKey: text('storage_key'),
  originalFilename: text('original_filename'), mimeType: text('mime_type'), fileHash: text('file_hash'), sourceUrl: text('source_url'), license: text('license'),
  metadata: text('metadata').notNull().default('{}'), createdAt: timestamp('created_at'),
}, t => [
  index('idx_source_document_scope').on(t.scopeId), index('idx_source_document_hash').on(t.fileHash),
  uniqueIndex('uq_source_math_paper').on(t.mathPaperId), uniqueIndex('uq_source_english_paper').on(t.englishPaperId),
  uniqueIndex('uq_source_document_type_id').on(t.sourceType, t.id),
  check('ck_source_document_type', sql`${t.sourceType} IN ('math_paper','english_paper','workbook','student_upload','student_archive','other')`),
  check('ck_source_document_paper', sql`(${t.mathPaperId} IS NULL OR (${t.englishPaperId} IS NULL AND ${t.sourceType} = 'math_paper')) AND (${t.englishPaperId} IS NULL OR (${t.mathPaperId} IS NULL AND ${t.sourceType} = 'english_paper'))`),
  check('ck_source_document_storage', sql`${t.fileStorage} IN ('r2','public','external','none') AND (${t.fileStorage} = 'none' OR (${t.storageKey} IS NOT NULL AND length(trim(${t.storageKey})) > 0))`),
  check('ck_source_document_metadata', sql`json_valid(${t.metadata}) AND json_type(${t.metadata}) = 'object'`),
]);

export const questionOccurrences = sqliteTable('question_occurrences', {
  id: text('id').primaryKey().notNull(), canonicalQuestionId: text('canonical_question_id').notNull().references(() => canonicalQuestions.id, { onDelete: 'restrict' }),
  contentRevisionId: text('content_revision_id'), sourceDocumentId: text('source_document_id').notNull().references(() => sourceDocuments.id, { onDelete: 'restrict' }),
  sourceType: text('source_type').notNull(), occurrenceKey: text('occurrence_key').notNull(), questionNumber: text('question_number'), page: integer('page'),
  sourceLocatorJson: text('source_locator_json').notNull().default('{}'), imageKey: text('image_key'), publicImagePath: text('public_image_path'), originalFilename: text('original_filename'),
  rawText: text('raw_text').notNull().default(''), occurrenceHash: text('occurrence_hash'), metadata: text('metadata').notNull().default('{}'),
  parentOccurrenceId: text('parent_occurrence_id').references((): AnySQLiteColumn => questionOccurrences.id, { onDelete: 'restrict' }),
  mappingStatus: text('mapping_status').notNull().default('provisional'), createdAt: timestamp('created_at'), updatedAt: timestamp('updated_at'),
}, t => [
  index('idx_occurrence_canonical').on(t.canonicalQuestionId), uniqueIndex('uq_occurrence_source_key').on(t.sourceDocumentId, t.occurrenceKey),
  uniqueIndex('uq_occurrence_canonical_id').on(t.canonicalQuestionId, t.id),
  foreignKey({ columns: [t.canonicalQuestionId, t.contentRevisionId], foreignColumns: [canonicalQuestionRevisions.canonicalQuestionId, canonicalQuestionRevisions.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.sourceType, t.sourceDocumentId], foreignColumns: [sourceDocuments.sourceType, sourceDocuments.id] }).onDelete('restrict'),
  check('ck_occurrence_page', sql`${t.page} IS NULL OR ${t.page} > 0`),
  check('ck_occurrence_locator', sql`json_valid(${t.sourceLocatorJson}) AND json_type(${t.sourceLocatorJson}) = 'object'`),
  check('ck_occurrence_metadata', sql`json_valid(${t.metadata}) AND json_type(${t.metadata}) = 'object'`),
  check('ck_occurrence_status', sql`${t.mappingStatus} IN ('provisional','confirmed','detached')`),
  check('ck_occurrence_parent', sql`${t.parentOccurrenceId} IS NULL OR ${t.parentOccurrenceId} <> ${t.id}`),
]);

export const questionModuleLinks = sqliteTable('question_module_links', {
  id: text('id').primaryKey().notNull(), moduleType: text('module_type').notNull(), moduleRecordId: text('module_record_id').notNull(),
  canonicalQuestionId: text('canonical_question_id').notNull().references(() => canonicalQuestions.id, { onDelete: 'restrict' }), occurrenceId: text('occurrence_id').notNull(),
  legacyStudentQuestionId: integer('legacy_student_question_id').references(() => questions.id, { onDelete: 'set null' }),
  legacyPaperQuestionId: text('legacy_paper_question_id').references(() => paperQuestions.id, { onDelete: 'set null' }),
  legacyEnglishQuestionId: text('legacy_english_question_id').references(() => englishQuestions.id, { onDelete: 'set null' }),
  observedSourceHash: text('observed_source_hash').notNull(), mappingRevision: integer('mapping_revision').notNull().default(1),
  createdAt: timestamp('created_at'), updatedAt: timestamp('updated_at'),
}, t => [
  uniqueIndex('uq_module_record').on(t.moduleType, t.moduleRecordId), index('idx_module_canonical').on(t.canonicalQuestionId),
  uniqueIndex('uq_module_student_question').on(t.legacyStudentQuestionId), uniqueIndex('uq_module_paper_question').on(t.legacyPaperQuestionId), uniqueIndex('uq_module_english_question').on(t.legacyEnglishQuestionId),
  foreignKey({ columns: [t.canonicalQuestionId, t.occurrenceId], foreignColumns: [questionOccurrences.canonicalQuestionId, questionOccurrences.id] }).onDelete('restrict'),
  check('ck_module_link_type', sql`${t.moduleType} IN ('student_question','paper_question','english_question')`),
  check('ck_module_link_revision', sql`${t.mappingRevision} > 0`),
  check('ck_module_link_legacy', sql`(${t.legacyStudentQuestionId} IS NULL AND ${t.legacyPaperQuestionId} IS NULL AND ${t.legacyEnglishQuestionId} IS NULL) OR (${t.moduleType} = 'student_question' AND ${t.legacyStudentQuestionId} IS NOT NULL AND ${t.moduleRecordId} = CAST(${t.legacyStudentQuestionId} AS TEXT) AND ${t.legacyPaperQuestionId} IS NULL AND ${t.legacyEnglishQuestionId} IS NULL) OR (${t.moduleType} = 'paper_question' AND ${t.legacyPaperQuestionId} IS NOT NULL AND ${t.moduleRecordId} = ${t.legacyPaperQuestionId} AND ${t.legacyStudentQuestionId} IS NULL AND ${t.legacyEnglishQuestionId} IS NULL) OR (${t.moduleType} = 'english_question' AND ${t.legacyEnglishQuestionId} IS NOT NULL AND ${t.moduleRecordId} = ${t.legacyEnglishQuestionId} AND ${t.legacyStudentQuestionId} IS NULL AND ${t.legacyPaperQuestionId} IS NULL)`),
]);
