import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentPaths,
  initializeOwnedEnvironment,
  resetEnvironment,
} from '@motorcove/database/maintenance';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('managed environment reset', () => {
  it('removes generated runtime state while preserving ownership, locks, and backups', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-'));
    roots.push(root);
    const paths = environmentPaths(root, 'reset-test');
    initializeOwnedEnvironment(paths);

    for (const file of [
      paths.databasePath,
      `${paths.databasePath}-wal`,
      `${paths.databasePath}-shm`,
      paths.deploymentPath,
      paths.bootstrapReceiptPath,
      paths.seedJournalPath,
    ])
      writeFileSync(file, 'generated');
    writeFileSync(paths.nodeBindingPath, '{"managed":"node"}\n');
    writeFileSync(join(paths.reportsDir, 'reconciliation.json'), '{}');
    mkdirSync(join(paths.backupsDir, 'snapshot'), { recursive: true });
    writeFileSync(join(paths.backupsDir, 'snapshot', 'motorcove.sqlite'), 'backup');

    const serviceLockInode = statSync(paths.serviceLockPath).ino;
    const writerLockInode = statSync(paths.writerLockPath).ino;
    const result = await resetEnvironment(paths, true);

    expect(result.removed).toEqual(
      expect.arrayContaining([
        paths.databasePath,
        `${paths.databasePath}-wal`,
        `${paths.databasePath}-shm`,
        paths.deploymentPath,
        paths.bootstrapReceiptPath,
        paths.seedJournalPath,
        join(paths.reportsDir, 'reconciliation.json'),
      ]),
    );
    for (const file of [
      paths.databasePath,
      `${paths.databasePath}-wal`,
      `${paths.databasePath}-shm`,
      paths.deploymentPath,
      paths.bootstrapReceiptPath,
      paths.seedJournalPath,
      paths.maintenancePath,
      join(paths.reportsDir, 'reconciliation.json'),
    ])
      expect(existsSync(file)).toBe(false);

    expect(existsSync(paths.ownerPath)).toBe(true);
    expect(existsSync(paths.nodeBindingPath)).toBe(true);
    expect(existsSync(join(paths.backupsDir, 'snapshot', 'motorcove.sqlite'))).toBe(true);
    expect(statSync(paths.serviceLockPath).ino).toBe(serviceLockInode);
    expect(statSync(paths.writerLockPath).ino).toBe(writerLockInode);
  });

  it('rejects confirmation omissions and environments without an ownership marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-refusal-'));
    roots.push(root);
    const owned = environmentPaths(root, 'owned');
    initializeOwnedEnvironment(owned);
    await expect(resetEnvironment(owned, false)).rejects.toThrow('CONFIRMATION_REQUIRED');

    const unowned = environmentPaths(root, 'unowned');
    mkdirSync(unowned.environmentDir, { recursive: true });
    await expect(resetEnvironment(unowned, true)).rejects.toThrow('DB_NOT_OWNED');
  });
});
