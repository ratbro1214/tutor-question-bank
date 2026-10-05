CREATE TABLE `paper_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`regions` text NOT NULL,
	`image_key` text NOT NULL,
	`question_text` text DEFAULT '' NOT NULL,
	`classification` text,
	`explanation` text,
	`model` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`generation_token` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_paper_question_number` ON `paper_questions` (`paper_id`,`question_number`);--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`original_filename` text NOT NULL,
	`source_key` text NOT NULL,
	`source_type` text NOT NULL,
	`file_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_paper_hash` ON `papers` (`file_hash`);