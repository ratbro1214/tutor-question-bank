CREATE TABLE `lesson_plan_questions` (
	`version_id` text NOT NULL,
	`position` integer NOT NULL,
	`canonical_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`purpose` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `lesson_plan_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`canonical_id`,`revision_id`) REFERENCES `canonical_question_revisions`(`canonical_question_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_lesson_question_position" CHECK("lesson_plan_questions"."position" >= 0),
	CONSTRAINT "ck_lesson_question_purpose" CHECK("lesson_plan_questions"."purpose" IN ('导入','讲解','练习','检测'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lesson_question_position` ON `lesson_plan_questions` (`version_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lesson_question_identity` ON `lesson_plan_questions` (`version_id`,`canonical_id`);--> statement-breakpoint
CREATE TABLE `lesson_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `lesson_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_lesson_version_revision" CHECK("lesson_plan_versions"."revision" > 0),
	CONSTRAINT "ck_lesson_version_status" CHECK("lesson_plan_versions"."status" IN ('draft','ready','archived')),
	CONSTRAINT "ck_lesson_version_content" CHECK(json_valid("lesson_plan_versions"."content") AND json_type("lesson_plan_versions"."content") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lesson_version_number` ON `lesson_plan_versions` (`plan_id`,`revision`);--> statement-breakpoint
CREATE TABLE `lesson_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`topic` text NOT NULL,
	`stage` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer NOT NULL,
	`current_version_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "ck_lesson_owner" CHECK(length(trim("lesson_plans"."owner_id")) > 0),
	CONSTRAINT "ck_lesson_revision" CHECK("lesson_plans"."revision" > 0),
	CONSTRAINT "ck_lesson_status" CHECK("lesson_plans"."status" IN ('draft','ready','archived')),
	CONSTRAINT "ck_lesson_content" CHECK(json_valid("lesson_plans"."content") AND json_type("lesson_plans"."content") = 'object')
);
--> statement-breakpoint
CREATE INDEX `idx_lesson_owner_updated` ON `lesson_plans` (`owner_id`,`updated_at`);