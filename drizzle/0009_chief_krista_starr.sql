CREATE TABLE `diagnostic_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` integer NOT NULL,
	`source_attempt_id` text NOT NULL,
	`action_id` text NOT NULL,
	`knowledge_point_code` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`generation_mode` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_attempt_id`) REFERENCES `student_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_plans_question` ON `diagnostic_plans` (`question_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_plans_status` ON `diagnostic_plans` (`status`);