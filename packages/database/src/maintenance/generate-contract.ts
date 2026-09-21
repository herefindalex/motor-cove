import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
  migrationBundle,
  migrationBundleDigest,
  migrationsFolder,
  schemaContractPath,
  schemaFingerprint,
  schemaSourceDigest,
} from './migrations.js';

const directory = mkdtempSync(join(tmpdir(), 'motorcove-contract-'));
try {
  const db = new Database(join(directory, 'contract.sqlite'));
  db.pragma('foreign_keys = ON');
  migrate(drizzle(db), { migrationsFolder });
  const migrations = migrationBundle();
  const contract = {
    formatVersion: 1,
    contractVersion: '1',
    toolchain: { drizzleOrm: '0.45.2', drizzleKit: '0.31.10', betterSqlite3: '13.0.3' },
    migrations,
    migrationBundleDigest: migrationBundleDigest(migrations),
    schemaFingerprint: schemaFingerprint(db),
    schemaSourceDigest: schemaSourceDigest(),
    requiredProjectorVersion: '1',
  } as const;
  db.close();
  writeFileSync(schemaContractPath, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(JSON.stringify({ schemaContractPath, ...contract }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
