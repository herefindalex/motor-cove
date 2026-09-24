# 生成的資料庫架構參考

[English](schema-reference.generated.md) · [简体中文](schema-reference.generated.zh-CN.md)

> 本頁翻譯自根據可執行 Drizzle migration 歷史產生的[英文 schema 參考](schema-reference.generated.md)。執行 `pnpm docs:generate` 更新英文原文後，請同步檢查此譯本。

## 模式合約

- 合約版本：`1`
- 遷移包摘要：`f8e66eb86ab23d0d723ce0137bb07b7f004f0764e968db57efa2ef1075e311cd`
- 架構指紋：`d1e8b464adc8e505e654a0f16b6519bc370d126a5808bcb088a80726706c442d`
- 架構來源摘要：`566b94074412bb9090debbeddc96f6b83dd92cfca44d49e7801f59c6789331e8`
- 所需的投影器版本：`2`
- 儲存庫管理的表：13

## `__drizzle_migrations`

### 專欄

| 名稱         | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| ------------ | --------- | ---- | ---- | -------- |
| `id`         | `SERIAL`  | 是的 | —    | 1        |
| `hash`       | `TEXT`    | 是的 | —    | —        |
| `created_at` | `numeric` | 不   | —    | —        |

### 外鍵

沒有。

### 索引

| 名稱                                      | 專欄 | 獨特 | 部分 | 產地 |
| ----------------------------------------- | ---- | ---- | ---- | ---- |
| `sqlite_autoindex___drizzle_migrations_1` | `id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
```

## `catalog_asset_bindings`

### 專欄

| 名稱                 | 聲明類型 | 必填 | 預設 | 主鍵位置 |
| -------------------- | -------- | ---- | ---- | -------- |
| `deployment_id`      | `TEXT`   | 是的 | —    | 1        |
| `collection_address` | `TEXT`   | 是的 | —    | 2        |
| `token_id`           | `TEXT`   | 是的 | —    | 3        |
| `catalog_id`         | `TEXT`   | 是的 | —    | —        |
| `binding_source`     | `TEXT`   | 是的 | —    | —        |
| `seed_set_id`        | `TEXT`   | 不   | —    | —        |
| `seed_set_version`   | `TEXT`   | 不   | —    | —        |

### 外鍵

| 來自            | 參考文獻                      | 更新時      | 刪除時     |
| --------------- | ----------------------------- | ----------- | ---------- |
| `catalog_id`    | `catalog_vehicles.catalog_id` | `NO ACTION` | `RESTRICT` |
| `deployment_id` | `deployments.deployment_id`   | `NO ACTION` | `RESTRICT` |

### 索引

| 名稱                                        | 專欄                                              | 獨特 | 部分 | 產地 |
| ------------------------------------------- | ------------------------------------------------- | ---- | ---- | ---- |
| `sqlite_autoindex_catalog_asset_bindings_1` | `deployment_id`, `collection_address`, `token_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `catalog_asset_bindings` (
	`deployment_id` text NOT NULL,
	`collection_address` text NOT NULL,
	`token_id` text NOT NULL,
	`catalog_id` text NOT NULL,
	`binding_source` text NOT NULL,
	`seed_set_id` text,
	`seed_set_version` text,
	PRIMARY KEY(`deployment_id`, `collection_address`, `token_id`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog_vehicles`(`catalog_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "binding_address_check" CHECK(length("collection_address") = 42 AND substr("collection_address", 1, 2) = '0x' AND lower("collection_address") = "collection_address" AND substr("collection_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "binding_token_id_check" CHECK(length("token_id") BETWEEN 1 AND 78
    AND ("token_id" = '0' OR substr("token_id", 1, 1) BETWEEN '1' AND '9')
    AND "token_id" NOT GLOB '*[^0-9]*'
    AND (length("token_id") < 78 OR "token_id" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "binding_source_check" CHECK("catalog_asset_bindings"."binding_source" IN ('SEED','MANUAL'))
)
```

## `catalog_vehicles`

### 專欄

| 名稱               | 聲明類型 | 必填 | 預設 | 主鍵位置 |
| ------------------ | -------- | ---- | ---- | -------- |
| `catalog_id`       | `TEXT`   | 是的 | —    | 1        |
| `name`             | `TEXT`   | 是的 | —    | —        |
| `description`      | `TEXT`   | 是的 | —    | —        |
| `model`            | `TEXT`   | 是的 | —    | —        |
| `model_year`       | `TEXT`   | 是的 | —    | —        |
| `image_path`       | `TEXT`   | 是的 | —    | —        |
| `origin`           | `TEXT`   | 是的 | —    | —        |
| `seed_set_id`      | `TEXT`   | 不   | —    | —        |
| `seed_set_version` | `TEXT`   | 不   | —    | —        |
| `created_at`       | `TEXT`   | 是的 | —    | —        |
| `updated_at`       | `TEXT`   | 是的 | —    | —        |

### 外鍵

沒有。

### 索引

| 名稱                                  | 專欄         | 獨特 | 部分 | 產地 |
| ------------------------------------- | ------------ | ---- | ---- | ---- |
| `sqlite_autoindex_catalog_vehicles_1` | `catalog_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `catalog_vehicles` (
	`catalog_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`model` text NOT NULL,
	`model_year` text NOT NULL,
	`image_path` text NOT NULL,
	`origin` text NOT NULL,
	`seed_set_id` text,
	`seed_set_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "catalog_origin_check" CHECK("catalog_vehicles"."origin" IN ('SEEDED','MANUAL'))
)
```

## `chain_events`

### 專欄

| 名稱                   | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| ---------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`        | `TEXT`    | 是的 | —    | 1        |
| `block_hash`           | `TEXT`    | 是的 | —    | 2        |
| `log_index`            | `INTEGER` | 是的 | —    | 3        |
| `block_number`         | `INTEGER` | 是的 | —    | —        |
| `tx_hash`              | `TEXT`    | 是的 | —    | —        |
| `transaction_index`    | `INTEGER` | 是的 | —    | —        |
| `contract_address`     | `TEXT`    | 是的 | —    | —        |
| `topics_json`          | `TEXT`    | 是的 | —    | —        |
| `data`                 | `TEXT`    | 是的 | —    | —        |
| `raw_envelope_digest`  | `TEXT`    | 是的 | —    | —        |
| `decoded_json`         | `TEXT`    | 是的 | —    | —        |
| `decoder_version`      | `TEXT`    | 是的 | —    | —        |
| `first_seen_at`        | `TEXT`    | 是的 | —    | —        |
| `source_record_digest` | `TEXT`    | 不   | —    | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                              | 專欄                                                              | 獨特 | 部分 | 產地 |
| --------------------------------- | ----------------------------------------------------------------- | ---- | ---- | ---- |
| `chain_events_order`              | `deployment_id`, `block_number`, `transaction_index`, `log_index` | 不   | 不   | `c`  |
| `sqlite_autoindex_chain_events_1` | `deployment_id`, `block_hash`, `log_index`                        | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `chain_events` (
	`deployment_id` text NOT NULL,
	`block_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`block_number` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`transaction_index` integer NOT NULL,
	`contract_address` text NOT NULL,
	`topics_json` text NOT NULL,
	`data` text NOT NULL,
	`raw_envelope_digest` text NOT NULL,
	`decoded_json` text NOT NULL,
	`decoder_version` text NOT NULL,
	`first_seen_at` text NOT NULL, `source_record_digest` text,
	PRIMARY KEY(`deployment_id`, `block_hash`, `log_index`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_block_number_check" CHECK("block_number" >= 0 AND "block_number" <= 9007199254740991),
	CONSTRAINT "event_tx_index_check" CHECK("transaction_index" >= 0 AND "transaction_index" <= 9007199254740991),
	CONSTRAINT "event_log_index_check" CHECK("log_index" >= 0 AND "log_index" <= 9007199254740991),
	CONSTRAINT "event_contract_address_check" CHECK(length("contract_address") = 42 AND substr("contract_address", 1, 2) = '0x' AND lower("contract_address") = "contract_address" AND substr("contract_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "event_block_hash_check" CHECK(length("block_hash") = 66 AND substr("block_hash", 1, 2) = '0x' AND lower("block_hash") = "block_hash" AND substr("block_hash", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "event_tx_hash_check" CHECK(length("tx_hash") = 66 AND substr("tx_hash", 1, 2) = '0x' AND lower("tx_hash") = "tx_hash" AND substr("tx_hash", 3) NOT GLOB '*[^0-9a-f]*')
)
```

## `db_contract`

### 專欄

| 名稱                      | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| ------------------------- | --------- | ---- | ---- | -------- |
| `id`                      | `INTEGER` | 是的 | —    | 1        |
| `contract_version`        | `TEXT`    | 是的 | —    | —        |
| `migration_bundle_digest` | `TEXT`    | 是的 | —    | —        |
| `schema_fingerprint`      | `TEXT`    | 是的 | —    | —        |
| `verified_at`             | `TEXT`    | 是的 | —    | —        |

### 外鍵

沒有。

### 索引

沒有。

### 執行表定義

```sql
CREATE TABLE `db_contract` (
	`id` integer PRIMARY KEY NOT NULL,
	`contract_version` text NOT NULL,
	`migration_bundle_digest` text NOT NULL,
	`schema_fingerprint` text NOT NULL,
	`verified_at` text NOT NULL,
	CONSTRAINT "db_contract_singleton_check" CHECK("db_contract"."id"=1)
)
```

## `deployments`

### 專欄

| 名稱                       | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| -------------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`            | `TEXT`    | 是的 | —    | 1        |
| `chain_id`                 | `TEXT`    | 是的 | —    | —        |
| `nft_address`              | `TEXT`    | 是的 | —    | —        |
| `escrow_address`           | `TEXT`    | 是的 | —    | —        |
| `protocol_version`         | `TEXT`    | 是的 | —    | —        |
| `abi_bundle_hash`          | `TEXT`    | 是的 | —    | —        |
| `scan_start_block`         | `INTEGER` | 是的 | —    | —        |
| `nft_deployment_block`     | `INTEGER` | 是的 | —    | —        |
| `nft_deployment_hash`      | `TEXT`    | 是的 | —    | —        |
| `nft_runtime_code_hash`    | `TEXT`    | 是的 | —    | —        |
| `escrow_deployment_block`  | `INTEGER` | 是的 | —    | —        |
| `escrow_deployment_hash`   | `TEXT`    | 是的 | —    | —        |
| `escrow_runtime_code_hash` | `TEXT`    | 是的 | —    | —        |
| `manifest_hash`            | `TEXT`    | 是的 | —    | —        |
| `manifest_json`            | `TEXT`    | 是的 | —    | —        |
| `registered_at`            | `TEXT`    | 是的 | —    | —        |

### 外鍵

沒有。

### 索引

| 名稱                             | 專欄            | 獨特 | 部分 | 產地 |
| -------------------------------- | --------------- | ---- | ---- | ---- |
| `sqlite_autoindex_deployments_1` | `deployment_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `deployments` (
	`deployment_id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`nft_address` text NOT NULL,
	`escrow_address` text NOT NULL,
	`protocol_version` text NOT NULL,
	`abi_bundle_hash` text NOT NULL,
	`scan_start_block` integer NOT NULL,
	`nft_deployment_block` integer NOT NULL,
	`nft_deployment_hash` text NOT NULL,
	`nft_runtime_code_hash` text NOT NULL,
	`escrow_deployment_block` integer NOT NULL,
	`escrow_deployment_hash` text NOT NULL,
	`escrow_runtime_code_hash` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`manifest_json` text NOT NULL,
	`registered_at` text NOT NULL,
	CONSTRAINT "deployment_id_check" CHECK(length("deployment_id") = 66 AND substr("deployment_id", 1, 2) = '0x' AND lower("deployment_id") = "deployment_id" AND substr("deployment_id", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "deployment_chain_id_check" CHECK(length("chain_id") BETWEEN 1 AND 78
    AND ("chain_id" = '0' OR substr("chain_id", 1, 1) BETWEEN '1' AND '9')
    AND "chain_id" NOT GLOB '*[^0-9]*'
    AND (length("chain_id") < 78 OR "chain_id" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "deployment_nft_address_check" CHECK(length("nft_address") = 42 AND substr("nft_address", 1, 2) = '0x' AND lower("nft_address") = "nft_address" AND substr("nft_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "deployment_escrow_address_check" CHECK(length("escrow_address") = 42 AND substr("escrow_address", 1, 2) = '0x' AND lower("escrow_address") = "escrow_address" AND substr("escrow_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "deployment_scan_start_check" CHECK("scan_start_block" >= 0 AND "scan_start_block" <= 9007199254740991),
	CONSTRAINT "deployment_nft_block_check" CHECK("nft_deployment_block" >= 0 AND "nft_deployment_block" <= 9007199254740991),
	CONSTRAINT "deployment_escrow_block_check" CHECK("escrow_deployment_block" >= 0 AND "escrow_deployment_block" <= 9007199254740991)
)
```

## `indexed_blocks`

### 專欄

| 名稱                  | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| --------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`       | `TEXT`    | 是的 | —    | 1        |
| `block_hash`          | `TEXT`    | 是的 | —    | 2        |
| `block_number`        | `INTEGER` | 是的 | —    | —        |
| `parent_hash`         | `TEXT`    | 是的 | —    | —        |
| `block_timestamp`     | `INTEGER` | 是的 | —    | —        |
| `is_canonical`        | `INTEGER` | 是的 | —    | —        |
| `scan_complete`       | `INTEGER` | 是的 | —    | —        |
| `log_scope_hash`      | `TEXT`    | 是的 | —    | —        |
| `observed_log_count`  | `INTEGER` | 是的 | —    | —        |
| `observed_log_digest` | `TEXT`    | 是的 | —    | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                                | 專欄                            | 獨特 | 部分 | 產地 |
| ----------------------------------- | ------------------------------- | ---- | ---- | ---- |
| `indexed_blocks_canonical_number`   | `deployment_id`, `block_number` | 是的 | 是的 | `c`  |
| `sqlite_autoindex_indexed_blocks_1` | `deployment_id`, `block_hash`   | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `indexed_blocks` (
	`deployment_id` text NOT NULL,
	`block_hash` text NOT NULL,
	`block_number` integer NOT NULL,
	`parent_hash` text NOT NULL,
	`block_timestamp` integer NOT NULL,
	`is_canonical` integer NOT NULL,
	`scan_complete` integer NOT NULL,
	`log_scope_hash` text NOT NULL,
	`observed_log_count` integer NOT NULL,
	`observed_log_digest` text NOT NULL,
	PRIMARY KEY(`deployment_id`, `block_hash`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "indexed_block_number_check" CHECK("block_number" >= 0 AND "block_number" <= 9007199254740991),
	CONSTRAINT "indexed_block_timestamp_check" CHECK("block_timestamp" >= 0 AND "block_timestamp" <= 9007199254740991),
	CONSTRAINT "indexed_block_log_count_check" CHECK("observed_log_count" >= 0 AND "observed_log_count" <= 9007199254740991),
	CONSTRAINT "indexed_block_hash_check" CHECK(length("block_hash") = 66 AND substr("block_hash", 1, 2) = '0x' AND lower("block_hash") = "block_hash" AND substr("block_hash", 3) NOT GLOB '*[^0-9a-f]*')
)
```

## `indexer_checkpoint`

### 專欄

| 名稱                  | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| --------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`       | `TEXT`    | 是的 | —    | 1        |
| `last_scanned_block`  | `INTEGER` | 不   | —    | —        |
| `last_scanned_hash`   | `TEXT`    | 不   | —    | —        |
| `projector_version`   | `TEXT`    | 是的 | —    | —        |
| `projection_build_id` | `TEXT`    | 是的 | —    | —        |
| `log_scope_hash`      | `TEXT`    | 是的 | —    | —        |
| `updated_at`          | `TEXT`    | 是的 | —    | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                                    | 專欄            | 獨特 | 部分 | 產地 |
| --------------------------------------- | --------------- | ---- | ---- | ---- |
| `sqlite_autoindex_indexer_checkpoint_1` | `deployment_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `indexer_checkpoint` (
	`deployment_id` text PRIMARY KEY NOT NULL,
	`last_scanned_block` integer,
	`last_scanned_hash` text,
	`projector_version` text NOT NULL,
	`projection_build_id` text NOT NULL,
	`log_scope_hash` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "checkpoint_block_check" CHECK("indexer_checkpoint"."last_scanned_block" IS NULL OR ("last_scanned_block" >= 0 AND "last_scanned_block" <= 9007199254740991)),
	CONSTRAINT "checkpoint_hash_check" CHECK("indexer_checkpoint"."last_scanned_hash" IS NULL OR (length("last_scanned_hash") = 66 AND substr("last_scanned_hash", 1, 2) = '0x' AND lower("last_scanned_hash") = "last_scanned_hash" AND substr("last_scanned_hash", 3) NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "checkpoint_pair_check" CHECK(("indexer_checkpoint"."last_scanned_block" IS NULL) = ("indexer_checkpoint"."last_scanned_hash" IS NULL))
)
```

## `indexer_runtime_status`

### 專欄

| 名稱                  | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| --------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`       | `TEXT`    | 是的 | —    | 1        |
| `projection_status`   | `TEXT`    | 是的 | —    | —        |
| `recovery_reason`     | `TEXT`    | 不   | —    | —        |
| `worker_heartbeat_at` | `TEXT`    | 不   | —    | —        |
| `last_rpc_success_at` | `TEXT`    | 不   | —    | —        |
| `last_observed_head`  | `INTEGER` | 不   | —    | —        |
| `last_observed_at`    | `TEXT`    | 不   | —    | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                                        | 專欄            | 獨特 | 部分 | 產地 |
| ------------------------------------------- | --------------- | ---- | ---- | ---- |
| `sqlite_autoindex_indexer_runtime_status_1` | `deployment_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `indexer_runtime_status` (
	`deployment_id` text PRIMARY KEY NOT NULL,
	`projection_status` text NOT NULL,
	`recovery_reason` text,
	`worker_heartbeat_at` text,
	`last_rpc_success_at` text,
	`last_observed_head` integer,
	`last_observed_at` text,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runtime_projection_status_check" CHECK("indexer_runtime_status"."projection_status" IN ('UNINITIALIZED','SYNCING','CURRENT','STALE','REBUILD_REQUIRED','REBUILDING','RECOVERY_REQUIRED')),
	CONSTRAINT "runtime_head_check" CHECK("indexer_runtime_status"."last_observed_head" IS NULL OR ("last_observed_head" >= 0 AND "last_observed_head" <= 9007199254740991))
)
```

## `payment_claims`

### 專欄

| 名稱                    | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| ----------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`         | `TEXT`    | 是的 | —    | 1        |
| `sale_id`               | `TEXT`    | 是的 | —    | 2        |
| `beneficiary`           | `TEXT`    | 是的 | —    | —        |
| `amount_wei`            | `TEXT`    | 是的 | —    | —        |
| `kind`                  | `TEXT`    | 是的 | —    | —        |
| `status`                | `TEXT`    | 是的 | —    | —        |
| `withdrawal_recipient`  | `TEXT`    | 不   | —    | —        |
| `creation_block_hash`   | `TEXT`    | 是的 | —    | —        |
| `creation_log_index`    | `INTEGER` | 是的 | —    | —        |
| `withdrawal_block_hash` | `TEXT`    | 不   | —    | —        |
| `withdrawal_log_index`  | `INTEGER` | 不   | —    | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                                | 專欄                       | 獨特 | 部分 | 產地 |
| ----------------------------------- | -------------------------- | ---- | ---- | ---- |
| `sqlite_autoindex_payment_claims_1` | `deployment_id`, `sale_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `payment_claims` (
	`deployment_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`beneficiary` text NOT NULL,
	`amount_wei` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`withdrawal_recipient` text,
	`creation_block_hash` text NOT NULL,
	`creation_log_index` integer NOT NULL,
	`withdrawal_block_hash` text,
	`withdrawal_log_index` integer,
	PRIMARY KEY(`deployment_id`, `sale_id`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "claim_sale_id_check" CHECK(length("sale_id") BETWEEN 1 AND 78
    AND ("sale_id" = '0' OR substr("sale_id", 1, 1) BETWEEN '1' AND '9')
    AND "sale_id" NOT GLOB '*[^0-9]*'
    AND (length("sale_id") < 78 OR "sale_id" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "claim_amount_check" CHECK("amount_wei" <> '0' AND length("amount_wei") BETWEEN 1 AND 78
    AND ("amount_wei" = '0' OR substr("amount_wei", 1, 1) BETWEEN '1' AND '9')
    AND "amount_wei" NOT GLOB '*[^0-9]*'
    AND (length("amount_wei") < 78 OR "amount_wei" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "claim_kind_check" CHECK("payment_claims"."kind" IN ('SELLER_PROCEEDS','BUYER_REFUND')),
	CONSTRAINT "claim_status_check" CHECK("payment_claims"."status" IN ('CLAIMABLE','WITHDRAWN')),
	CONSTRAINT "claim_beneficiary_check" CHECK(length("beneficiary") = 42 AND substr("beneficiary", 1, 2) = '0x' AND lower("beneficiary") = "beneficiary" AND substr("beneficiary", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "claim_creation_log_check" CHECK("creation_log_index" >= 0 AND "creation_log_index" <= 9007199254740991)
)
```

## `reconciliation_runs`

### 專欄

| Name                  | Declared type | Required | Default | Primary-key position |
| --------------------- | ------------- | -------- | ------- | -------------------- |
| `id`                  | `TEXT`        | yes      | —       | 1                    |
| `deployment_id`       | `TEXT`        | yes      | —       | —                    |
| `run_sequence`        | `INTEGER`     | yes      | —       | —                    |
| `comparison`          | `TEXT`        | yes      | —       | —                    |
| `freshness`           | `TEXT`        | yes      | —       | —                    |
| `block_number`        | `INTEGER`     | no       | —       | —                    |
| `block_hash`          | `TEXT`        | no       | —       | —                    |
| `projector_version`   | `TEXT`        | yes      | —       | —                    |
| `projection_build_id` | `TEXT`        | yes      | —       | —                    |
| `log_scope_hash`      | `TEXT`        | yes      | —       | —                    |
| `scope_json`          | `TEXT`        | yes      | —       | —                    |
| `differences_json`    | `TEXT`        | yes      | —       | —                    |
| `created_at`          | `TEXT`        | yes      | —       | —                    |

### 外鍵

| From            | References                  | On update   | On delete   |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| Name                                        | Columns                         | Unique | Partial | Origin |
| ------------------------------------------- | ------------------------------- | ------ | ------- | ------ |
| `reconciliation_deployment_sequence_unique` | `deployment_id`, `run_sequence` | yes    | no      | `c`    |
| `sqlite_autoindex_reconciliation_runs_1`    | `id`                            | yes    | no      | `pk`   |

### 執行表定義

```sql
CREATE TABLE "reconciliation_runs" (
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
	CONSTRAINT "reconciliation_run_sequence_positive" CHECK("reconciliation_runs"."run_sequence" > 0),
	CONSTRAINT "reconciliation_comparison_check" CHECK("reconciliation_runs"."comparison" IN ('MATCH','MISMATCH','UNVERIFIABLE')),
	CONSTRAINT "reconciliation_freshness_check" CHECK("reconciliation_runs"."freshness" IN ('CURRENT','PROJECTION_LAGGING','HEAD_UNKNOWN'))
)
```

## `sales`

### 專欄

| 名稱                    | 聲明類型  | 必填 | 預設    | 主鍵位置 |
| ----------------------- | --------- | ---- | ------- | -------- |
| `deployment_id`         | `TEXT`    | 是的 | —       | 1        |
| `sale_id`               | `TEXT`    | 是的 | —       | 2        |
| `collection_address`    | `TEXT`    | 是的 | —       | —        |
| `token_id`              | `TEXT`    | 是的 | —       | —        |
| `seller`                | `TEXT`    | 是的 | —       | —        |
| `buyer`                 | `TEXT`    | 不   | —       | —        |
| `price_wei`             | `TEXT`    | 是的 | —       | —        |
| `status`                | `TEXT`    | 是的 | —       | —        |
| `funded_at`             | `INTEGER` | 不   | —       | —        |
| `expires_at`            | `INTEGER` | 不   | —       | —        |
| `created_block`         | `INTEGER` | 是的 | —       | —        |
| `updated_block`         | `INTEGER` | 是的 | —       | —        |
| `last_event_block_hash` | `TEXT`    | 是的 | —       | —        |
| `last_event_log_index`  | `INTEGER` | 是的 | —       | —        |
| `token_reclaimed`       | `INTEGER` | 是的 | `false` | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                       | 專欄                       | 獨特 | 部分 | 產地 |
| -------------------------- | -------------------------- | ---- | ---- | ---- |
| `sales_status`             | `deployment_id`, `status`  | 不   | 不   | `c`  |
| `sqlite_autoindex_sales_1` | `deployment_id`, `sale_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `sales` (
	`deployment_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`collection_address` text NOT NULL,
	`token_id` text NOT NULL,
	`seller` text NOT NULL,
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
	CONSTRAINT "sale_status_check" CHECK("sales"."status" IN ('LISTED','FUNDED','COMPLETED','CANCELLED','EXPIRED')),
	CONSTRAINT "sale_collection_check" CHECK(length("collection_address") = 42 AND substr("collection_address", 1, 2) = '0x' AND lower("collection_address") = "collection_address" AND substr("collection_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "sale_seller_check" CHECK(length("seller") = 42 AND substr("seller", 1, 2) = '0x' AND lower("seller") = "seller" AND substr("seller", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "sale_buyer_check" CHECK("sales"."buyer" IS NULL OR (length("sales"."buyer")=42 AND substr("sales"."buyer",1,2)='0x' AND lower("sales"."buyer")="sales"."buyer" AND substr("sales"."buyer",3) NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "sale_created_block_check" CHECK("created_block" >= 0 AND "created_block" <= 9007199254740991),
	CONSTRAINT "sale_updated_block_check" CHECK("updated_block" >= 0 AND "updated_block" <= 9007199254740991),
	CONSTRAINT "sale_log_index_check" CHECK("last_event_log_index" >= 0 AND "last_event_log_index" <= 9007199254740991)
)
```

## `token_ownership`

### 專欄

| 名稱                       | 聲明類型  | 必填 | 預設 | 主鍵位置 |
| -------------------------- | --------- | ---- | ---- | -------- |
| `deployment_id`            | `TEXT`    | 是的 | —    | 1        |
| `collection_address`       | `TEXT`    | 是的 | —    | 2        |
| `token_id`                 | `TEXT`    | 是的 | —    | 3        |
| `owner`                    | `TEXT`    | 是的 | —    | —        |
| `last_transfer_block_hash` | `TEXT`    | 是的 | —    | —        |
| `last_transfer_log_index`  | `INTEGER` | 是的 | —    | —        |
| `updated_block`            | `INTEGER` | 是的 | —    | —        |

### 外鍵

| 來自            | 參考文獻                    | 更新時      | 刪除時      |
| --------------- | --------------------------- | ----------- | ----------- |
| `deployment_id` | `deployments.deployment_id` | `NO ACTION` | `NO ACTION` |

### 索引

| 名稱                                 | 專欄                                              | 獨特 | 部分 | 產地 |
| ------------------------------------ | ------------------------------------------------- | ---- | ---- | ---- |
| `sqlite_autoindex_token_ownership_1` | `deployment_id`, `collection_address`, `token_id` | 是的 | 不   | `pk` |

### 執行表定義

```sql
CREATE TABLE `token_ownership` (
	`deployment_id` text NOT NULL,
	`collection_address` text NOT NULL,
	`token_id` text NOT NULL,
	`owner` text NOT NULL,
	`last_transfer_block_hash` text NOT NULL,
	`last_transfer_log_index` integer NOT NULL,
	`updated_block` integer NOT NULL,
	PRIMARY KEY(`deployment_id`, `collection_address`, `token_id`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`deployment_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ownership_token_id_check" CHECK(length("token_id") BETWEEN 1 AND 78
    AND ("token_id" = '0' OR substr("token_id", 1, 1) BETWEEN '1' AND '9')
    AND "token_id" NOT GLOB '*[^0-9]*'
    AND (length("token_id") < 78 OR "token_id" <= '115792089237316195423570985008687907853269984665640564039457584007913129639935')),
	CONSTRAINT "ownership_collection_check" CHECK(length("collection_address") = 42 AND substr("collection_address", 1, 2) = '0x' AND lower("collection_address") = "collection_address" AND substr("collection_address", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ownership_owner_check" CHECK(length("owner") = 42 AND substr("owner", 1, 2) = '0x' AND lower("owner") = "owner" AND substr("owner", 3) NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ownership_log_index_check" CHECK("last_transfer_log_index" >= 0 AND "last_transfer_log_index" <= 9007199254740991),
	CONSTRAINT "ownership_block_check" CHECK("updated_block" >= 0 AND "updated_block" <= 9007199254740991)
)
```
