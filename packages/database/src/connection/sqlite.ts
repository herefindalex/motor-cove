import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export function openMaintenanceDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  return db;
}

export function openProjectionDatabase(path: string): Database.Database {
  if (!existsSync(path)) throw new Error('DB_NOT_INITIALIZED');
  const db = new Database(path, { fileMustExist: true });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = FULL');
  if (db.pragma('journal_mode', { simple: true }) !== 'wal') {
    db.close();
    throw new Error('DB_SCHEMA_DRIFT: journal_mode must be WAL');
  }
  return db;
}

export function openReadOnlyDatabase(path: string): Database.Database {
  if (!existsSync(path)) throw new Error('DB_NOT_INITIALIZED');
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('query_only = ON');
  return db;
}
