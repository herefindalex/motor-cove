import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { deployments } from './deployments.js';
import { hexLength, safeInteger } from './shared.js';

export const indexedBlocks = sqliteTable(
  'indexed_blocks',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId),
    blockHash: text('block_hash').notNull(),
    blockNumber: integer('block_number').notNull(),
    parentHash: text('parent_hash').notNull(),
    blockTimestamp: integer('block_timestamp').notNull(),
    isCanonical: integer('is_canonical', { mode: 'boolean' }).notNull(),
    scanComplete: integer('scan_complete', { mode: 'boolean' }).notNull(),
    logScopeHash: text('log_scope_hash').notNull(),
    observedLogCount: integer('observed_log_count').notNull(),
    observedLogDigest: text('observed_log_digest').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deploymentId, t.blockHash] }),
    uniqueIndex('indexed_blocks_canonical_number')
      .on(t.deploymentId, t.blockNumber)
      .where(sql`${t.isCanonical} = 1`),
    check('indexed_block_number_check', safeInteger('block_number')),
    check('indexed_block_timestamp_check', safeInteger('block_timestamp')),
    check('indexed_block_log_count_check', safeInteger('observed_log_count')),
    check('indexed_block_hash_check', hexLength('block_hash', 64)),
  ],
);

export const chainEvents = sqliteTable(
  'chain_events',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId),
    blockHash: text('block_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: integer('block_number').notNull(),
    txHash: text('tx_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    contractAddress: text('contract_address').notNull(),
    topicsJson: text('topics_json').notNull(),
    data: text('data').notNull(),
    rawEnvelopeDigest: text('raw_envelope_digest').notNull(),
    decodedJson: text('decoded_json').notNull(),
    decoderVersion: text('decoder_version').notNull(),
    firstSeenAt: text('first_seen_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deploymentId, t.blockHash, t.logIndex] }),
    index('chain_events_order').on(t.deploymentId, t.blockNumber, t.transactionIndex, t.logIndex),
    check('event_block_number_check', safeInteger('block_number')),
    check('event_tx_index_check', safeInteger('transaction_index')),
    check('event_log_index_check', safeInteger('log_index')),
    check('event_contract_address_check', hexLength('contract_address', 40)),
    check('event_block_hash_check', hexLength('block_hash', 64)),
    check('event_tx_hash_check', hexLength('tx_hash', 64)),
  ],
);
