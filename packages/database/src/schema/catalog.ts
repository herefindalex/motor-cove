import { sql } from 'drizzle-orm';
import { check, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { deployments } from './deployments.js';
import { canonicalUint256, hexLength } from './shared.js';

export const catalogVehicles = sqliteTable(
  'catalog_vehicles',
  {
    catalogId: text('catalog_id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    model: text('model').notNull(),
    modelYear: text('model_year').notNull(),
    imagePath: text('image_path').notNull(),
    origin: text('origin').notNull(),
    seedSetId: text('seed_set_id'),
    seedSetVersion: text('seed_set_version'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [check('catalog_origin_check', sql`${t.origin} IN ('SEEDED','MANUAL')`)],
);

export const catalogAssetBindings = sqliteTable(
  'catalog_asset_bindings',
  {
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.deploymentId, { onDelete: 'restrict' }),
    collectionAddress: text('collection_address').notNull(),
    tokenId: text('token_id').notNull(),
    catalogId: text('catalog_id')
      .notNull()
      .references(() => catalogVehicles.catalogId, { onDelete: 'restrict' }),
    bindingSource: text('binding_source').notNull(),
    seedSetId: text('seed_set_id'),
    seedSetVersion: text('seed_set_version'),
  },
  (t) => [
    primaryKey({ columns: [t.deploymentId, t.collectionAddress, t.tokenId] }),
    check('binding_address_check', hexLength('collection_address', 40)),
    check('binding_token_id_check', canonicalUint256('token_id')),
    check('binding_source_check', sql`${t.bindingSource} IN ('SEED','MANUAL')`),
  ],
);
