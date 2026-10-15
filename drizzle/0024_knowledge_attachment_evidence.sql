CREATE TABLE `knowledge_relation_evidence` (
	`question_id` text NOT NULL,
	`knowledge_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`analysis_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`question_id`, `knowledge_id`),
	FOREIGN KEY (`question_id`,`knowledge_id`) REFERENCES `question_knowledge_relation`(`question_id`,`knowledge_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`,`revision_id`) REFERENCES `canonical_question_revisions`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_evidence_revision` ON `knowledge_relation_evidence` (`question_id`,`revision_id`);