import Database from 'better-sqlite3';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  backupEnvironment,
  recoverEnvironment,
  restoreEnvironment,
} from '@motorcove/database/maintenance';
import { databaseFixture } from '../helpers/database.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('backup, restore, recovery', () => {
  it('DB-47 snapshots committed WAL data into a standalone database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const writer = new Database(paths.databasePath);
    writer.pragma('journal_mode = WAL');
    writer
      .prepare(
        `INSERT INTO catalog_vehicles VALUES ('wal','WAL row','committed','M','2026','/wal.svg','MANUAL',NULL,NULL,'x','x')`,
      )
      .run();
    const backup = await backupEnvironment(paths);
    expect(backup.manifest).toMatchObject({
      migrationCount: backup.verification.historyCount,
      migrationBundleDigest: backup.verification.migrationBundleDigest,
      schemaFingerprint: backup.verification.fingerprint,
      schemaContractVersion: backup.verification.contractVersion,
    });
    writer.close();
    const snapshot = new Database(resolve(backup.path, 'database.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      snapshot.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='wal'`).get(),
    ).toEqual({ name: 'WAL row' });
    snapshot.close();
  });
  it('DB-48 rejects a corrupted backup without changing active data', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const backup = await backupEnvironment(paths);
    writeFileSync(resolve(backup.path, 'database.sqlite'), 'corrupt');
    await expect(restoreEnvironment(paths, backup.backupId, true)).rejects.toThrow(
      'BACKUP_INVALID',
    );
    const active = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(active.pragma('integrity_check', { simple: true })).toBe('ok');
    active.close();
  });
  it.each(['MIGRATE', 'RESTORE', 'REINDEX_PROJECTION'] as const)(
    'preserves an existing %s marker byte-for-byte when restore is rejected',
    async (operationType) => {
      const { root, paths } = await databaseFixture();
      roots.push(root);
      const original = `${JSON.stringify({
        operationId: `original-${operationType.toLowerCase()}`,
        operationType,
        stage: 'FAILED',
        environmentId: paths.environmentId,
        targetDatabase: paths.databasePath,
        expectedSchemaContract: '1',
        startedAt: '2026-09-21T00:00:00.000Z',
      })}\n`;
      writeFileSync(paths.maintenancePath, original);
      const beforeEntries = readdirSync(paths.environmentDir).sort();

      await expect(
        restoreEnvironment(paths, '2026-09-21T00-00-00-000Z-deadbeef', true),
      ).rejects.toThrow('MAINTENANCE_INCOMPLETE');

      expect(readFileSync(paths.maintenancePath, 'utf8')).toBe(original);
      expect(readdirSync(paths.environmentDir).sort()).toEqual(beforeEntries);
      const active = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
      expect(active.pragma('integrity_check', { simple: true })).toBe('ok');
      active.close();
    },
  );

  it('restores a verified snapshot while quarantining the current database', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const before = new Database(paths.databasePath);
    before
      .prepare(
        `INSERT INTO catalog_vehicles VALUES ('kept','Before','snapshot','M','2026','/before.svg','MANUAL',NULL,NULL,'x','x')`,
      )
      .run();
    before.close();
    const backup = await backupEnvironment(paths);
    const changed = new Database(paths.databasePath);
    changed.prepare(`UPDATE catalog_vehicles SET name='After' WHERE catalog_id='kept'`).run();
    changed.close();
    const result = await restoreEnvironment(paths, backup.backupId, true);
    const restored = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      restored.prepare(`SELECT name FROM catalog_vehicles WHERE catalog_id='kept'`).get(),
    ).toEqual({ name: 'Before' });
    restored.close();
    expect(result.quarantine).toContain('.quarantine-');
  });
  it('DB-50 recovers a restore crash from quarantine without mixing sidecars', async () => {
    const { root, paths } = await databaseFixture();
    roots.push(root);
    const operationId = 'restore-crash';
    const quarantine = resolve(paths.environmentDir, `.quarantine-${operationId}`);
    const { mkdirSync, renameSync } = await import('node:fs');
    mkdirSync(quarantine);
    renameSync(paths.databasePath, resolve(quarantine, 'motorcove.sqlite'));
    writeFileSync(
      paths.maintenancePath,
      JSON.stringify({
        operationId,
        operationType: 'RESTORE',
        stage: 'ACTIVE_QUARANTINED',
        environmentId: 'test',
        targetDatabase: paths.databasePath,
        expectedSchemaContract: '1',
        startedAt: new Date(0).toISOString(),
      }),
    );
    expect((await recoverEnvironment(paths, true)).status).toBe('RECOVERED');
    const db = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    db.close();
  });
});
