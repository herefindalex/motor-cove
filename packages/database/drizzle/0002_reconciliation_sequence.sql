PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reconciliation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`run_sequence` integer NOT NULL,
	`comparison` text NOT NULL,
	`freshness` text NOT NULL,
	`block_number` integer,
	`block_hash` text,
	`projector_version` text NOT NULL,
	`projection_build_id` text NOT NULL,
	`log_scope_hash` text NOT NULL,
	`scope_json` text NOT NULL,
	`differences_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reconciliation_run_sequence_positive" CHECK("__new_reconciliation_runs"."run_sequence" > 0),
	CONSTRAINT "reconciliation_comparison_check" CHECK("__new_reconciliation_runs"."comparison" IN ('MATCH','MISMATCH','UNVERIFIABLE')),
	CONSTRAINT "reconciliation_freshness_check" CHECK("__new_reconciliation_runs"."freshness" IN ('CURRENT','PROJECTION_LAGGING','HEAD_UNKNOWN'))
);
--> statement-breakpoint
-- Legacy reports have no durable publication sequence. Preserve their available physical
-- insertion order within each deployment once; subsequent reports use explicit sequence values.
INSERT INTO `__new_reconciliation_runs`("id", "deployment_id", "run_sequence", "comparison", "freshness", "block_number", "block_hash", "projector_version", "projection_build_id", "log_scope_hash", "scope_json", "differences_json", "created_at") SELECT "id", "deployment_id", ROW_NUMBER() OVER (PARTITION BY "deployment_id" ORDER BY rowid), "comparison", "freshness", "block_number", "block_hash", "projector_version", "projection_build_id", "log_scope_hash", "scope_json", "differences_json", "created_at" FROM `reconciliation_runs`;--> statement-breakpoint
DROP TABLE `reconciliation_runs`;--> statement-breakpoint
ALTER TABLE `__new_reconciliation_runs` RENAME TO `reconciliation_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_deployment_sequence_unique` ON `reconciliation_runs` (`deployment_id`,`run_sequence`);
