CREATE TABLE `canonical_question_explanations` (
	`content_revision_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source_text` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`origin` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`content_revision_id`) REFERENCES `canonical_question_revisions`(`id`) ON UPDATE no action ON DELETE restrict
);
