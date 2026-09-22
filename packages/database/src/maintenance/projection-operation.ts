import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { openProjectionDatabase } from '../connection/sqlite.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { clearMaintenanceMarker, writeMaintenanceMarker } from './marker.js';
import { loadSchemaContract, verifyDatabase } from './migrations.js';

export interface ProjectionRecovery {
  readonly reindexFromBlock?: string;
  readonly targetBlock?: string;
  readonly targetHash?: string;
}

export interface ProjectionMaintenanceContext {
  readonly marker: MaintenanceMarker;
  recordBackup(backupId: string): void;
}

export interface ProjectionMaintenanceOptions<T> {
  readonly operationType: 'REBUILD_PROJECTION' | 'REINDEX_PROJECTION';
  readonly expectedDeploymentId: string;
  readonly recovery?: ProjectionRecovery;
  readonly resolveRecovery?: (
    existing: MaintenanceMarker | undefined,
  ) => ProjectionRecovery | Promise<ProjectionRecovery>;
  readonly run: (
    database: Database.Database,
    context: ProjectionMaintenanceContext,
  ) => T | Promise<T>;
}

function existingMarker(path: string): MaintenanceMarker | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as MaintenanceMarker;
}

function assertMarkerOwner(
  existing: MaintenanceMarker,
  options: ProjectionMaintenanceOptions<unknown>,
): void {
  if (
    existing.operationType !== options.operationType ||
    existing.expectedDeploymentId !== options.expectedDeploymentId
  )
    throw new Error('MAINTENANCE_INCOMPLETE');
}

function assertMarkerRecovery(existing: MaintenanceMarker, recovery: ProjectionRecovery): void {
  const matches =
    existing.reindexFromBlock === recovery.reindexFromBlock &&
    existing.targetBlock === recovery.targetBlock &&
    existing.targetHash === recovery.targetHash;
  if (!matches) throw new Error('MAINTENANCE_INCOMPLETE');
}

export async function runProjectionMaintenance<T>(
  paths: EnvironmentPaths,
  options: ProjectionMaintenanceOptions<T>,
): Promise<{ operationId: string; result: T }> {
  verifyOwnedEnvironment(paths);
  const locks = await acquireMaintenanceLocks(paths);
  let database: Database.Database | undefined;
  let currentMarker: MaintenanceMarker | undefined;
  try {
    const existing = existingMarker(paths.maintenancePath);
    if (existing) assertMarkerOwner(existing, options);
    const recovery = options.resolveRecovery
      ? await options.resolveRecovery(existing)
      : (options.recovery ?? {});
    if (existing) assertMarkerRecovery(existing, recovery);
    const operationId = existing?.operationId ?? randomUUID();
    currentMarker = {
      operationId,
      operationType: options.operationType,
      stage: 'PREPARED',
      environmentId: paths.environmentId,
      targetDatabase: paths.databasePath,
      expectedSchemaContract: loadSchemaContract().contractVersion,
      expectedDeploymentId: options.expectedDeploymentId,
      ...recovery,
      ...(existing?.backupId ? { backupId: existing.backupId } : {}),
      startedAt: existing?.startedAt ?? new Date().toISOString(),
    };
    if (!existing) writeMaintenanceMarker(paths.maintenancePath, currentMarker);
    database = openProjectionDatabase(paths.databasePath);
    verifyDatabase(database);
    currentMarker = { ...currentMarker, stage: 'ACTIVE' };
    writeMaintenanceMarker(paths.maintenancePath, currentMarker);
    const context: ProjectionMaintenanceContext = {
      get marker() {
        if (!currentMarker) throw new Error('MAINTENANCE_MARKER_UNAVAILABLE');
        return currentMarker;
      },
      recordBackup(backupId) {
        if (!currentMarker) throw new Error('MAINTENANCE_MARKER_UNAVAILABLE');
        currentMarker = { ...currentMarker, backupId };
        writeMaintenanceMarker(paths.maintenancePath, currentMarker);
      },
    };
    const result = await options.run(database, context);
    database.close();
    database = undefined;
    clearMaintenanceMarker(paths.maintenancePath);
    return { operationId, result };
  } catch (error) {
    if (currentMarker && existsSync(paths.maintenancePath))
      writeMaintenanceMarker(paths.maintenancePath, {
        ...currentMarker,
        stage: 'FAILED',
        lastError: error instanceof Error ? error.message : String(error),
      });
    throw error;
  } finally {
    database?.close();
    await locks.release();
  }
}
