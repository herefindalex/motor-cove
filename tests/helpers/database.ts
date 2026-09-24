import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environmentPaths, migrateEnvironment } from '@motorcove/database/maintenance';
import { PROJECTOR_VERSION } from '@motorcove/database/types';

export const hashes = {
  deployment: `0x${'1'.repeat(64)}`,
  block: `0x${'2'.repeat(64)}`,
  parent: `0x${'3'.repeat(64)}`,
  tx: `0x${'4'.repeat(64)}`,
  scope: `0x${'5'.repeat(64)}`,
  code: `0x${'6'.repeat(64)}`,
  manifest: `0x${'7'.repeat(64)}`,
  address: `0x${'8'.repeat(40)}`,
  escrow: `0x${'9'.repeat(40)}`,
};

export function writeBootstrapEvidence(
  paths: ReturnType<typeof environmentPaths>,
  completedAt = '2026-09-23T00:00:00.000Z',
): void {
  writeFileSync(
    paths.seedJournalPath,
    `${JSON.stringify({
      formatVersion: 1,
      environmentId: paths.environmentId,
      chainId: 31_337,
      account: hashes.address,
      deploymentId: hashes.deployment,
      createdAt: completedAt,
      updatedAt: completedAt,
      steps: {},
    })}\n`,
  );
  writeFileSync(
    paths.bootstrapReceiptPath,
    `${JSON.stringify({
      formatVersion: 1,
      environmentId: paths.environmentId,
      deploymentId: hashes.deployment,
      targetBlock: '1',
      targetHash: hashes.block,
      projectionBuildId: 'build-test',
      completedAt,
    })}\n`,
  );
}
export async function databaseFixture(environmentId = 'test') {
  const root = mkdtempSync(join(tmpdir(), 'motorcove-db-'));
  const paths = environmentPaths(root, environmentId);
  await migrateEnvironment(paths);
  const db = new Database(paths.databasePath);
  db.pragma('foreign_keys = ON');
  db.prepare(
    `INSERT INTO deployments(deployment_id,chain_id,nft_address,escrow_address,protocol_version,abi_bundle_hash,scan_start_block,nft_deployment_block,nft_deployment_hash,nft_runtime_code_hash,escrow_deployment_block,escrow_deployment_hash,escrow_runtime_code_hash,manifest_hash,manifest_json,registered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    hashes.deployment,
    '31337',
    hashes.address,
    hashes.escrow,
    '0.2.0',
    hashes.code,
    1,
    1,
    hashes.block,
    hashes.code,
    2,
    hashes.parent,
    hashes.code,
    hashes.manifest,
    '{}',
    new Date(0).toISOString(),
  );
  db.prepare(
    `INSERT INTO indexer_checkpoint(deployment_id,last_scanned_block,last_scanned_hash,projector_version,projection_build_id,log_scope_hash,updated_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    hashes.deployment,
    1,
    hashes.block,
    PROJECTOR_VERSION,
    'build-test',
    hashes.scope,
    new Date(0).toISOString(),
  );
  db.prepare(
    `INSERT INTO indexer_runtime_status(deployment_id,projection_status) VALUES (?,?)`,
  ).run(hashes.deployment, 'CURRENT');
  db.close();
  writeFileSync(
    paths.deploymentPath,
    `${JSON.stringify({ deploymentId: hashes.deployment }, null, 2)}\n`,
  );
  return { root, paths };
}
