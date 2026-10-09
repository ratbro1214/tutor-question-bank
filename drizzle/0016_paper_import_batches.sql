CREATE TABLE `paper_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_import_batch_status" CHECK("paper_import_batches"."status" IN ('processing','completed','completed_with_errors','failed'))
);
--> statement-breakpoint
CREATE TABLE `paper_import_files` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`filename` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`paper_id` text,
	`source_document_id` text,
	`error` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `paper_import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_import_file_status" CHECK("paper_import_files"."status" IN ('pending','processing','completed','needs_review','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_import_file_position` ON `paper_import_files` (`batch_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_paper_import_files_batch` ON `paper_import_files` (`batch_id`);--> statement-breakpoint
CREATE TABLE `paper_import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`paper_question_id` text,
	`normalized_text` text DEFAULT '' NOT NULL,
	`text_hash` text,
	`status` text NOT NULL,
	`canonical_id` text,
	`duplicate_canonical_id` text,
	`duplicate_item_id` text,
	`observed_hash` text,
	`reason` text DEFAULT '' NOT NULL,
	`decision` text,
	FOREIGN KEY (`file_id`) REFERENCES `paper_import_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paper_question_id`) REFERENCES `paper_questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`duplicate_canonical_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`duplicate_item_id`) REFERENCES `paper_import_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_import_item_status" CHECK("paper_import_items"."status" IN ('NEW','DUPLICATE','NEEDS_REVIEW','FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_import_item_number` ON `paper_import_items` (`file_id`,`question_number`);--> statement-breakpoint
CREATE INDEX `idx_paper_import_items_hash` ON `paper_import_items` (`text_hash`);