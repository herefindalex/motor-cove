PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sales` (
	`deployment_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`collection_address` text NOT NULL,
	`token_id` text NOT NULL,
	`seller` text NOT NULL,
	`allowed_buyer` text,
	`buyer` text,
	`price_wei` text NOT NULL,
	`status` text NOT NULL,
	`funded_at` integer,
	`expires_at` integer,
	`created_block` integer NOT NULL,
	`updated_block` integer NOT NULL,
	`last_event_block_hash` text NOT NULL,
	`last_event_log_index` integer NOT NULL,
	`token_reclaimed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`deployment_id`, `sale_id`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_id_check" CHECK(length("sale_id") BETWEEN 1 AND 78
    AND ("sale_id" = '0' OR substr("sale_id", 1, 1) BETWEEN '1' AND '9')
    AND "sale_id" NOT GLOB '*[^0-9]*'
    AND (length("sale_id") < 78 OR "sale_id" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "sale_token_id_check" CHECK(length("token_id") BETWEEN 1 AND 78
    AND ("token_id" = '0' OR substr("token_id", 1, 1) BETWEEN '1' AND '9')
    AND "token_id" NOT GLOB '*[^0-9]*'
    AND (length("token_id") < 78 OR "token_id" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "sale_price_check" CHECK("price_wei" <> '0' AND length("price_wei") BETWEEN 1 AND 78
    AND ("price_wei" = '0' OR substr("price_wei", 1, 1) BETWEEN '1' AND '9')
    AND "price_wei" NOT GLOB '*[^0-9]*'
    AND (length("price_wei") < 78 OR "price_wei" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "sale_status_check" CHECK("__new_sales"."status" IN ('LISTED','FUNDED','COMPLETED','CANCELLED','EXPIRED')),
	CONSTRAINT "sale_collection_check" CHECK(length("collection_address") = 42 AND substr("collection_address", 1, 2) = '0x' AND lower("collection_address") = "collection_address" AND substr("collection_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "sale_seller_check" CHECK(length("seller") = 42 AND substr("seller", 1, 2) = '0x' AND lower("seller") = "seller" AND substr("seller", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "sale_allowed_buyer_check" CHECK("__new_sales"."allowed_buyer" IS NULL OR (length("allowed_buyer") = 42 AND substr("allowed_buyer", 1, 2) = '0x' AND lower("allowed_buyer") = "allowed_buyer" AND substr("allowed_buyer", 3) NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "sale_buyer_check" CHECK("__new_sales"."buyer" IS NULL OR (length("__new_sales"."buyer")=42 AND substr("__new_sales"."buyer",1,2)='0x' AND lower("__new_sales"."buyer")="__new_sales"."buyer" AND substr("__new_sales"."buyer",3) NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "sale_created_block_check" CHECK("created_block" >= 0 AND "created_block" <= 9007199254740991),
	CONSTRAINT "sale_updated_block_check" CHECK("updated_block" >= 0 AND "updated_block" <= 9007199254740991),
	CONSTRAINT "sale_log_index_check" CHECK("last_event_log_index" >= 0 AND "last_event_log_index" <= 9007199254740991)
);
--> statement-breakpoint
INSERT INTO `__new_sales`("deployment_id", "sale_id", "collection_address", "token_id", "seller", "allowed_buyer", "buyer", "price_wei", "status", "funded_at", "expires_at", "created_block", "updated_block", "last_event_block_hash", "last_event_log_index", "token_reclaimed") SELECT "deployment_id", "sale_id", "collection_address", "token_id", "seller", NULL, "buyer", "price_wei", "status", "funded_at", "expires_at", "created_block", "updated_block", "last_event_block_hash", "last_event_log_index", "token_reclaimed" FROM `sales`;--> statement-breakpoint
DROP TABLE `sales`;--> statement-breakpoint
ALTER TABLE `__new_sales` RENAME TO `sales`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sales_status` ON `sales` (`deployment_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_indexer_runtime_status` (
	`deployment_id` text PRIMARY KEY NOT NULL,
	`projection_status` text NOT NULL,
	`recovery_reason` text,
	`worker_heartbeat_at` text,
	`last_rpc_success_at` text,
	`last_observed_head` integer,
	`last_eligible_head` integer,
	`last_head_advanced_at` text,
	`last_observed_at` text,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runtime_projection_status_check" CHECK("__new_indexer_runtime_status"."projection_status" IN ('UNINITIALIZED','SYNCING','CURRENT','STALE','REBUILD_REQUIRED','REBUILDING','RECOVERY_REQUIRED')),
	CONSTRAINT "runtime_head_check" CHECK("__new_indexer_runtime_status"."last_observed_head" IS NULL OR ("last_observed_head" >= 0 AND "last_observed_head" <= 9007199254740991)),
	CONSTRAINT "runtime_eligible_head_check" CHECK("__new_indexer_runtime_status"."last_eligible_head" IS NULL OR ("last_eligible_head" >= 0 AND "last_eligible_head" <= 9007199254740991))
);
--> statement-breakpoint
INSERT INTO `__new_indexer_runtime_status`("deployment_id", "projection_status", "recovery_reason", "worker_heartbeat_at", "last_rpc_success_at", "last_observed_head", "last_eligible_head", "last_head_advanced_at", "last_observed_at") SELECT "deployment_id", "projection_status", "recovery_reason", "worker_heartbeat_at", "last_rpc_success_at", "last_observed_head", "last_observed_head", NULL, "last_observed_at" FROM `indexer_runtime_status`;--> statement-breakpoint
DROP TABLE `indexer_runtime_status`;--> statement-breakpoint
ALTER TABLE `__new_indexer_runtime_status` RENAME TO `indexer_runtime_status`;