CREATE TABLE `knowledge_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`chapter_code` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_knowledge_points_code` ON `knowledge_points` (`code`);--> statement-breakpoint
CREATE TABLE `question_knowledge_points` (
	`question_id` integer NOT NULL,
	`knowledge_point_id` integer NOT NULL,
	PRIMARY KEY(`question_id`, `knowledge_point_id`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_question_kp_knowledge_point` ON `question_knowledge_points` (`knowledge_point_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`image_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`image_mime_type` text NOT NULL,
	`extracted_question` text NOT NULL,
	`chapter_code` text NOT NULL,
	`chapter_name` text NOT NULL,
	`question_type` text NOT NULL,
	`difficulty` text NOT NULL,
	`ai_classification` text NOT NULL,
	`teacher_confirmed_classification` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_questions_student_created` ON `questions` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_questions_chapter` ON `questions` (`chapter_code`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`grade` text DEFAULT '初中' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_students_name` ON `students` (`name`);