CREATE TABLE `error_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`knowledge_point_code` text NOT NULL,
	`ai_hypothesis` text,
	`teacher_decision` text NOT NULL,
	`error_code` text,
	`error_label` text,
	`evidence_excerpt` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `student_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_error_evidence_attempt` ON `error_evidence` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `student_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` integer NOT NULL,
	`inquiry_id` text,
	`occurred_at` text NOT NULL,
	`stage` text NOT NULL,
	`response_text` text NOT NULL,
	`correctness` text NOT NULL,
	`support_level` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_student_attempts_question` ON `student_attempts` (`question_id`,`occurred_at`);