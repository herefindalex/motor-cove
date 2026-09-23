import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { deployments } from './deployments.js';
import { hexLength, safeInteger } from './shared.js';

export const indexerCheckpoint = sqliteTable(
  'indexer_checkpoint',
  {
    deploymentId: text('deployment_id')
      .primaryKey()
      .references(() => deployments.deploymentId),
    lastScannedBlock: integer('last_scanned_block'),
    lastScannedHash: text('last_scanned_hash'),
    projectorVersion: text('projector_version').notNull(),
    projectionBuildId: text('projection_build_id').notNull(),
    logScopeHash: text('log_scope_hash').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check(
      'checkpoint_block_check',
      sql`${t.lastScannedBlock} IS NULL OR (${safeInteger('last_scanned_block')})`,
    ),
    check(
      'checkpoint_hash_check',
      sql`${t.lastScannedHash} IS NULL OR (${hexLength('last_scanned_hash', 64)})`,
    ),
    check(
      'checkpoint_pair_check',
      sql`(${t.lastScannedBlock} IS NULL) = (${t.lastScannedHash} IS NULL)`,
    ),
  ],
);

export const indexerRuntimeStatus = sqliteTable(
  'indexer_runtime_status',
  {
    deploymentId: text('deployment_id')
      .primaryKey()
      .references(() => deployments.deploymentId),
    projectionStatus: text('projection_status').notNull(),
    recoveryReason: text('recovery_reason'),
    workerHeartbeatAt: text('worker_heartbeat_at'),
    lastRpcSuccessAt: text('last_rpc_success_at'),
    lastObservedHead: integer('last_observed_head'),
    lastObservedAt: text('last_observed_at'),
  },
  (t) => [
    check(
      'runtime_projection_status_check',
      sql`${t.projectionStatus} IN ('UNINITIALIZED','SYNCING','CURRENT','STALE','REBUILD_REQUIRED','REBUILDING','RECOVERY_REQUIRED')`,
    ),
    check(
      'runtime_head_check',
      sql`${t.lastObservedHead} IS NULL OR (${safeInteger('last_observed_head')})`,
    ),
  ],
);

export const dbContract = sqliteTable(
  'db_contract',
  {
    id: integer('id').primaryKey(),
    contractVersion: text('contract_version').notNull(),
    migrationBundleDigest: text('migration_bundle_digest').notNull(),
    schemaFingerprint: text('schema_fingerprint').notNull(),
    verifiedAt: text('verified_at').notNull(),
  },
  (t) => [check('db_contract_singleton_check', sql`${t.id}=1`)],
);

export const reconciliationRuns = sqliteTable(
  'reconciliation_runs',
  {
    id: text('id').primaryKey(),
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId),
    runSequence: integer('run_sequence').notNull(),
    comparison: text('comparison').notNull(),
    freshness: text('freshness').notNull(),
    blockNumber: integer('block_number'),
    blockHash: text('block_hash'),
    projectorVersion: text('projector_version').notNull(),
    projectionBuildId: text('projection_build_id').notNull(),
    logScopeHash: text('log_scope_hash').notNull(),
    scopeJson: text('scope_json').notNull(),
    differencesJson: text('differences_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('reconciliation_deployment_sequence_unique').on(t.deploymentId, t.runSequence),
    check('reconciliation_run_sequence_positive', sql`${t.runSequence} > 0`),
    check(
      'reconciliation_comparison_check',
      sql`${t.comparison} IN ('MATCH','MISMATCH','UNVERIFIABLE')`,
    ),
    check(
      'reconciliation_freshness_check',
      sql`${t.freshness} IN ('CURRENT','PROJECTION_LAGGING','HEAD_UNKNOWN')`,
    ),
  ],
);
