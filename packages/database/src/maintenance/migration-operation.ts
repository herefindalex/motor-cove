import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { initializeOwnedEnvironment } from '../connection/environment.js';
import { openMaintenanceDatabase } from '../connection/sqlite.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { backupEnvironment, verifyMaintenanceBackup } from './backup.js';
import { clearMaintenanceMarker, writeMaintenanceMarker } from './marker.js';
import {
  assertKnownHistory,
  finalizeDatabaseContract,
  loadSchemaContract,
  migrationBundle,
  migrationsFolder,
  readNativeHistory,
  verifyKnownSourceDatabase,
} from './migrations.js';

export interface MigrationOperationOptions {
  readonly applyMigrations?: (database: ReturnType<typeof openMaintenanceDatabase>) => void;
}

type SourceVerification = ReturnType<typeof verifyKnownSourceDatabase>;

function sourceDeploymentId(database: ReturnType<typeof openMaintenanceDatabase>): string | null {
  const rows = database
    .prepare('SELECT deployment_id AS deploymentId FROM deployments ORDER BY deployment_id')
    .all() as Array<{ deploymentId: string }>;
  if (rows.length === 0) return null;
  if (rows.length !== 1 || !rows[0])
    throw new Error('MIGRATION_BACKUP_INVALID: deployment identity');
  return rows[0].deploymentId;
}

function verifyMigrationBackup(
  paths: EnvironmentPaths,
  backupId: string,
  source: SourceVerification,
  deploymentId: string | null,
  operationId: string,
): void {
  const backup = verifyMaintenanceBackup(paths, backupId, {
    operationId,
    purpose: 'MIGRATION_SAFETY',
  });
  const manifest = backup.manifest as Record<string, unknown>;
  if (
    manifest.schemaContractVersion !== source.contractVersion ||
    manifest.migrationCount !== source.historyCount ||
    manifest.migrationBundleDigest !== source.migrationBundleDigest ||
    manifest.schemaFingerprint !== source.fingerprint ||
    manifest.deploymentId !== deploymentId
  )
    throw new Error('MIGRATION_BACKUP_INVALID: source identity');
}

export async function migrateEnvironment(
  paths: EnvironmentPaths,
  options: MigrationOperationOptions = {},
) {
  initializeOwnedEnvironment(paths);
  const locks = await acquireMaintenanceLocks(paths);
  let contract: ReturnType<typeof loadSchemaContract>;
  let existingMarker: MaintenanceMarker | undefined;
  try {
    contract = loadSchemaContract();
    existingMarker = existsSync(paths.maintenancePath)
      ? (JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as MaintenanceMarker)
      : undefined;
  } catch (error) {
    await locks.release();
    throw error;
  }
  const operationId = existingMarker?.operationId ?? randomUUID();
  const marker: MaintenanceMarker = existingMarker ?? {
    operationId,
    operationType: 'MIGRATE',
    stage: 'PREPARED',
    environmentId: paths.environmentId,
    targetDatabase: paths.databasePath,
    expectedSchemaContract: contract.contractVersion,
    expectedMigrationBundleDigest: contract.migrationBundleDigest,
    startedAt: new Date().toISOString(),
  };
  let activeMarker = marker;
  let markerOwned = false;
  try {
    if (existingMarker) {
      if (
        existingMarker.operationType !== 'MIGRATE' ||
        existingMarker.environmentId !== paths.environmentId ||
        existingMarker.targetDatabase !== paths.databasePath ||
        existingMarker.expectedSchemaContract !== contract.contractVersion ||
        existingMarker.expectedMigrationBundleDigest !== contract.migrationBundleDigest
      )
        throw new Error('MAINTENANCE_INCOMPLETE');
    } else {
      writeMaintenanceMarker(paths.maintenancePath, marker);
    }
    markerOwned = true;
    const existed = existsSync(paths.databasePath);
    const database = openMaintenanceDatabase(paths.databasePath);
    try {
      assertKnownHistory(database);
      const beforeCount = readNativeHistory(database).length;
      const pending = migrationBundle().length - beforeCount;
      const source =
        pending > 0 && beforeCount > 0 ? verifyKnownSourceDatabase(database) : undefined;
      if (existed && source && pending > 0) {
        const deploymentId = sourceDeploymentId(database);
        if (activeMarker.backupId) {
          verifyMigrationBackup(
            paths,
            activeMarker.backupId,
            source,
            deploymentId,
            activeMarker.operationId,
          );
        } else {
          const backup = await backupEnvironment(paths, {
            locksAlreadyHeld: true,
            reason: 'pre-migration',
            maintenance: {
              operationId: activeMarker.operationId,
              purpose: 'MIGRATION_SAFETY',
            },
          });
          verifyMigrationBackup(
            paths,
            backup.backupId,
            source,
            deploymentId,
            activeMarker.operationId,
          );
          activeMarker = { ...activeMarker, stage: 'BACKED_UP', backupId: backup.backupId };
          writeMaintenanceMarker(paths.maintenancePath, activeMarker);
        }
      }
      activeMarker = { ...activeMarker, stage: 'APPLYING' };
      writeMaintenanceMarker(paths.maintenancePath, activeMarker);
      database.pragma('journal_mode = WAL');
      if (pending > 0) {
        if (options.applyMigrations) options.applyMigrations(database);
        else drizzleMigrate(drizzle(database), { migrationsFolder });
      }
      activeMarker = { ...activeMarker, stage: 'FINALIZING' };
      writeMaintenanceMarker(paths.maintenancePath, activeMarker);
      const verification = finalizeDatabaseContract(database);
      clearMaintenanceMarker(paths.maintenancePath);
      return { operationId, changed: pending > 0, verification };
    } finally {
      database.close();
    }
  } catch (error) {
    if (markerOwned && existsSync(paths.maintenancePath))
      writeMaintenanceMarker(paths.maintenancePath, {
        ...activeMarker,
        stage: 'FAILED',
        lastError: error instanceof Error ? error.message : String(error),
      });
    throw error;
  } finally {
    await locks.release();
  }
}
