import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { deployments } from './deployments.js';
import { canonicalUint256, hexLength, safeInteger } from './shared.js';

export const sales = sqliteTable(
  'sales',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId),
    saleId: text('sale_id').notNull(),
    collectionAddress: text('collection_address').notNull(),
    tokenId: text('token_id').notNull(),
    seller: text('seller').notNull(),
    buyer: text('buyer'),
    priceWei: text('price_wei').notNull(),
    status: text('status').notNull(),
    fundedAt: integer('funded_at'),
    expiresAt: integer('expires_at'),
    createdBlock: integer('created_block').notNull(),
    updatedBlock: integer('updated_block').notNull(),
    lastEventBlockHash: text('last_event_block_hash').notNull(),
    lastEventLogIndex: integer('last_event_log_index').notNull(),
    tokenReclaimed: integer('token_reclaimed', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.deploymentId, t.saleId] }),
    index('sales_status').on(t.deploymentId, t.status),
    check('sale_id_check', canonicalUint256('sale_id')),
    check('sale_token_id_check', canonicalUint256('token_id')),
    check('sale_price_check', canonicalUint256('price_wei', true)),
    check(
      'sale_status_check',
      sql`${t.status} IN ('LISTED','FUNDED','COMPLETED','CANCELLED','EXPIRED')`,
    ),
    check('sale_collection_check', hexLength('collection_address', 40)),
    check('sale_seller_check', hexLength('seller', 40)),
    check(
      'sale_buyer_check',
      sql`${t.buyer} IS NULL OR (length(${t.buyer})=42 AND substr(${t.buyer},1,2)='0x' AND lower(${t.buyer})=${t.buyer} AND substr(${t.buyer},3) NOT GLOB '*[^0-9a-f]*')`,
    ),
    check('sale_created_block_check', safeInteger('created_block')),
    check('sale_updated_block_check', safeInteger('updated_block')),
    check('sale_log_index_check', safeInteger('last_event_log_index')),
  ],
);

export const paymentClaims = sqliteTable(
  'payment_claims',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId),
    saleId: text('sale_id').notNull(),
    beneficiary: text('beneficiary').notNull(),
    amountWei: text('amount_wei').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    withdrawalRecipient: text('withdrawal_recipient'),
    creationBlockHash: text('creation_block_hash').notNull(),
    creationLogIndex: integer('creation_log_index').notNull(),
    withdrawalBlockHash: text('withdrawal_block_hash'),
    withdrawalLogIndex: integer('withdrawal_log_index'),
  },
  (t) => [
    primaryKey({ columns: [t.deploymentId, t.saleId] }),
    check('claim_sale_id_check', canonicalUint256('sale_id')),
    check('claim_amount_check', canonicalUint256('amount_wei', true)),
    check('claim_kind_check', sql`${t.kind} IN ('SELLER_PROCEEDS','BUYER_REFUND')`),
    check('claim_status_check', sql`${t.status} IN ('CLAIMABLE','WITHDRAWN')`),
    check('claim_beneficiary_check', hexLength('beneficiary', 40)),
    check('claim_creation_log_check', safeInteger('creation_log_index')),
  ],
);

export const tokenOwnership = sqliteTable(
  'token_ownership',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId),
    collectionAddress: text('collection_address').notNull(),
    tokenId: text('token_id').notNull(),
    owner: text('owner').notNull(),
    lastTransferBlockHash: text('last_transfer_block_hash').notNull(),
    lastTransferLogIndex: integer('last_transfer_log_index').notNull(),
    updatedBlock: integer('updated_block').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deploymentId, t.collectionAddress, t.tokenId] }),
    check('ownership_token_id_check', canonicalUint256('token_id')),
    check('ownership_collection_check', hexLength('collection_address', 40)),
    check('ownership_owner_check', hexLength('owner', 40)),
    check('ownership_log_index_check', safeInteger('last_transfer_log_index')),
    check('ownership_block_check', safeInteger('updated_block')),
  ],
);
