ALTER TABLE `questions` ADD `image_hash` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `submission_id` text;--> statement-breakpoint
CREATE INDEX `idx_questions_hash` ON `questions` (`student_id`,`image_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_question_submission` ON `questions` (`submission_id`);