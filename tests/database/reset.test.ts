import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentPaths,
  initializeOwnedEnvironment,
  recoverEnvironment,
  resetEnvironment,
} from '@motorcove/database/maintenance';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('managed environment reset', () => {
  it.each(['databaseDir', 'reportsDir'] as const)(
    'rejects a post-ownership %s symlink before resetting the chain',
    async (pathName) => {
      const root = mkdtempSync(join(tmpdir(), `motorcove-reset-${pathName}-symlink-`));
      roots.push(root);
      const paths = environmentPaths(root, `reset-${pathName.toLowerCase()}-symlink`);
      initializeOwnedEnvironment(paths);
      const external = mkdtempSync(join(tmpdir(), `motorcove-reset-${pathName}-external-`));
      roots.push(external);
      const sentinel = join(external, 'sentinel.txt');
      writeFileSync(sentinel, 'preserve');
      rmSync(paths[pathName], { recursive: true, force: true });
      symlinkSync(external, paths[pathName], 'dir');
      let chainResetCalls = 0;

      await expect(
        resetEnvironment(paths, true, {
          resetChain: async () => {
            chainResetCalls += 1;
          },
        }),
      ).rejects.toThrow('DB_NOT_OWNED');

      expect(chainResetCalls).toBe(0);
      expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
      expect(existsSync(paths.maintenancePath)).toBe(false);

      rmSync(paths[pathName], { force: true });
      mkdirSync(paths[pathName]);
      await resetEnvironment(paths, true, {
        resetChain: async () => {
          chainResetCalls += 1;
        },
      });
      expect(chainResetCalls).toBe(1);
    },
  );

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
    let markerDuringChainReset: unknown;
    const result = await resetEnvironment(paths, true, {
      resetChain: async () => {
        markerDuringChainReset = JSON.parse(readFileSync(paths.maintenancePath, 'utf8'));
      },
    });

    expect(markerDuringChainReset).toMatchObject({
      operationType: 'RESET',
      stage: 'PREPARED',
      resetPhase: 'PREPARED',
    });

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

  it('keeps a PREPARED reset actionable when the chain result is unknown', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-prepared-'));
    roots.push(root);
    const paths = environmentPaths(root, 'reset-prepared');
    initializeOwnedEnvironment(paths);
    writeFileSync(paths.databasePath, 'old-generation');

    await expect(
      resetEnvironment(paths, true, {
        resetChain: async () => {
          throw new Error('CONTROLLED_RESET_RESULT_UNKNOWN');
        },
      }),
    ).rejects.toThrow('CONTROLLED_RESET_RESULT_UNKNOWN');

    expect(JSON.parse(readFileSync(paths.maintenancePath, 'utf8'))).toMatchObject({
      operationType: 'RESET',
      stage: 'FAILED',
      resetPhase: 'PREPARED',
    });
    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: false,
      status: 'ACTION_REQUIRED',
      action: 'RERUN_MATCHING_RESET',
    });
    expect(existsSync(paths.databasePath)).toBe(true);
    expect(existsSync(paths.maintenancePath)).toBe(true);
  });

  it('keeps durable PREPARED intent when the reset process dies after the chain side effect', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-kill-'));
    roots.push(root);
    const environmentId = 'reset-kill';
    const paths = environmentPaths(root, environmentId);
    initializeOwnedEnvironment(paths);
    writeFileSync(paths.databasePath, 'old-generation');
    writeFileSync(paths.deploymentPath, 'old-deployment');

    const child = spawn(
      'corepack',
      [
        'pnpm',
        'exec',
        'tsx',
        resolve(import.meta.dirname, '../fixtures/reset-kill-worker.ts'),
        root,
        environmentId,
      ],
      {
        cwd: resolve(import.meta.dirname, '../..'),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    await new Promise<void>((resolveBarrier, rejectBarrier) => {
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('CHAIN_RESET_COMPLETE')) resolveBarrier();
      });
      child.once('error', rejectBarrier);
      child.once('exit', (code, signal) => {
        rejectBarrier(
          new Error(
            `reset child exited before barrier: code=${String(code)} signal=${signal ?? ''} ${stderr}`,
          ),
        );
      });
    });
    const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
    if (!child.pid) throw new Error('reset child pid unavailable');
    process.kill(-child.pid, 'SIGKILL');
    await exited;

    expect(readFileSync(resolve(paths.environmentDir, 'chain-generation.txt'), 'utf8')).toBe(
      'reset\n',
    );
    expect(JSON.parse(readFileSync(paths.maintenancePath, 'utf8'))).toMatchObject({
      operationType: 'RESET',
      stage: 'PREPARED',
      resetPhase: 'PREPARED',
    });
    expect(existsSync(paths.databasePath)).toBe(true);
    await expect(recoverEnvironment(paths, false)).resolves.toMatchObject({
      changed: false,
      status: 'RECOVERY_REQUIRED',
    });
    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: false,
      status: 'ACTION_REQUIRED',
      action: 'RERUN_MATCHING_RESET',
    });
  });

  it('finishes local cleanup after the chain reset phase survives a filesystem failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-chain-complete-'));
    roots.push(root);
    const paths = environmentPaths(root, 'reset-chain-complete');
    initializeOwnedEnvironment(paths);
    writeFileSync(paths.databasePath, 'old-generation');
    writeFileSync(paths.deploymentPath, 'old-deployment');
    let chainResetCalls = 0;

    chmodSync(paths.databaseDir, 0o500);
    try {
      await expect(
        resetEnvironment(paths, true, {
          resetChain: async () => {
            chainResetCalls += 1;
          },
        }),
      ).rejects.toThrow();
    } finally {
      chmodSync(paths.databaseDir, 0o700);
    }

    expect(chainResetCalls).toBe(1);
    expect(JSON.parse(readFileSync(paths.maintenancePath, 'utf8'))).toMatchObject({
      operationType: 'RESET',
      stage: 'FAILED',
      resetPhase: 'CHAIN_RESET',
    });
    await expect(recoverEnvironment(paths, true)).resolves.toMatchObject({
      changed: true,
      status: 'RECOVERED',
    });
    expect(existsSync(paths.databasePath)).toBe(false);
    expect(existsSync(paths.deploymentPath)).toBe(false);
    expect(existsSync(paths.maintenancePath)).toBe(false);
  });

  it('rejects confirmation omissions and environments without an ownership marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-refusal-'));
    roots.push(root);
    const owned = environmentPaths(root, 'owned');
    initializeOwnedEnvironment(owned);
    await expect(
      resetEnvironment(owned, false, { resetChain: async () => undefined }),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');

    const unowned = environmentPaths(root, 'unowned');
    mkdirSync(unowned.environmentDir, { recursive: true });
    await expect(
      resetEnvironment(unowned, true, { resetChain: async () => undefined }),
    ).rejects.toThrow('DB_NOT_OWNED');
  });
});
import { spawn } from 'node:child_process';
