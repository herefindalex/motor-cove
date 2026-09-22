import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths } from '../types/index.js';

export const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');
export const schemaContractPath = resolve(import.meta.dirname, '../../schema-contract.json');
export const schemaSourceFolder = resolve(import.meta.dirname, '../schema');

export interface SchemaContract {
  readonly formatVersion: 1;
  readonly contractVersion: string;
  readonly toolchain: {
    readonly drizzleOrm: string;
    readonly drizzleKit: string;
    readonly betterSqlite3: string;
  };
  readonly migrations: readonly {
    readonly id: string;
    readonly createdAt: number;
    readonly hash: string;
  }[];
  readonly migrationBundleDigest: string;
  readonly schemaFingerprint: string;
  readonly schemaSourceDigest: string;
  readonly requiredProjectorVersion: string;
}

export function schemaSourceDigest(folder = schemaSourceFolder): string {
  const hash = createHash('sha256');
  for (const name of readdirSync(folder)
    .filter((item) => item.endsWith('.ts'))
    .sort()) {
    hash
      .update(name)
      .update('\0')
      .update(readFileSync(resolve(folder, name)))
      .update('\0');
  }
  return hash.digest('hex');
}

export interface MigrationDescriptor {
  readonly id: string;
  readonly createdAt: number;
  readonly hash: string;
}

export function migrationBundle(): MigrationDescriptor[] {
  const journal = JSON.parse(
    readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string; when: number }> };
  const native = readMigrationFiles({ migrationsFolder });
  return native.map((item, index) => {
    const entry = journal.entries[index];
    if (!entry) throw new Error('DB_HISTORY_DIVERGED: migration journal and SQL files differ');
    return { id: entry.tag, createdAt: item.folderMillis, hash: item.hash };
  });
}

export function migrationBundleDigest(bundle = migrationBundle()): string {
  return createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
}

export function normalizedSchema(db: Database.Database) {
  return db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY type,name,tbl_name",
    )
    .all();
}

export function schemaFingerprint(db: Database.Database): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizedSchema(db)))
    .digest('hex');
}

export function loadSchemaContract(): SchemaContract {
  return JSON.parse(readFileSync(schemaContractPath, 'utf8')) as SchemaContract;
}

export function readNativeHistory(
  db: Database.Database,
): Array<{ id: number; hash: string; created_at: number }> {
  const table = db
    .prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='__drizzle_migrations'")
    .get();
  return table
    ? (db
        .prepare('SELECT id,hash,created_at FROM __drizzle_migrations ORDER BY created_at,id')
        .all() as Array<{ id: number; hash: string; created_at: number }>)
    : [];
}

export function assertKnownHistory(db: Database.Database): void {
  const bundle = migrationBundle();
  const history = readNativeHistory(db);
  const hasApplicationTables = Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' LIMIT 1",
      )
      .get(),
  );
  if (history.length === 0 && hasApplicationTables)
    throw new Error('DB_HISTORY_DIVERGED: non-empty database has no native ledger');
  if (history.length > bundle.length) throw new Error('DB_HISTORY_DIVERGED: unknown migration');
  for (const [index, row] of history.entries()) {
    const expected = bundle[index];
    if (!expected || row.hash !== expected.hash || row.created_at !== expected.createdAt)
      throw new Error('DB_HISTORY_DIVERGED: applied migration differs from repository');
  }
}

export function verifyDatabase(db: Database.Database, requireCurrent = true) {
  assertKnownHistory(db);
  const contract = loadSchemaContract();
  const history = readNativeHistory(db);
  if (requireCurrent && history.length !== contract.migrations.length)
    throw new Error('DB_SCHEMA_BEHIND');
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`DB_INTEGRITY_ERROR: ${String(integrity)}`);
  const foreignKeys = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeys.length) throw new Error('DB_FOREIGN_KEY_ERROR');
  const fingerprint = schemaFingerprint(db);
  if (requireCurrent && fingerprint !== contract.schemaFingerprint)
    throw new Error('DB_SCHEMA_DRIFT');
  return {
    historyCount: history.length,
    fingerprint,
    integrity,
    foreignKeyErrors: foreignKeys.length,
  };
}

export function verifyKnownSourceDatabase(
  db: Database.Database,
  knownBundle: readonly MigrationDescriptor[] = migrationBundle(),
) {
  const verification = verifyDatabase(db, false);
  const history = readNativeHistory(db);
  if (history.length === 0) {
    return {
      ...verification,
      contractVersion: null,
      migrationBundleDigest: migrationBundleDigest([]),
    };
  }
  const contract = db
    .prepare(
      'SELECT contract_version AS contractVersion,migration_bundle_digest AS migrationBundleDigest,schema_fingerprint AS schemaFingerprint FROM db_contract WHERE id=1',
    )
    .get() as
    | {
        contractVersion: string;
        migrationBundleDigest: string;
        schemaFingerprint: string;
      }
    | undefined;
  if (!contract) throw new Error('DB_SOURCE_CONTRACT_MISSING');
  const expectedDigest = migrationBundleDigest(knownBundle.slice(0, history.length));
  if (contract.migrationBundleDigest !== expectedDigest)
    throw new Error('DB_SOURCE_CONTRACT_DRIFT: migration digest');
  if (contract.schemaFingerprint !== verification.fingerprint)
    throw new Error('DB_SOURCE_CONTRACT_DRIFT: schema fingerprint');
  return {
    ...verification,
    contractVersion: contract.contractVersion,
    migrationBundleDigest: expectedDigest,
  };
}

export function finalizeDatabaseContract(db: Database.Database) {
  const contract = loadSchemaContract();
  const verification = verifyDatabase(db);
  db.prepare(
    `INSERT INTO db_contract(
      id,contract_version,migration_bundle_digest,schema_fingerprint,verified_at
    ) VALUES (1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      contract_version=excluded.contract_version,
      migration_bundle_digest=excluded.migration_bundle_digest,
      schema_fingerprint=excluded.schema_fingerprint,
      verified_at=excluded.verified_at`,
  ).run(
    contract.contractVersion,
    contract.migrationBundleDigest,
    contract.schemaFingerprint,
    new Date().toISOString(),
  );
  verifyKnownSourceDatabase(db);
  return verification;
}

export function inspectEnvironment(paths: EnvironmentPaths) {
  if (!existsSync(paths.ownerPath))
    return { exists: false, environmentId: paths.environmentId, code: 'DB_NOT_INITIALIZED' };
  verifyOwnedEnvironment(paths);
  if (!existsSync(paths.databasePath))
    return {
      exists: true,
      databaseExists: false,
      environmentId: paths.environmentId,
      marker: existsSync(paths.maintenancePath),
    };
  const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
  try {
    const history = readNativeHistory(db);
    return {
      exists: true,
      databaseExists: true,
      environmentId: paths.environmentId,
      marker: existsSync(paths.maintenancePath),
      applied: history.length,
      total: migrationBundle().length,
      pending: migrationBundle()
        .slice(history.length)
        .map((item) => item.id),
    };
  } finally {
    db.close();
  }
}
