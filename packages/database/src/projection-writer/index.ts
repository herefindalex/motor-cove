import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { acquireRuntimeLocks } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import { openProjectionDatabase } from '../connection/sqlite.js';
import { verifyDatabase } from '../maintenance/migrations.js';
import type { EnvironmentPaths } from '../types/index.js';

export interface ProjectionWriterConnection {
  /** Database adapter only. Application and domain code must not retain this handle. */
  readonly database: Database.Database;
  close(): Promise<void>;
}

export async function openProjectionWriter(
  paths: EnvironmentPaths,
): Promise<ProjectionWriterConnection> {
  verifyOwnedEnvironment(paths);
  const locks = await acquireRuntimeLocks(paths, true);
  try {
    if (existsSync(paths.maintenancePath)) throw new Error('MAINTENANCE_INCOMPLETE');
    const database = openProjectionDatabase(paths.databasePath);
    verifyDatabase(database);
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
