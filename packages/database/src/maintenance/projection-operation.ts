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
  recordProjectionPhase(phase: 'PREPARING' | 'CATCHING_UP'): void;
}

export interface ProjectionMaintenanceOptions<T> {
  readonly operationType: 'REBUILD_PROJECTION' | 'REINDEX_PROJECTION';
  readonly expectedDeploymentId: string;
  readonly recovery?: ProjectionRecovery;
  readonly sourceIncompleteRebuildTransition?: {
    readonly requiredReindexFromBlock: string;
  };
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
  paths: EnvironmentPaths,
): void {
  if (
    existing.operationType !== options.operationType ||
    existing.expectedDeploymentId !== options.expectedDeploymentId ||
    existing.environmentId !== paths.environmentId ||
    existing.targetDatabase !== paths.databasePath ||
    existing.expectedSchemaContract !== loadSchemaContract().contractVersion
  )
    throw new Error('MAINTENANCE_INCOMPLETE');
}

function isSourceIncompleteRebuildTransition(
  existing: MaintenanceMarker,
  options: ProjectionMaintenanceOptions<unknown>,
  paths: EnvironmentPaths,
): boolean {
  if (
    !options.sourceIncompleteRebuildTransition ||
    options.operationType !== 'REINDEX_PROJECTION' ||
    existing.operationType !== 'REBUILD_PROJECTION' ||
    existing.stage !== 'FAILED' ||
    !existing.lastError?.startsWith('REBUILD_SOURCE_INCOMPLETE')
  )
    return false;
  if (
    existing.expectedDeploymentId !== options.expectedDeploymentId ||
    existing.environmentId !== paths.environmentId ||
    existing.targetDatabase !== paths.databasePath ||
    existing.expectedSchemaContract !== loadSchemaContract().contractVersion
  )
    throw new Error('MAINTENANCE_INCOMPLETE');
  return true;
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
    const transition = existing
      ? isSourceIncompleteRebuildTransition(existing, options, paths)
      : false;
    if (existing && !transition) assertMarkerOwner(existing, options, paths);
    const recovery = options.resolveRecovery
      ? await options.resolveRecovery(transition ? undefined : existing)
      : (options.recovery ?? {});
    if (
      transition &&
      (recovery.reindexFromBlock !==
        options.sourceIncompleteRebuildTransition?.requiredReindexFromBlock ||
        recovery.targetBlock === undefined ||
        recovery.targetHash === undefined)
    )
      throw new Error('MAINTENANCE_INCOMPLETE');
    if (existing && !transition) assertMarkerRecovery(existing, recovery);
    const operationId = transition ? randomUUID() : (existing?.operationId ?? randomUUID());
    const transitionEvidence: Partial<MaintenanceMarker> =
      transition && existing
        ? {
            transitionedFromOperationId: existing.operationId,
            transitionedFromOperationType: existing.operationType,
            ...(existing.lastError ? { transitionedFromLastError: existing.lastError } : {}),
          }
        : {
            ...(existing?.transitionedFromOperationId
              ? { transitionedFromOperationId: existing.transitionedFromOperationId }
              : {}),
            ...(existing?.transitionedFromOperationType
              ? { transitionedFromOperationType: existing.transitionedFromOperationType }
              : {}),
            ...(existing?.transitionedFromLastError
              ? { transitionedFromLastError: existing.transitionedFromLastError }
              : {}),
          };
    const preparedMarker: MaintenanceMarker = {
      operationId,
      operationType: options.operationType,
      stage: 'PREPARED',
      environmentId: paths.environmentId,
      targetDatabase: paths.databasePath,
      expectedSchemaContract: loadSchemaContract().contractVersion,
      expectedDeploymentId: options.expectedDeploymentId,
      ...recovery,
      ...(existing?.backupId ? { backupId: existing.backupId } : {}),
      ...(existing?.projectionPhase ? { projectionPhase: existing.projectionPhase } : {}),
      ...transitionEvidence,
      startedAt: transition
        ? new Date().toISOString()
        : (existing?.startedAt ?? new Date().toISOString()),
    };
    currentMarker = preparedMarker;
    if (!existing || transition) writeMaintenanceMarker(paths.maintenancePath, preparedMarker);
    database = openProjectionDatabase(paths.databasePath);
    verifyDatabase(database);
    const activeMarker: MaintenanceMarker = { ...preparedMarker, stage: 'ACTIVE' };
    currentMarker = activeMarker;
    writeMaintenanceMarker(paths.maintenancePath, activeMarker);
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
      recordProjectionPhase(projectionPhase) {
        if (!currentMarker) throw new Error('MAINTENANCE_MARKER_UNAVAILABLE');
        currentMarker = { ...currentMarker, projectionPhase };
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
