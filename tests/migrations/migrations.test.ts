import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentPaths,
  inspectEnvironment,
  migrateEnvironment,
  recoverEnvironment,
  verifyDatabase,
  schemaSourceDigest,
  loadSchemaContract,
} from '@motorcove/database/maintenance';
import { databaseFixture } from '../helpers/database.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native migration path', () => {
  it('DB-01/02 creates a fresh database and reruns as a no-op', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(
      `INSERT INTO catalog_vehicles VALUES ('manual','Manual','kept','M','2026','/m.svg','MANUAL',NULL,NULL,'x','x')`,
    ).run();
    const before = (
      db.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number }
    ).count;
    db.close();
    const result = await migrateEnvironment(paths);
    expect(result.changed).toBe(false);
    const after = new Database(paths.databasePath);
    expect(
      (after.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number })
        .count,
    ).toBe(before);
    expect(
      after.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='manual'`).get(),
    ).toEqual({ name: 'Manual' });
    after.close();
  });
  it('DB-05 rejects tampered native history', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare(`UPDATE __drizzle_migrations SET hash='tampered'`).run();
    db.close();
    await expect(migrateEnvironment(paths)).rejects.toThrow('DB_HISTORY_DIVERGED');
    expect(existsSync(paths.maintenancePath)).toBe(true);
  });
  it('DB-04 rolls back injected migration SQL failure and retains a diagnostic marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-failing-migration-'));
    roots.push(root);
    const paths = environmentPaths(root, 'failing-migration');
    await expect(
      migrateEnvironment(paths, {
        applyMigrations: (db) =>
          db.transaction(() => {
            db.exec('CREATE TABLE injected_migration_partial(id INTEGER PRIMARY KEY)');
            db.exec('INSERT INTO table_that_does_not_exist VALUES (1)');
          })(),
      }),
    ).rejects.toThrow('table_that_does_not_exist');
    expect(existsSync(paths.maintenancePath)).toBe(true);
    const marker = JSON.parse(readFileSync(paths.maintenancePath, 'utf8')) as {
      stage: string;
      lastError: string;
    };
    expect(marker.stage).toBe('FAILED');
    expect(marker.lastError).toContain('table_that_does_not_exist');
    const db = new Database(paths.databasePath);
    expect(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE name='injected_migration_partial'").get(),
    ).toBeUndefined();
    db.close();
  });
  it('DB-05 rejects an unknown applied migration', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run(
      'unknown-migration',
      Date.now(),
    );
    db.close();
    await expect(migrateEnvironment(paths)).rejects.toThrow(
      'DB_HISTORY_DIVERGED: unknown migration',
    );
  });
  it('DB-06 binds the checked schema sources to the generated contract', () => {
    expect(schemaSourceDigest()).toBe(loadSchemaContract().schemaSourceDigest);
  });
  it('DB-07 detects live schema drift', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.exec('DROP INDEX sales_status');
    expect(() => verifyDatabase(db)).toThrow('DB_SCHEMA_DRIFT');
    db.close();
  });
  it('DB-08 fails fast for a schema behind the code contract', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    db.prepare('DELETE FROM __drizzle_migrations').run();
    expect(() => verifyDatabase(db)).toThrow('DB_HISTORY_DIVERGED');
    db.close();
  });
  it('DB-09 completes a verified post-migration crash marker without rerunning migration', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const db = new Database(paths.databasePath);
    const before = (
      db.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number }
    ).count;
    db.close();
    await import('node:fs').then(({ writeFileSync }) =>
      writeFileSync(
        paths.maintenancePath,
        JSON.stringify({
          operationId: 'crash',
          operationType: 'MIGRATE',
          stage: 'VERIFYING',
          environmentId: 'test',
          targetDatabase: paths.databasePath,
          expectedSchemaContract: '1',
          startedAt: new Date(0).toISOString(),
        }),
      ),
    );
    expect((await recoverEnvironment(paths, false)).status).toBe('RECOVERY_REQUIRED');
    expect((await recoverEnvironment(paths, true)).status).toBe('RECOVERED');
    const after = new Database(paths.databasePath);
    expect(
      (after.prepare('SELECT count(*) count FROM __drizzle_migrations').get() as { count: number })
        .count,
    ).toBe(before);
    after.close();
  });
  it('status is read-only and does not create a missing environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-missing-'));
    roots.push(root);
    const paths = environmentPaths(root, 'missing');
    expect(inspectEnvironment(paths).exists).toBe(false);
    expect(existsSync(paths.environmentDir)).toBe(false);
  });
});
