CREATE TABLE `paper_solution_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`entry_key` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `paper_solution_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_solution_entry_key` ON `paper_solution_entries` (`source_id`,`entry_key`);--> statement-breakpoint
CREATE TABLE `paper_solution_match_history` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`revision` integer NOT NULL,
	`operation_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`reviewer` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `paper_solution_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_solution_match_revision` ON `paper_solution_match_history` (`entry_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_solution_match_operation` ON `paper_solution_match_history` (`entry_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `paper_solution_matches` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`question_id` text,
	`status` text NOT NULL,
	`proposal` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`question_snapshot` text DEFAULT '' NOT NULL,
	`teacher_text` text,
	`reviewer` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `paper_solution_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `paper_questions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_solution_match_status" CHECK("paper_solution_matches"."status" IN ('MATCHED','NEEDS_REVIEW','UNMATCHED','CONFIRMED'))
);
--> statement-breakpoint
CREATE TABLE `paper_solution_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`match_revision` integer NOT NULL,
	`operation_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`input` text NOT NULL,
	`result` text,
	`teacher_result` text,
	`teacher_status` text DEFAULT 'pending' NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`elapsed_ms` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `paper_solution_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_solution_review_status" CHECK("paper_solution_reviews"."status" IN ('quality_pending','methods_pending','completed','failed')),
	CONSTRAINT "ck_solution_review_teacher" CHECK("paper_solution_reviews"."teacher_status" IN ('pending','accepted','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_solution_review_operation` ON `paper_solution_reviews` (`entry_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `paper_solution_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`filename` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_hash` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`version` text NOT NULL,
	`pages` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `paper_import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_solution_source_status" CHECK("paper_solution_sources"."status" IN ('uploaded','ready','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_solution_source_file` ON `paper_solution_sources` (`paper_id`,`owner_id`,`file_hash`);