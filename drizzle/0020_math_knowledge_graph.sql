CREATE TABLE `math_graph_locks` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `math_knowledge_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`relation_key` text NOT NULL,
	`type` text NOT NULL,
	`from_knowledge` integer,
	`to_knowledge` integer,
	`method_id` text,
	`canonical_id` text,
	`revision_id` text,
	`review_id` text,
	`revision` integer NOT NULL,
	`operation_id` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`reviewer` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_knowledge`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_knowledge`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `paper_solution_reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`method_id`,`owner_id`,`scope_id`) REFERENCES `math_methods`(`id`,`owner_id`,`scope_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`,`canonical_id`) REFERENCES `canonical_questions`(`scope_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_id`,`revision_id`) REFERENCES `canonical_question_revisions`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_math_relation_status" CHECK("math_knowledge_relations"."status" IN ('candidate','approved','rejected')),
	CONSTRAINT "ck_math_relation_revision" CHECK("math_knowledge_relations"."revision">0),
	CONSTRAINT "ck_math_relation_source" CHECK(json_valid("math_knowledge_relations"."source")),
	CONSTRAINT "ck_math_relation_review" CHECK("math_knowledge_relations"."status"<>'approved' OR "math_knowledge_relations"."reviewer" IS NOT NULL),
	CONSTRAINT "ck_math_relation_endpoints" CHECK(("math_knowledge_relations"."type" IN ('contains','prerequisite','related') AND "math_knowledge_relations"."from_knowledge" IS NOT NULL AND "math_knowledge_relations"."to_knowledge" IS NOT NULL AND "math_knowledge_relations"."from_knowledge"<>"math_knowledge_relations"."to_knowledge" AND "math_knowledge_relations"."method_id" IS NULL AND "math_knowledge_relations"."canonical_id" IS NULL AND "math_knowledge_relations"."revision_id" IS NULL AND "math_knowledge_relations"."review_id" IS NULL) OR ("math_knowledge_relations"."type"='applies' AND "math_knowledge_relations"."from_knowledge" IS NULL AND "math_knowledge_relations"."to_knowledge" IS NOT NULL AND "math_knowledge_relations"."method_id" IS NOT NULL AND "math_knowledge_relations"."canonical_id" IS NULL AND "math_knowledge_relations"."revision_id" IS NULL AND "math_knowledge_relations"."review_id" IS NULL) OR ("math_knowledge_relations"."type"='uses' AND "math_knowledge_relations"."from_knowledge" IS NULL AND "math_knowledge_relations"."to_knowledge" IS NULL AND "math_knowledge_relations"."method_id" IS NOT NULL AND "math_knowledge_relations"."canonical_id" IS NOT NULL AND "math_knowledge_relations"."revision_id" IS NOT NULL AND "math_knowledge_relations"."review_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_math_relation_identity` ON `math_knowledge_relations` (`owner_id`,`scope_id`,`relation_key`);--> statement-breakpoint
CREATE INDEX `idx_math_relation_from` ON `math_knowledge_relations` (`owner_id`,`scope_id`,`from_knowledge`,`status`);--> statement-breakpoint
CREATE INDEX `idx_math_relation_to` ON `math_knowledge_relations` (`owner_id`,`scope_id`,`to_knowledge`,`status`);--> statement-breakpoint
CREATE INDEX `idx_math_relation_method` ON `math_knowledge_relations` (`method_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_math_relation_question` ON `math_knowledge_relations` (`canonical_id`,`revision_id`,`status`);--> statement-breakpoint
CREATE TABLE `math_method_versions` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`method_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`method_id`) REFERENCES `math_methods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_math_method_version` ON `math_method_versions` (`method_id`,`revision`);--> statement-breakpoint
CREATE TABLE `math_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`revision` integer NOT NULL,
	`operation_id` text NOT NULL,
	`status` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`reviewer` text,
	`merged_into` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `question_library_scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merged_into`) REFERENCES `math_methods`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_math_method_status" CHECK("math_methods"."status" IN ('candidate','approved','rejected')),
	CONSTRAINT "ck_math_method_json" CHECK(json_valid("math_methods"."content") AND json_valid("math_methods"."source")),
	CONSTRAINT "ck_math_method_revision" CHECK("math_methods"."revision">0),
	CONSTRAINT "ck_math_method_review" CHECK("math_methods"."status"<>'approved' OR "math_methods"."reviewer" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_math_method_owner_scope` ON `math_methods` (`id`,`owner_id`,`scope_id`);--> statement-breakpoint
CREATE INDEX `idx_math_method_scope_status` ON `math_methods` (`owner_id`,`scope_id`,`status`);--> statement-breakpoint
CREATE TABLE `math_relation_versions` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`relation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`relation_id`) REFERENCES `math_knowledge_relations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_math_relation_version` ON `math_relation_versions` (`relation_id`,`revision`);
--> statement-breakpoint
-- Database guards run inside the D1 write batch, including concurrent approvals.
CREATE TRIGGER math_relation_cycle_insert BEFORE INSERT ON math_knowledge_relations
WHEN NEW.type IN ('contains','prerequisite') AND NEW.status <> 'rejected'
BEGIN
 SELECT RAISE(ABORT,'graph_cycle') WHERE EXISTS (
  WITH RECURSIVE reach(id) AS (
   SELECT NEW.to_knowledge UNION
   SELECT r.to_knowledge FROM math_knowledge_relations r JOIN reach ON r.from_knowledge=reach.id
   WHERE r.owner_id=NEW.owner_id AND r.scope_id=NEW.scope_id AND r.type=NEW.type AND r.status<>'rejected'
  ) SELECT 1 FROM reach WHERE id=NEW.from_knowledge
 );
END;
--> statement-breakpoint
CREATE TRIGGER math_relation_cycle_update BEFORE UPDATE ON math_knowledge_relations
WHEN NEW.type IN ('contains','prerequisite') AND NEW.status <> 'rejected'
BEGIN
 SELECT RAISE(ABORT,'graph_cycle') WHERE EXISTS (
  WITH RECURSIVE reach(id) AS (
   SELECT NEW.to_knowledge UNION
   SELECT r.to_knowledge FROM math_knowledge_relations r JOIN reach ON r.from_knowledge=reach.id
   WHERE r.id<>NEW.id AND r.owner_id=NEW.owner_id AND r.scope_id=NEW.scope_id AND r.type=NEW.type AND r.status<>'rejected'
  ) SELECT 1 FROM reach WHERE id=NEW.from_knowledge
 );
END;
