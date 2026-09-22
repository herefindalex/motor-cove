import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { clearMaintenanceMarker } from './marker.js';
import {
  assertKnownHistory,
  finalizeDatabaseContract,
  loadSchemaContract,
  migrationBundle,
  readNativeHistory,
  verifyDatabase,
  verifyKnownSourceDatabase,
} from './migrations.js';

const sqliteSidecars = ['-wal', '-shm'] as const;

function quarantineActiveRestoreSidecars(
  paths: EnvironmentPaths,
  quarantineDirectory: string,
): void {
  mkdirSync(quarantineDirectory, { recursive: true });
  for (const suffix of sqliteSidecars) {
    const active = `${paths.databasePath}${suffix}`;
    if (!existsSync(active)) continue;
    const quarantined = resolve(quarantineDirectory, `motorcove.sqlite${suffix}`);
    if (existsSync(quarantined)) throw new Error('RECOVERY_REQUIRED: ambiguous SQLite file set');
    renameSync(active, quarantined);
  }
}

function restoreQuarantinedFileSet(paths: EnvironmentPaths, quarantineDirectory: string): void {
  const quarantinedDatabase = resolve(quarantineDirectory, 'motorcove.sqlite');
  for (const suffix of sqliteSidecars) {
    const active = `${paths.databasePath}${suffix}`;
    const quarantined = resolve(quarantineDirectory, `motorcove.sqlite${suffix}`);
    if (existsSync(active) && existsSync(quarantined))
      throw new Error('RECOVERY_REQUIRED: ambiguous SQLite file set');
    if (!existsSync(active) && existsSync(quarantined)) renameSync(quarantined, active);
  }
  renameSync(quarantinedDatabase, paths.databasePath);
}

export async function recoverEnvironment(paths: EnvironmentPaths, complete = false) {
  verifyOwnedEnvironment(paths);
  if (!existsSync(paths.maintenancePath)) return { changed: false, status: 'NO_RECOVERY_REQUIRED' };
  const marker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as MaintenanceMarker;
  if (!complete) return { changed: false, status: 'RECOVERY_REQUIRED', marker };
  if (
    marker.operationType === 'REBUILD_PROJECTION' ||
    marker.operationType === 'REINDEX_PROJECTION'
  ) {
    return {
      changed: false,
      status: 'ACTION_REQUIRED',
      marker,
      action: 'RERUN_MATCHING_PROJECTION_OPERATION',
    };
  }
  const locks = await acquireMaintenanceLocks(paths);
  try {
    if (marker.operationType === 'MIGRATE') {
      const contract = loadSchemaContract();
      if (
        marker.environmentId !== paths.environmentId ||
        marker.targetDatabase !== paths.databasePath ||
        marker.expectedSchemaContract !== contract.contractVersion ||
        (marker.expectedMigrationBundleDigest !== undefined &&
          marker.expectedMigrationBundleDigest !== contract.migrationBundleDigest)
      )
        throw new Error('RECOVERY_REQUIRED: migration identity mismatch');
      if (!existsSync(paths.databasePath))
        throw new Error('RECOVERY_REQUIRED: active database missing');
      const database = new Database(paths.databasePath, { fileMustExist: true });
      try {
        assertKnownHistory(database);
        const historyCount = readNativeHistory(database).length;
        if (historyCount < migrationBundle().length) {
          verifyKnownSourceDatabase(database);
          return {
            changed: false,
            status: 'ACTION_REQUIRED',
            marker,
            action: marker.expectedMigrationBundleDigest
              ? 'RERUN_MATCHING_MIGRATION'
              : 'USE_ORIGINAL_RELEASE_MIGRATION_TOOL',
          };
        }
        finalizeDatabaseContract(database);
      } finally {
        database.close();
      }
      clearMaintenanceMarker(paths.maintenancePath);
      return { changed: true, status: 'RECOVERED', operationId: marker.operationId };
    }
    if (!existsSync(paths.databasePath) && marker.operationType === 'RESTORE') {
      const stagingDirectory = resolve(paths.environmentDir, `.restore-${marker.operationId}`);
      const quarantineDirectory = resolve(
        paths.environmentDir,
        `.quarantine-${marker.operationId}`,
      );
      const staged = resolve(stagingDirectory, 'motorcove.sqlite');
      const quarantined = resolve(quarantineDirectory, 'motorcove.sqlite');
      if (existsSync(staged)) {
        quarantineActiveRestoreSidecars(paths, quarantineDirectory);
        renameSync(staged, paths.databasePath);
      } else if (existsSync(quarantined)) {
        restoreQuarantinedFileSet(paths, quarantineDirectory);
      }
    }
    if (!existsSync(paths.databasePath))
      throw new Error('RECOVERY_REQUIRED: active database missing');
    const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    try {
      verifyDatabase(db);
    } finally {
      db.close();
    }
    clearMaintenanceMarker(paths.maintenancePath);
    return { changed: true, status: 'RECOVERED', operationId: marker.operationId };
  } finally {
    await locks.release();
  }
}
