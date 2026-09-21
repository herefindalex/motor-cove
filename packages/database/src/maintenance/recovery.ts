import Database from 'better-sqlite3';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths, MaintenanceMarker } from '../types/index.js';
import { clearMaintenanceMarker } from './marker.js';
import { verifyDatabase } from './migrations.js';

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
    if (!existsSync(paths.databasePath) && marker.operationType === 'RESTORE') {
      const staged = resolve(
        paths.environmentDir,
        `.restore-${marker.operationId}`,
        'motorcove.sqlite',
      );
      const quarantined = resolve(
        paths.environmentDir,
        `.quarantine-${marker.operationId}`,
        'motorcove.sqlite',
      );
      const candidate = existsSync(staged)
        ? staged
        : existsSync(quarantined)
          ? quarantined
          : undefined;
      if (candidate) renameSync(candidate, paths.databasePath);
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
