import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  acquireBootstrapOwnership,
  acquireMaintenanceLocks,
  type AdvisoryLock,
} from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { verifyBackup } from './backup.js';
import { clearMaintenanceMarker, writeMaintenanceMarker } from './marker.js';
import { loadSchemaContract, verifyDatabase } from './migrations.js';

function activeDeploymentId(paths: EnvironmentPaths): string {
  if (!existsSync(paths.databasePath)) throw new Error('DB_NOT_INITIALIZED');
  const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare('SELECT deployment_id AS deploymentId FROM deployments')
      .all() as Array<{
      deploymentId: string;
    }>;
    if (rows.length !== 1 || !rows[0]) throw new Error('ACTIVE_DEPLOYMENT_IDENTITY_INVALID');
    return rows[0].deploymentId;
  } finally {
    db.close();
  }
}

function manifestDeploymentId(paths: EnvironmentPaths): string {
  if (!existsSync(paths.deploymentPath)) throw new Error('ACTIVE_DEPLOYMENT_MANIFEST_MISSING');
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(paths.deploymentPath, 'utf8')) as unknown;
  } catch {
    throw new Error('ACTIVE_DEPLOYMENT_MANIFEST_INVALID');
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('deploymentId' in manifest) ||
    typeof manifest.deploymentId !== 'string'
  )
    throw new Error('ACTIVE_DEPLOYMENT_MANIFEST_INVALID');
  return manifest.deploymentId;
}

function assertActiveSidecarsMatchBackup(paths: EnvironmentPaths, backupDirectory: string): void {
  for (const [active, name] of [
    [paths.deploymentPath, 'deployment.json'],
    [paths.bootstrapReceiptPath, 'bootstrap-receipt.json'],
    [paths.seedJournalPath, 'seed-journal.json'],
  ] as const) {
    const archived = resolve(backupDirectory, name);
    if (
      existsSync(active) !== existsSync(archived) ||
      (existsSync(active) && !readFileSync(active).equals(readFileSync(archived)))
    )
      throw new Error(`BACKUP_SIDECAR_MISMATCH: ${name}`);
  }
}

export async function restoreEnvironment(
  paths: EnvironmentPaths,
  backupId: string,
  confirmed: boolean,
) {
  if (!confirmed) throw new Error('RESTORE_CONFIRMATION_REQUIRED');
  verifyOwnedEnvironment(paths);
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
  let bootstrapOwnership: AdvisoryLock | undefined;
  let locks: AdvisoryLock | undefined;
  try {
    bootstrapOwnership = await acquireBootstrapOwnership(paths);
    locks = await acquireMaintenanceLocks(paths);
    if (existsSync(paths.maintenancePath)) throw new Error('MAINTENANCE_INCOMPLETE');
    writeMaintenanceMarker(paths.maintenancePath, marker);
    markerOwned = true;
    const backup = verifyBackup(paths, backupId);
    if (backup.manifest.restorePolicy !== 'STANDARD')
      throw new Error('BACKUP_NOT_RESTORABLE: incomplete maintenance evidence');
    if (backup.manifest.deploymentState === 'PREDEPLOYMENT')
      throw new Error('BACKUP_PREDEPLOYMENT_RESTORE_UNSUPPORTED');
    const backupDeploymentId = backup.manifest.deploymentId;
    const activeId = activeDeploymentId(paths);
    const manifestId = manifestDeploymentId(paths);
    if (
      typeof backupDeploymentId !== 'string' ||
      backupDeploymentId !== activeId ||
      manifestId !== activeId
    )
      throw new Error('BACKUP_DEPLOYMENT_MISMATCH');
    assertActiveSidecarsMatchBackup(paths, backup.directory);
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
    try {
      await locks?.release();
    } finally {
      await bootstrapOwnership?.release();
    }
  }
}
