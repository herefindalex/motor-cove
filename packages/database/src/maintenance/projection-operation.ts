import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { openProjectionDatabase } from '../connection/sqlite.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { clearMaintenanceMarker, writeMaintenanceMarker } from './marker.js';
import { loadSchemaContract, verifyDatabase } from './migrations.js';

export interface ProjectionMaintenanceOptions<T> {
  readonly operationType: 'REBUILD_PROJECTION' | 'REINDEX_PROJECTION';
  readonly expectedDeploymentId: string;
  readonly recovery?: {
    readonly reindexFromBlock?: string;
    readonly targetBlock?: string;
    readonly targetHash?: string;
  };
  readonly run: (database: Database.Database) => T | Promise<T>;
}

function resumableMarker(
  path: string,
  options: ProjectionMaintenanceOptions<unknown>,
): MaintenanceMarker | undefined {
  if (!existsSync(path)) return undefined;
  const existing = JSON.parse(readFileSync(path, 'utf8')) as MaintenanceMarker;
  const recovery = options.recovery ?? {};
  const matches =
    existing.operationType === options.operationType &&
    existing.expectedDeploymentId === options.expectedDeploymentId &&
    existing.reindexFromBlock === recovery.reindexFromBlock &&
    existing.targetBlock === recovery.targetBlock &&
    existing.targetHash === recovery.targetHash;
  if (!matches) throw new Error('MAINTENANCE_INCOMPLETE');
  return existing;
}

export async function runProjectionMaintenance<T>(
  paths: EnvironmentPaths,
  options: ProjectionMaintenanceOptions<T>,
): Promise<{ operationId: string; result: T }> {
  verifyOwnedEnvironment(paths);
  const locks = await acquireMaintenanceLocks(paths);
  const existing = resumableMarker(paths.maintenancePath, options);
  const operationId = existing?.operationId ?? randomUUID();
  const marker: MaintenanceMarker = {
    operationId,
    operationType: options.operationType,
    stage: 'PREPARED',
    environmentId: paths.environmentId,
    targetDatabase: paths.databasePath,
    expectedSchemaContract: loadSchemaContract().contractVersion,
    expectedDeploymentId: options.expectedDeploymentId,
    ...options.recovery,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
  };
  let markerOwned = false;
  let database: Database.Database | undefined;
  try {
    if (!existing) writeMaintenanceMarker(paths.maintenancePath, marker);
    markerOwned = true;
    database = openProjectionDatabase(paths.databasePath);
    verifyDatabase(database);
    writeMaintenanceMarker(paths.maintenancePath, { ...marker, stage: 'ACTIVE' });
    const result = await options.run(database);
    database.close();
    database = undefined;
    clearMaintenanceMarker(paths.maintenancePath);
    return { operationId, result };
  } catch (error) {
    if (markerOwned && existsSync(paths.maintenancePath))
      writeMaintenanceMarker(paths.maintenancePath, {
        ...marker,
        stage: 'FAILED',
        lastError: error instanceof Error ? error.message : String(error),
      });
    throw error;
  } finally {
    database?.close();
    await locks.release();
  }
}
