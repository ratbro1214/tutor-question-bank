CREATE TABLE `english_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`passage_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`pipeline` text NOT NULL,
	`version` text NOT NULL,
	`payload` text NOT NULL,
	`generated_at` text NOT NULL,
	FOREIGN KEY (`passage_id`) REFERENCES `english_passages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `english_answer_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`independence_group` text NOT NULL,
	`raw_answer` text NOT NULL,
	`normalized_answer` text NOT NULL,
	`method` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `english_questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `english_artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `english_answers` (
	`question_id` text PRIMARY KEY NOT NULL,
	`answer` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`question_id`) REFERENCES `english_questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `english_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_url` text NOT NULL,
	`source_page` text NOT NULL,
	`source_name` text NOT NULL,
	`source_tier` text NOT NULL,
	`sha256` text NOT NULL,
	`filename` text NOT NULL,
	`public_path` text,
	`mime` text,
	`bytes` integer NOT NULL,
	`captured_at` text NOT NULL,
	`license` text,
	FOREIGN KEY (`paper_id`) REFERENCES `english_papers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `english_options` (
	`question_id` text NOT NULL,
	`label` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `english_questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `english_option_question_label` ON `english_options` (`question_id`,`label`);--> statement-breakpoint
CREATE TABLE `english_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`volume` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`listening_included` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `english_paper_year_volume` ON `english_papers` (`year`,`volume`);--> statement-breakpoint
CREATE TABLE `english_passages` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`label` text NOT NULL,
	`text` text NOT NULL,
	`artifact_id` text NOT NULL,
	`source_locator` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `english_sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `english_artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `english_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`passage_id` text,
	`number` integer NOT NULL,
	`type` text NOT NULL,
	`stem` text NOT NULL,
	`score` text,
	FOREIGN KEY (`section_id`) REFERENCES `english_sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`passage_id`) REFERENCES `english_passages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `english_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `english_papers`(`id`) ON UPDATE no action ON DELETE no action
);
