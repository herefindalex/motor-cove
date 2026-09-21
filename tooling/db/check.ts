import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
  loadSchemaContract,
  migrationBundleDigest,
  migrationBundle,
  schemaFingerprint,
  schemaSourceDigest,
} from '@motorcove/database/maintenance';
import { output } from './args.js';
const directory = mkdtempSync(join(tmpdir(), 'motorcove-db-check-'));
try {
  const db = new Database(join(directory, 'check.sqlite'));
  db.pragma('foreign_keys = ON');
  migrate(drizzle(db), {
    migrationsFolder: new URL('../../packages/database/drizzle', import.meta.url).pathname,
  });
  const contract = loadSchemaContract();
  const digest = migrationBundleDigest(migrationBundle());
  const fingerprint = schemaFingerprint(db);
  db.close();
  if (digest !== contract.migrationBundleDigest)
    throw new Error('DB_HISTORY_DIVERGED: schema contract bundle digest');
  if (fingerprint !== contract.schemaFingerprint)
    throw new Error('DB_SCHEMA_DRIFT: schema contract fingerprint');
  if (schemaSourceDigest() !== contract.schemaSourceDigest)
    throw new Error('DB_SCHEMA_SOURCE_DRIFT: schema changed without a reviewed migration');
  const sql = readFileSync(
    new URL('../../packages/database/drizzle/0000_initial.sql', import.meta.url),
    'utf8',
  );
  for (const forbidden of ['writable_schema', 'drizzle-kit push'])
    if (sql.toLowerCase().includes(forbidden))
      throw new Error(`FORBIDDEN_MIGRATION_SQL: ${forbidden}`);
  output({
    status: 'ok',
    migrationBundleDigest: digest,
    schemaFingerprint: fingerprint,
    schemaSourceDigest: contract.schemaSourceDigest,
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
