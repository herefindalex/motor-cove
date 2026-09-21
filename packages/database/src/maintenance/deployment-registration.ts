import { randomUUID } from 'node:crypto';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { openMaintenanceDatabase } from '../connection/sqlite.js';
import { PROJECTOR_VERSION, type EnvironmentPaths } from '../types/index.js';
import { verifyDatabase } from './migrations.js';

export interface DeploymentRegistration {
  readonly deploymentId: string;
  readonly chainId: string;
  readonly nftAddress: string;
  readonly escrowAddress: string;
  readonly protocolVersion: string;
  readonly abiBundleHash: string;
  readonly scanStartBlock: number;
  readonly nftDeploymentBlock: number;
  readonly nftDeploymentHash: string;
  readonly nftRuntimeCodeHash: string;
  readonly escrowDeploymentBlock: number;
  readonly escrowDeploymentHash: string;
  readonly escrowRuntimeCodeHash: string;
  readonly manifestHash: string;
  readonly manifestJson: string;
  readonly logScopeHash: string;
}

export async function registerDeployment(
  paths: EnvironmentPaths,
  registration: DeploymentRegistration,
): Promise<{ changed: boolean; projectionBuildId: string }> {
  verifyOwnedEnvironment(paths);
  const locks = await acquireMaintenanceLocks(paths);
  try {
    const database = openMaintenanceDatabase(paths.databasePath);
    try {
      verifyDatabase(database);
      return database.transaction(() => {
        const existing = database
          .prepare('SELECT manifest_hash AS manifestHash FROM deployments WHERE deployment_id=?')
          .get(registration.deploymentId) as { manifestHash: string } | undefined;
        if (existing && existing.manifestHash !== registration.manifestHash)
          throw new Error('DEPLOYMENT_CONFLICT: manifest differs');

        let changed = false;
        if (!existing) {
          database
            .prepare(
              `INSERT INTO deployments(
                deployment_id,chain_id,nft_address,escrow_address,protocol_version,
                abi_bundle_hash,scan_start_block,nft_deployment_block,nft_deployment_hash,
                nft_runtime_code_hash,escrow_deployment_block,escrow_deployment_hash,
                escrow_runtime_code_hash,manifest_hash,manifest_json,registered_at
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(
              registration.deploymentId,
              registration.chainId,
              registration.nftAddress.toLowerCase(),
              registration.escrowAddress.toLowerCase(),
              registration.protocolVersion,
              registration.abiBundleHash,
              registration.scanStartBlock,
              registration.nftDeploymentBlock,
              registration.nftDeploymentHash.toLowerCase(),
              registration.nftRuntimeCodeHash.toLowerCase(),
              registration.escrowDeploymentBlock,
              registration.escrowDeploymentHash.toLowerCase(),
              registration.escrowRuntimeCodeHash.toLowerCase(),
              registration.manifestHash,
              registration.manifestJson,
              new Date().toISOString(),
            );
          changed = true;
        }

        const checkpoint = database
          .prepare(
            'SELECT projector_version AS projectorVersion,projection_build_id AS projectionBuildId,log_scope_hash AS logScopeHash FROM indexer_checkpoint WHERE deployment_id=?',
          )
          .get(registration.deploymentId) as
          | { projectorVersion: string; projectionBuildId: string; logScopeHash: string }
          | undefined;
        if (
          checkpoint &&
          (checkpoint.projectorVersion !== PROJECTOR_VERSION ||
            checkpoint.logScopeHash !== registration.logScopeHash)
        )
          throw new Error('PROJECTION_CONTRACT_MISMATCH');

        const projectionBuildId = checkpoint?.projectionBuildId ?? randomUUID();
        if (!checkpoint) {
          database
            .prepare(
              'INSERT INTO indexer_checkpoint(deployment_id,last_scanned_block,last_scanned_hash,projector_version,projection_build_id,log_scope_hash,updated_at) VALUES (?,NULL,NULL,?,?,?,?)',
            )
            .run(
              registration.deploymentId,
              PROJECTOR_VERSION,
              projectionBuildId,
              registration.logScopeHash,
              new Date().toISOString(),
            );
          database
            .prepare(
              "INSERT INTO indexer_runtime_status(deployment_id,projection_status) VALUES (?,'UNINITIALIZED')",
            )
            .run(registration.deploymentId);
          changed = true;
        }
        return { changed, projectionBuildId };
      })();
    } finally {
      database.close();
    }
  } finally {
    await locks.release();
  }
}
