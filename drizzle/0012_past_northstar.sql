CREATE TABLE `question_explanations` (
	`question_id` integer PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source_text` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`origin` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
