import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { acquireMaintenanceLocks } from '../connection/flock.js';
import { openMaintenanceDatabase } from '../connection/sqlite.js';
import type { EnvironmentPaths } from '../types/index.js';
import { verifyDatabase } from './migrations.js';

/** Diagnostic report writer. Maintenance ownership excludes runtime writes without clearing recovery. */
export async function openReconciliationDatabase(
  paths: EnvironmentPaths,
): Promise<{ database: Database.Database; close(): Promise<void> }> {
  verifyOwnedEnvironment(paths);
  const locks = await acquireMaintenanceLocks(paths);
  try {
    if (existsSync(paths.maintenancePath)) throw new Error('MAINTENANCE_INCOMPLETE');
    const database = openMaintenanceDatabase(paths.databasePath);
    try {
      verifyDatabase(database);
    } catch (error) {
      database.close();
      throw error;
    }
    return {
      database,
      async close() {
        database.close();
        await locks.release();
      },
    };
  } catch (error) {
    await locks.release();
    throw error;
  }
}
