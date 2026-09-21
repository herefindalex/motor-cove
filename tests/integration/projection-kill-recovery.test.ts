import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recoverEnvironment, runProjectionMaintenance } from '@motorcove/database/maintenance';
import { openProjectionWriter } from '@motorcove/database/projection-writer';
import { SqliteProjectionStore } from '../../apps/indexer/src/adapters/sqlite/sqlite-projection-store.js';
import { databaseFixture, hashes } from '../helpers/database.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('projection recovery after process termination', () => {
  it('keeps the service blocked after SIGKILL between rewind and rebuild, then resumes safely', async () => {
    const { root, paths } = await databaseFixture('projection-kill');
    roots.push(root);
    const helper = resolve(import.meta.dirname, '../helpers/interrupted-reindex-child.ts');
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        helper,
        root,
        paths.environmentId,
        hashes.deployment,
        hashes.address,
        hashes.scope,
        '1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise<void>((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(new Error('child rewind timed out')), 10_000);
      child.once('error', reject);
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('REWIND_COMMITTED')) {
          clearTimeout(timeout);
          resolveReady();
        }
      });
    });
    child.kill('SIGKILL');
    await new Promise<void>((resolveClosed) => child.once('close', () => resolveClosed()));

    expect(existsSync(paths.maintenancePath)).toBe(true);
    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: false,
      status: 'ACTION_REQUIRED',
    });
    await expect(openProjectionWriter(paths)).rejects.toThrow('MAINTENANCE_INCOMPLETE');

    const interrupted = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      interrupted
        .prepare(
          'SELECT last_scanned_block AS block,projection_build_id AS build FROM indexer_checkpoint WHERE deployment_id=?',
        )
        .get(hashes.deployment),
    ).toEqual({ block: null, build: 'build-test' });
    expect(
      interrupted
        .prepare(
          'SELECT projection_status AS status FROM indexer_runtime_status WHERE deployment_id=?',
        )
        .get(hashes.deployment),
    ).toEqual({ status: 'REBUILD_REQUIRED' });
    interrupted.close();

    const resumed = await runProjectionMaintenance(paths, {
      operationType: 'REINDEX_PROJECTION',
      expectedDeploymentId: hashes.deployment,
      recovery: {
        reindexFromBlock: '1',
        targetBlock: '1',
        targetHash: hashes.block,
      },
      run: (database) =>
        new SqliteProjectionStore(
          database,
          hashes.deployment,
          hashes.address,
          hashes.scope,
        ).rebuildFromJournal(),
    });
    expect(resumed.result.events).toBe(0);
    expect(existsSync(paths.maintenancePath)).toBe(false);

    const rebuilt = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
    expect(
      rebuilt
        .prepare(
          'SELECT projection_status AS status FROM indexer_runtime_status WHERE deployment_id=?',
        )
        .get(hashes.deployment),
    ).toEqual({ status: 'CURRENT' });
    expect(
      (
        rebuilt
          .prepare(
            'SELECT projection_build_id AS build FROM indexer_checkpoint WHERE deployment_id=?',
          )
          .get(hashes.deployment) as { build: string }
      ).build,
    ).not.toBe('build-test');
    rebuilt.close();
  });
});
