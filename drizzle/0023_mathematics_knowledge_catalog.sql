CREATE TABLE `knowledge_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`knowledge_review_status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_knowledge_edge_identity" CHECK(length(trim("knowledge_edges"."id"))>0),
	CONSTRAINT "ck_knowledge_edge_self" CHECK("knowledge_edges"."source_id"<>"knowledge_edges"."target_id"),
	CONSTRAINT "ck_knowledge_edge_type" CHECK("knowledge_edges"."relation_type" IN ('belongs_to','prerequisite','related','contains','advanced')),
	CONSTRAINT "ck_knowledge_edge_review" CHECK("knowledge_edges"."knowledge_review_status" IN ('pending','approved') AND ("knowledge_edges"."knowledge_review_status"='pending' OR ("knowledge_edges"."reviewed_by" IS NOT NULL AND length(trim("knowledge_edges"."reviewed_by"))>0 AND "knowledge_edges"."reviewed_at" IS NOT NULL AND length(trim("knowledge_edges"."reviewed_at"))>0))),
	CONSTRAINT "ck_knowledge_edge_source" CHECK("knowledge_edges"."source" IN ('manual','seed','ai'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_knowledge_edge` ON `knowledge_edges` (`source_id`,`target_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_edge_out` ON `knowledge_edges` (`source_id`,`knowledge_review_status`,`relation_type`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_edge_in` ON `knowledge_edges` (`target_id`,`knowledge_review_status`,`relation_type`);--> statement-breakpoint
CREATE TABLE `knowledge_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`subject` text DEFAULT 'math' NOT NULL,
	`stage` text DEFAULT 'senior_high' NOT NULL,
	`curriculum_version` text DEFAULT 'general-v1' NOT NULL,
	`level` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`difficulty` integer,
	`importance` text,
	`exam_frequency` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`knowledge_review_status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_knowledge_node_identity" CHECK(length(trim("knowledge_nodes"."id"))>0 AND length(trim("knowledge_nodes"."code"))>0 AND length(trim("knowledge_nodes"."name"))>0 AND length(trim("knowledge_nodes"."subject"))>0 AND length(trim("knowledge_nodes"."stage"))>0 AND length(trim("knowledge_nodes"."curriculum_version"))>0),
	CONSTRAINT "ck_knowledge_node_level" CHECK("knowledge_nodes"."level" IN (1,2,3,4,5)),
	CONSTRAINT "ck_knowledge_node_difficulty" CHECK("knowledge_nodes"."difficulty" IS NULL OR ("knowledge_nodes"."difficulty" BETWEEN 1 AND 5 AND typeof("knowledge_nodes"."difficulty")='integer')),
	CONSTRAINT "ck_knowledge_node_importance" CHECK("knowledge_nodes"."importance" IS NULL OR "knowledge_nodes"."importance" IN ('low','medium','high')),
	CONSTRAINT "ck_knowledge_node_frequency" CHECK("knowledge_nodes"."exam_frequency" IS NULL OR "knowledge_nodes"."exam_frequency" IN ('low','medium','high')),
	CONSTRAINT "ck_knowledge_node_metadata" CHECK(json_valid("knowledge_nodes"."metadata") AND json_type("knowledge_nodes"."metadata")='object'),
	CONSTRAINT "ck_knowledge_node_review" CHECK("knowledge_nodes"."knowledge_review_status" IN ('pending','approved') AND ("knowledge_nodes"."knowledge_review_status"='pending' OR ("knowledge_nodes"."reviewed_by" IS NOT NULL AND length(trim("knowledge_nodes"."reviewed_by"))>0 AND "knowledge_nodes"."reviewed_at" IS NOT NULL AND length(trim("knowledge_nodes"."reviewed_at"))>0))),
	CONSTRAINT "ck_knowledge_node_source" CHECK("knowledge_nodes"."source" IN ('manual','seed','ai'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_knowledge_node_code` ON `knowledge_nodes` (`subject`,`stage`,`curriculum_version`,`code`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_node_catalog` ON `knowledge_nodes` (`subject`,`stage`,`curriculum_version`,`knowledge_review_status`,`level`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_node_name` ON `knowledge_nodes` (`name`,`stage`);--> statement-breakpoint
CREATE TABLE `question_knowledge_relation` (
	`question_id` text NOT NULL,
	`knowledge_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`role` text DEFAULT 'secondary' NOT NULL,
	`knowledge_review_status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`question_id`, `knowledge_id`),
	FOREIGN KEY (`knowledge_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`scope_id`,`question_id`) REFERENCES `canonical_questions`(`scope_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_question_knowledge_weight" CHECK("question_knowledge_relation"."weight">0 AND "question_knowledge_relation"."weight"<=1),
	CONSTRAINT "ck_question_knowledge_role" CHECK("question_knowledge_relation"."role" IN ('main','secondary','exam_point','question_type')),
	CONSTRAINT "ck_question_knowledge_review" CHECK("question_knowledge_relation"."knowledge_review_status" IN ('pending','approved') AND ("question_knowledge_relation"."knowledge_review_status"='pending' OR ("question_knowledge_relation"."reviewed_by" IS NOT NULL AND length(trim("question_knowledge_relation"."reviewed_by"))>0 AND "question_knowledge_relation"."reviewed_at" IS NOT NULL AND length(trim("question_knowledge_relation"."reviewed_at"))>0))),
	CONSTRAINT "ck_question_knowledge_source" CHECK("question_knowledge_relation"."source" IN ('manual','seed','ai'))
);
--> statement-breakpoint
CREATE INDEX `idx_question_knowledge_lookup` ON `question_knowledge_relation` (`scope_id`,`knowledge_id`,`knowledge_review_status`);