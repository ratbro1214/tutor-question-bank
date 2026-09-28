CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_inquiries_question` ON `inquiries` (`question_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `question_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` integer NOT NULL,
	`related_id` integer NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_relation` ON `question_relations` (`question_id`,`related_id`,`kind`);--> statement-breakpoint
CREATE TABLE `review_results` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`outcome` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review_completion` ON `review_results` (`review_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`created_at` text NOT NULL,
	`due_at` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teaching_records` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`methods` text DEFAULT '[]' NOT NULL,
	`outcome` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`supersedes_id` text,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Historical uploads do not prove a student asked a question. No synthetic inquiries are backfilled.
