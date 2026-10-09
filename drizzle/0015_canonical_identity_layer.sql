CREATE TABLE IF NOT EXISTS `canonical_question_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_question_id` text NOT NULL,
	`revision` integer NOT NULL,
	`subject` text DEFAULT 'unknown' NOT NULL,
	`education_stage` text,
	`original_text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`normalized_hash` text NOT NULL,
	`content_schema_version` text NOT NULL,
	`normalization_version` text NOT NULL,
	`payload` text NOT NULL,
	`identity_status` text DEFAULT 'incomplete' NOT NULL,
	`supersedes_id` text,
	`change_reason` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`canonical_question_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`canonical_question_id`,`supersedes_id`) REFERENCES `canonical_question_revisions`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_canonical_revision_positive" CHECK("canonical_question_revisions"."revision" > 0),
	CONSTRAINT "ck_canonical_revision_subject" CHECK("canonical_question_revisions"."subject" IN ('math','english','unknown')),
	CONSTRAINT "ck_canonical_revision_payload" CHECK(json_valid("canonical_question_revisions"."payload") AND json_type("canonical_question_revisions"."payload") = 'object'),
	CONSTRAINT "ck_canonical_revision_identity" CHECK("canonical_question_revisions"."identity_status" IN ('incomplete','ready','needs_review')),
	CONSTRAINT "ck_canonical_revision_supersedes" CHECK("canonical_question_revisions"."supersedes_id" IS NULL OR "canonical_question_revisions"."supersedes_id" <> "canonical_question_revisions"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_canonical_revision_number` ON `canonical_question_revisions` (`canonical_question_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_canonical_revision_id` ON `canonical_question_revisions` (`canonical_question_id`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_canonical_revision_hash` ON `canonical_question_revisions` (`normalized_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_canonical_revision_subject_stage` ON `canonical_question_revisions` (`subject`,`education_stage`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `canonical_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`subject` text DEFAULT 'unknown' NOT NULL,
	`status` text DEFAULT 'provisional' NOT NULL,
	`current_revision_id` text,
	`redirect_to_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`redirect_to_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`id`,`current_revision_id`) REFERENCES `canonical_question_revisions`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`scope_id`,`redirect_to_id`) REFERENCES `canonical_questions`(`scope_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_canonical_subject" CHECK("canonical_questions"."subject" IN ('math','english','unknown')),
	CONSTRAINT "ck_canonical_status" CHECK("canonical_questions"."status" IN ('provisional','active','merged','retired')),
	CONSTRAINT "ck_canonical_redirect" CHECK("canonical_questions"."redirect_to_id" IS NULL OR ("canonical_questions"."status" = 'merged' AND "canonical_questions"."redirect_to_id" <> "canonical_questions"."id"))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_canonical_scope` ON `canonical_questions` (`scope_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_canonical_scope_id` ON `canonical_questions` (`scope_id`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_library_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`scope_type` text NOT NULL,
	`kind` text NOT NULL,
	`owner_principal_id` text,
	`ownership_status` text DEFAULT 'legacy_unassigned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_library_scope_type" CHECK("question_library_scopes"."scope_type" IN ('authorized_public','teacher_private','student_private','legacy_private')),
	CONSTRAINT "ck_library_scope_kind" CHECK(("question_library_scopes"."scope_type" = 'authorized_public' AND "question_library_scopes"."kind" = 'shared') OR ("question_library_scopes"."scope_type" <> 'authorized_public' AND "question_library_scopes"."kind" = 'private')),
	CONSTRAINT "ck_library_scope_owner" CHECK("question_library_scopes"."ownership_status" IN ('known','legacy_unassigned') AND ("question_library_scopes"."kind" <> 'private' OR "question_library_scopes"."ownership_status" <> 'known' OR length(trim("question_library_scopes"."owner_principal_id")) > 0 AND "question_library_scopes"."owner_principal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_library_scope_code` ON `question_library_scopes` (`code`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_module_links` (
	`id` text PRIMARY KEY NOT NULL,
	`module_type` text NOT NULL,
	`module_record_id` text NOT NULL,
	`canonical_question_id` text NOT NULL,
	`occurrence_id` text NOT NULL,
	`legacy_student_question_id` integer,
	`legacy_paper_question_id` text,
	`legacy_english_question_id` text,
	`observed_source_hash` text NOT NULL,
	`mapping_revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`canonical_question_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`legacy_student_question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`legacy_paper_question_id`) REFERENCES `paper_questions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`legacy_english_question_id`) REFERENCES `english_questions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`canonical_question_id`,`occurrence_id`) REFERENCES `question_occurrences`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_module_link_type" CHECK("question_module_links"."module_type" IN ('student_question','paper_question','english_question')),
	CONSTRAINT "ck_module_link_revision" CHECK("question_module_links"."mapping_revision" > 0),
	CONSTRAINT "ck_module_link_legacy" CHECK(("question_module_links"."legacy_student_question_id" IS NULL AND "question_module_links"."legacy_paper_question_id" IS NULL AND "question_module_links"."legacy_english_question_id" IS NULL) OR ("question_module_links"."module_type" = 'student_question' AND "question_module_links"."legacy_student_question_id" IS NOT NULL AND "question_module_links"."module_record_id" = CAST("question_module_links"."legacy_student_question_id" AS TEXT) AND "question_module_links"."legacy_paper_question_id" IS NULL AND "question_module_links"."legacy_english_question_id" IS NULL) OR ("question_module_links"."module_type" = 'paper_question' AND "question_module_links"."legacy_paper_question_id" IS NOT NULL AND "question_module_links"."module_record_id" = "question_module_links"."legacy_paper_question_id" AND "question_module_links"."legacy_student_question_id" IS NULL AND "question_module_links"."legacy_english_question_id" IS NULL) OR ("question_module_links"."module_type" = 'english_question' AND "question_module_links"."legacy_english_question_id" IS NOT NULL AND "question_module_links"."module_record_id" = "question_module_links"."legacy_english_question_id" AND "question_module_links"."legacy_student_question_id" IS NULL AND "question_module_links"."legacy_paper_question_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_module_record` ON `question_module_links` (`module_type`,`module_record_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_module_canonical` ON `question_module_links` (`canonical_question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_module_student_question` ON `question_module_links` (`legacy_student_question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_module_paper_question` ON `question_module_links` (`legacy_paper_question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_module_english_question` ON `question_module_links` (`legacy_english_question_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_question_id` text NOT NULL,
	`content_revision_id` text,
	`source_document_id` text NOT NULL,
	`source_type` text NOT NULL,
	`occurrence_key` text NOT NULL,
	`question_number` text,
	`page` integer,
	`source_locator_json` text DEFAULT '{}' NOT NULL,
	`image_key` text,
	`public_image_path` text,
	`original_filename` text,
	`raw_text` text DEFAULT '' NOT NULL,
	`occurrence_hash` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`parent_occurrence_id` text,
	`mapping_status` text DEFAULT 'provisional' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`canonical_question_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_occurrence_id`) REFERENCES `question_occurrences`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`canonical_question_id`,`content_revision_id`) REFERENCES `canonical_question_revisions`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_type`,`source_document_id`) REFERENCES `source_documents`(`source_type`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_occurrence_page" CHECK("question_occurrences"."page" IS NULL OR "question_occurrences"."page" > 0),
	CONSTRAINT "ck_occurrence_locator" CHECK(json_valid("question_occurrences"."source_locator_json") AND json_type("question_occurrences"."source_locator_json") = 'object'),
	CONSTRAINT "ck_occurrence_metadata" CHECK(json_valid("question_occurrences"."metadata") AND json_type("question_occurrences"."metadata") = 'object'),
	CONSTRAINT "ck_occurrence_status" CHECK("question_occurrences"."mapping_status" IN ('provisional','confirmed','detached')),
	CONSTRAINT "ck_occurrence_parent" CHECK("question_occurrences"."parent_occurrence_id" IS NULL OR "question_occurrences"."parent_occurrence_id" <> "question_occurrences"."id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_occurrence_canonical` ON `question_occurrences` (`canonical_question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_occurrence_source_key` ON `question_occurrences` (`source_document_id`,`occurrence_key`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_occurrence_canonical_id` ON `question_occurrences` (`canonical_question_id`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`source_type` text NOT NULL,
	`title` text NOT NULL,
	`math_paper_id` text,
	`english_paper_id` text,
	`legacy_source_key` text,
	`file_storage` text DEFAULT 'none' NOT NULL,
	`storage_key` text,
	`original_filename` text,
	`mime_type` text,
	`file_hash` text,
	`source_url` text,
	`license` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`math_paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`english_paper_id`) REFERENCES `english_papers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_source_document_type" CHECK("source_documents"."source_type" IN ('math_paper','english_paper','workbook','student_upload','student_archive','other')),
	CONSTRAINT "ck_source_document_paper" CHECK(("source_documents"."math_paper_id" IS NULL OR ("source_documents"."english_paper_id" IS NULL AND "source_documents"."source_type" = 'math_paper')) AND ("source_documents"."english_paper_id" IS NULL OR ("source_documents"."math_paper_id" IS NULL AND "source_documents"."source_type" = 'english_paper'))),
	CONSTRAINT "ck_source_document_storage" CHECK("source_documents"."file_storage" IN ('r2','public','external','none') AND ("source_documents"."file_storage" = 'none' OR ("source_documents"."storage_key" IS NOT NULL AND length(trim("source_documents"."storage_key")) > 0))),
	CONSTRAINT "ck_source_document_metadata" CHECK(json_valid("source_documents"."metadata") AND json_type("source_documents"."metadata") = 'object')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_document_scope` ON `source_documents` (`scope_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_document_hash` ON `source_documents` (`file_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_source_math_paper` ON `source_documents` (`math_paper_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_source_english_paper` ON `source_documents` (`english_paper_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_source_document_type_id` ON `source_documents` (`source_type`,`id`);