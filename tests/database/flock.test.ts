import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { environmentPaths } from '../../packages/database/src/connection/environment.js';
import {
  acquireAdvisoryLock,
  acquireMaintenanceLocks,
  acquireRuntimeLocks,
} from '../../packages/database/src/connection/flock.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const timeout = (milliseconds = 2_000) =>
  new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('lock release timed out')), milliseconds).unref();
  });

describe('flock helper lifecycle', () => {
  it('releases after the helper already exited by signal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-flock-signal-'));
    roots.push(root);
    const lockPath = join(root, 'signal.lock');
    let helper: ChildProcess | undefined;
    const lock = await acquireAdvisoryLock(lockPath, 'exclusive', {
      onSpawn: (child) => {
        helper = child;
      },
    });
    if (!helper) throw new Error('flock helper was not captured');
    const exited = new Promise<void>((resolveExit) => helper?.once('exit', () => resolveExit()));
    helper.kill('SIGTERM');
    await exited;
    expect(helper.exitCode).toBeNull();
    expect(helper.signalCode).toBe('SIGTERM');

    await expect(Promise.race([lock.release(), timeout()])).resolves.toBeUndefined();
  });

  it('makes parallel and repeated release calls share one completion', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-flock-repeat-'));
    roots.push(root);
    const lock = await acquireAdvisoryLock(join(root, 'repeat.lock'), 'exclusive');
    const first = lock.release();
    const second = lock.release();
    expect(second).toBe(first);
    await expect(Promise.race([Promise.all([first, second]), timeout()])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it('releases composite runtime locks so maintenance can take ownership', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-flock-composite-'));
    roots.push(root);
    const paths = environmentPaths(root, 'flock-composite');
    mkdirSync(dirname(paths.serviceLockPath), { recursive: true });
    const runtime = await acquireRuntimeLocks(paths, true);
    await runtime.release();
    const maintenance = await acquireMaintenanceLocks(paths);
    await maintenance.release();
  });
});
