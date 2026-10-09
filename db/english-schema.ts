import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const englishPapers = sqliteTable('english_papers', {
  id: text('id').primaryKey(), year: integer('year').notNull(), volume: text('volume', { enum: ['I', 'II'] }).notNull(),
  title: text('title').notNull(), status: text('status').notNull().default('PENDING'),
  listeningIncluded: integer('listening_included', { mode: 'boolean' }).notNull().default(false),
}, t => [uniqueIndex('english_paper_year_volume').on(t.year, t.volume)]);
export const englishArtifacts = sqliteTable('english_artifacts', {
  id: text('id').primaryKey(), paperId: text('paper_id').notNull().references(() => englishPapers.id),
  kind: text('kind').notNull(), sourceUrl: text('source_url').notNull(), sourcePage: text('source_page').notNull(),
  sourceName: text('source_name').notNull(), sourceTier: text('source_tier').notNull(),
  sha256: text('sha256').notNull(), filename: text('filename').notNull(), publicPath: text('public_path'),
  mime: text('mime'), bytes: integer('bytes').notNull(), capturedAt: text('captured_at').notNull(), license: text('license'),
});
export const englishSections = sqliteTable('english_sections', {
  id: text('id').primaryKey(), paperId: text('paper_id').notNull().references(() => englishPapers.id),
  type: text('type').notNull(), title: text('title').notNull(), position: integer('position').notNull(),
});
export const englishPassages = sqliteTable('english_passages', {
  id: text('id').primaryKey(), sectionId: text('section_id').notNull().references(() => englishSections.id),
  label: text('label').notNull(), text: text('text').notNull(), artifactId: text('artifact_id').notNull().references(() => englishArtifacts.id),
  sourceLocator: text('source_locator'), status: text('status').notNull().default('PENDING'),
});
export const englishQuestions = sqliteTable('english_questions', {
  id: text('id').primaryKey(), sectionId: text('section_id').notNull().references(() => englishSections.id),
  passageId: text('passage_id').references(() => englishPassages.id), number: integer('number').notNull(),
  type: text('type').notNull(), stem: text('stem').notNull(), score: text('score'),
});
export const englishOptions = sqliteTable('english_options', {
  questionId: text('question_id').notNull().references(() => englishQuestions.id), label: text('label').notNull(), text: text('text').notNull(),
}, t => [uniqueIndex('english_option_question_label').on(t.questionId, t.label)]);
export const englishAnswerEvidence = sqliteTable('english_answer_evidence', {
  id: text('id').primaryKey(), questionId: text('question_id').notNull().references(() => englishQuestions.id),
  artifactId: text('artifact_id').notNull().references(() => englishArtifacts.id), independenceGroup: text('independence_group').notNull(),
  rawAnswer: text('raw_answer').notNull(), normalizedAnswer: text('normalized_answer').notNull(), method: text('method').notNull(),
});
export const englishAnswers = sqliteTable('english_answers', {
  questionId: text('question_id').primaryKey().references(() => englishQuestions.id), answer: text('answer'),
  status: text('status').notNull().default('PENDING'), evidenceIds: text('evidence_ids').notNull().default('[]'), verifiedAt: text('verified_at'),
});
export const englishAnnotations = sqliteTable('english_annotations', {
  id: text('id').primaryKey(), passageId: text('passage_id').notNull().references(() => englishPassages.id),
  inputSha256: text('input_sha256').notNull(), pipeline: text('pipeline').notNull(), version: text('version').notNull(),
  payload: text('payload').notNull(), generatedAt: text('generated_at').notNull(),
});
