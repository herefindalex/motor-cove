import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { canonicalUint256, hexLength, safeInteger } from './shared.js';

export const deployments = sqliteTable(
  'deployments',
  {
    deploymentId: text('deployment_id').primaryKey(),
    chainId: text('chain_id').notNull(),
    nftAddress: text('nft_address').notNull(),
    escrowAddress: text('escrow_address').notNull(),
    protocolVersion: text('protocol_version').notNull(),
    abiBundleHash: text('abi_bundle_hash').notNull(),
    scanStartBlock: integer('scan_start_block').notNull(),
    nftDeploymentBlock: integer('nft_deployment_block').notNull(),
    nftDeploymentHash: text('nft_deployment_hash').notNull(),
    nftRuntimeCodeHash: text('nft_runtime_code_hash').notNull(),
    escrowDeploymentBlock: integer('escrow_deployment_block').notNull(),
    escrowDeploymentHash: text('escrow_deployment_hash').notNull(),
    escrowRuntimeCodeHash: text('escrow_runtime_code_hash').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    manifestJson: text('manifest_json').notNull(),
    registeredAt: text('registered_at').notNull(),
  },
  () => [
    check('deployment_id_check', hexLength('deployment_id', 64)),
    check('deployment_chain_id_check', canonicalUint256('chain_id')),
    check('deployment_nft_address_check', hexLength('nft_address', 40)),
    check('deployment_escrow_address_check', hexLength('escrow_address', 40)),
    check('deployment_scan_start_check', safeInteger('scan_start_block')),
    check('deployment_nft_block_check', safeInteger('nft_deployment_block')),
    check('deployment_escrow_block_check', safeInteger('escrow_deployment_block')),
  ],
);
