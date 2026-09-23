import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment, verifyResetDestructivePaths } from '../connection/environment.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { clearMaintenanceMarker, writeMaintenanceMarker } from './marker.js';
import { loadSchemaContract } from './migrations.js';

export interface ResetEnvironmentOptions {
  readonly locksAlreadyHeld?: boolean;
  readonly resetChain: () => Promise<void>;
}

export function clearResetGeneratedState(paths: EnvironmentPaths): readonly string[] {
  verifyResetDestructivePaths(paths);
  const targets = [
    paths.databasePath,
    `${paths.databasePath}-wal`,
    `${paths.databasePath}-shm`,
    paths.deploymentPath,
    paths.bootstrapReceiptPath,
    paths.seedJournalPath,
  ];
  const removed: string[] = [];
  for (const target of targets) {
    if (!existsSync(target)) continue;
    rmSync(target, { force: true });
    removed.push(target);
  }
  for (const entry of readdirSync(paths.reportsDir)) {
    const report = resolve(paths.reportsDir, entry);
    rmSync(report, { force: true, recursive: true });
    removed.push(report);
  }
  return removed;
}

export async function resetEnvironment(
  paths: EnvironmentPaths,
  confirmed: boolean,
  options: ResetEnvironmentOptions,
): Promise<{ operationId: string; removed: readonly string[] }> {
  if (!confirmed) throw new Error('CONFIRMATION_REQUIRED');
  verifyOwnedEnvironment(paths);
  const locks = options.locksAlreadyHeld ? undefined : await acquireMaintenanceLocks(paths);
  const operationId = randomUUID();
  let marker: MaintenanceMarker = {
    operationId,
    operationType: 'RESET',
    stage: 'PREPARED',
    environmentId: paths.environmentId,
    targetDatabase: paths.databasePath,
    expectedSchemaContract: loadSchemaContract().contractVersion,
    resetPhase: 'PREPARED',
    startedAt: new Date().toISOString(),
  };
  let markerOwned = false;
  try {
    verifyResetDestructivePaths(paths);
    writeMaintenanceMarker(paths.maintenancePath, marker);
    markerOwned = true;
    await options.resetChain();
    marker = { ...marker, stage: 'CHAIN_RESET', resetPhase: 'CHAIN_RESET' };
    writeMaintenanceMarker(paths.maintenancePath, marker);
    const removed = clearResetGeneratedState(paths);
    marker = { ...marker, stage: 'LOCAL_STATE_CLEARED', resetPhase: 'LOCAL_STATE_CLEARED' };
    writeMaintenanceMarker(paths.maintenancePath, marker);
    clearMaintenanceMarker(paths.maintenancePath);
    return { operationId, removed };
  } catch (error) {
    if (markerOwned)
      writeMaintenanceMarker(paths.maintenancePath, {
        ...marker,
        stage: 'FAILED',
        lastError: error instanceof Error ? error.message : String(error),
      });
    throw error;
  } finally {
    await locks?.release();
  }
}
