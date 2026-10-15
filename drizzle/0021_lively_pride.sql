CREATE TABLE `math_library_trash` (
	`canonical_question_id` text PRIMARY KEY NOT NULL,
	`deleted_by` text NOT NULL,
	`deleted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`canonical_question_id`) REFERENCES `canonical_questions`(`id`) ON UPDATE no action ON DELETE restrict
);
