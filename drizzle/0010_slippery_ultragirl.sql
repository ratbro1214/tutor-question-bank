CREATE TABLE `diagnostic_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`position` integer NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `diagnostic_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_diagnostic_items_position` ON `diagnostic_items` (`plan_id`,`position`);--> statement-breakpoint
ALTER TABLE `student_attempts` ADD `diagnostic_item_id` text REFERENCES diagnostic_items(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `student_attempts` ADD `target_attempt_id` text REFERENCES student_attempts(id) ON DELETE SET NULL;--> statement-breakpoint
-- Legacy plans keep their original content; only materialize their two items.
INSERT INTO diagnostic_items(id, plan_id, position, content)
SELECT p.id || ':' || (CAST(j.key AS INTEGER) + 1), p.id, CAST(j.key AS INTEGER) + 1, j.value
FROM diagnostic_plans p, json_each(CASE WHEN json_valid(p.content) THEN p.content ELSE '{}' END, '$.questions') j
WHERE CAST(j.key AS INTEGER) IN (0, 1) AND j.type = 'object';
