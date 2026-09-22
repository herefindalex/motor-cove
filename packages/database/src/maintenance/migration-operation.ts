import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { initializeOwnedEnvironment } from '../connection/environment.js';
import { openMaintenanceDatabase } from '../connection/sqlite.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { backupEnvironment } from './backup.js';
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
      if (pending > 0 && beforeCount > 0) verifyKnownSourceDatabase(database);
      if (!existingMarker && existed && beforeCount > 0 && pending > 0)
        await backupEnvironment(paths, { locksAlreadyHeld: true, reason: 'pre-migration' });
      writeMaintenanceMarker(paths.maintenancePath, { ...marker, stage: 'APPLYING' });
      database.pragma('journal_mode = WAL');
      if (pending > 0) {
        if (options.applyMigrations) options.applyMigrations(database);
        else drizzleMigrate(drizzle(database), { migrationsFolder });
      }
      writeMaintenanceMarker(paths.maintenancePath, { ...marker, stage: 'FINALIZING' });
      const verification = finalizeDatabaseContract(database);
      clearMaintenanceMarker(paths.maintenancePath);
      return { operationId, changed: pending > 0, verification };
    } finally {
      database.close();
    }
  } catch (error) {
    if (markerOwned && existsSync(paths.maintenancePath))
      writeMaintenanceMarker(paths.maintenancePath, {
        ...marker,
        stage: 'FAILED',
        lastError: error instanceof Error ? error.message : String(error),
      });
    throw error;
  } finally {
    await locks.release();
  }
}
