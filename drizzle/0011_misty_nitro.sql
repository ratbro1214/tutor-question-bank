CREATE TABLE `intervention_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` integer NOT NULL,
	`source_attempt_id` text NOT NULL,
	`knowledge_point_code` text NOT NULL,
	`goal` text NOT NULL,
	`strategy` text NOT NULL,
	`check_instruction` text NOT NULL,
	`due_at` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`teaching_record_id` text,
	`implemented_at` text,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_attempt_id`) REFERENCES `student_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teaching_record_id`) REFERENCES `teaching_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_intervention_question` ON `intervention_plans` (`question_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `student_attempts` ADD `intervention_plan_id` text REFERENCES intervention_plans(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `student_attempts` ADD `check_question` text DEFAULT '' NOT NULL;
