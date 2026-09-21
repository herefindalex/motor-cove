import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { verifyBackup } from './backup.js';
import { clearMaintenanceMarker, writeMaintenanceMarker } from './marker.js';
import { loadSchemaContract, verifyDatabase } from './migrations.js';

export async function restoreEnvironment(
  paths: EnvironmentPaths,
  backupId: string,
  confirmed: boolean,
) {
  if (!confirmed) throw new Error('RESTORE_CONFIRMATION_REQUIRED');
  verifyOwnedEnvironment(paths);
  const locks = await acquireMaintenanceLocks(paths);
  const operationId = randomUUID();
  const marker: MaintenanceMarker = {
    operationId,
    operationType: 'RESTORE',
    stage: 'PREPARED',
    environmentId: paths.environmentId,
    targetDatabase: paths.databasePath,
    expectedSchemaContract: loadSchemaContract().contractVersion,
    backupId,
    startedAt: new Date().toISOString(),
  };
  const staging = resolve(paths.environmentDir, `.restore-${operationId}`);
  const quarantine = resolve(paths.environmentDir, `.quarantine-${operationId}`);
  let markerOwned = false;
  try {
    if (existsSync(paths.maintenancePath)) throw new Error('MAINTENANCE_INCOMPLETE');
    writeMaintenanceMarker(paths.maintenancePath, marker);
    markerOwned = true;
    const backup = verifyBackup(paths, backupId);
    mkdirSync(staging);
    copyFileSync(backup.databasePath, resolve(staging, 'motorcove.sqlite'));
    const candidate = new Database(resolve(staging, 'motorcove.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      try {
        verifyDatabase(candidate);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === 'DB_SCHEMA_BEHIND' || error.message === 'DB_SCHEMA_DRIFT')
        )
          throw new Error('BACKUP_REQUIRES_MIGRATION');
        throw error;
      }
    } finally {
      candidate.close();
    }
    writeMaintenanceMarker(paths.maintenancePath, { ...marker, stage: 'ACTIVE_QUARANTINED' });
    mkdirSync(quarantine);
    for (const suffix of ['', '-wal', '-shm']) {
      const active = `${paths.databasePath}${suffix}`;
      if (existsSync(active)) renameSync(active, resolve(quarantine, `motorcove.sqlite${suffix}`));
    }
    writeMaintenanceMarker(paths.maintenancePath, { ...marker, stage: 'INSTALLING_SNAPSHOT' });
    renameSync(resolve(staging, 'motorcove.sqlite'), paths.databasePath);
    rmSync(staging, { recursive: true, force: true });
    const restored = new Database(paths.databasePath, { fileMustExist: true });
    try {
      restored.pragma('foreign_keys = ON');
      restored.pragma('journal_mode = WAL');
      verifyDatabase(restored);
    } finally {
      restored.close();
    }
    clearMaintenanceMarker(paths.maintenancePath);
    return { operationId, backupId, quarantine, changed: true };
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
