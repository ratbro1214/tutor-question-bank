ALTER TABLE `error_evidence` ADD `diagnosis_status` text DEFAULT '错因未知' NOT NULL;--> statement-breakpoint
ALTER TABLE `error_evidence` ADD `candidate_error_codes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `error_evidence` ADD `diagnosis_basis` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_attempts` ADD `evidence_level` text DEFAULT '仅有最终答案' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_attempts` ADD `evidence_source` text DEFAULT '其他' NOT NULL;