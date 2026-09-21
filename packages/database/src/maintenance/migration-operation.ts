import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
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
  loadSchemaContract,
  migrationBundle,
  migrationsFolder,
  readNativeHistory,
  verifyDatabase,
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
  const operationId = randomUUID();
  const marker: MaintenanceMarker = {
    operationId,
    operationType: 'MIGRATE',
    stage: 'PREPARED',
    environmentId: paths.environmentId,
    targetDatabase: paths.databasePath,
    expectedSchemaContract: loadSchemaContract().contractVersion,
    startedAt: new Date().toISOString(),
  };
  let markerOwned = false;
  try {
    if (existsSync(paths.maintenancePath)) throw new Error('MAINTENANCE_INCOMPLETE');
    writeMaintenanceMarker(paths.maintenancePath, marker);
    markerOwned = true;
    const existed = existsSync(paths.databasePath);
    const database = openMaintenanceDatabase(paths.databasePath);
    try {
      assertKnownHistory(database);
      const beforeCount = readNativeHistory(database).length;
      const pending = migrationBundle().length - beforeCount;
      if (existed && beforeCount > 0 && pending > 0)
        await backupEnvironment(paths, { locksAlreadyHeld: true, reason: 'pre-migration' });
      database.pragma('journal_mode = WAL');
      if (options.applyMigrations) options.applyMigrations(database);
      else drizzleMigrate(drizzle(database), { migrationsFolder });
      const contract = loadSchemaContract();
      const verification = verifyDatabase(database);
      database
        .prepare(
          `INSERT INTO db_contract(
            id,contract_version,migration_bundle_digest,schema_fingerprint,verified_at
          ) VALUES (1,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            contract_version=excluded.contract_version,
            migration_bundle_digest=excluded.migration_bundle_digest,
            schema_fingerprint=excluded.schema_fingerprint,
            verified_at=excluded.verified_at`,
        )
        .run(
          contract.contractVersion,
          contract.migrationBundleDigest,
          contract.schemaFingerprint,
          new Date().toISOString(),
        );
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
