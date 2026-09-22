import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EnvironmentPaths } from '../types/index.js';

export interface AdvisoryLock {
  release(): Promise<void>;
}

export async function acquireAdvisoryLock(
  path: string,
  mode: 'shared' | 'exclusive',
): Promise<AdvisoryLock> {
  const child = spawn(
    'flock',
    [
      '--nonblock',
      mode === 'shared' ? '--shared' : '--exclusive',
      path,
      'sh',
      '-c',
      'printf "ACQUIRED\\n"; cat >/dev/null',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const outcome = await new Promise<'acquired' | 'busy'>((resolveOutcome, reject) => {
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('ACQUIRED\n')) resolveOutcome('acquired');
    });
    child.once('error', reject);
    child.once('exit', (code) => resolveOutcome(code === 1 ? 'busy' : 'busy'));
  });
  if (outcome === 'busy') {
    child.stdin.destroy();
    throw new Error('RESOURCE_BUSY');
  }
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      child.stdin.end();
      await new Promise<void>((resolveExit) => {
        if (child.exitCode !== null) resolveExit();
        else child.once('exit', () => resolveExit());
      });
    },
  };
}

export async function acquireBootstrapOwnership(paths: EnvironmentPaths): Promise<AdvisoryLock> {
  mkdirSync(dirname(paths.bootstrapLockPath), { recursive: true });
  return acquireAdvisoryLock(paths.bootstrapLockPath, 'exclusive');
}

export async function acquireRuntimeLocks(paths: EnvironmentPaths, writer: boolean) {
  const serviceGate = await acquireAdvisoryLock(paths.serviceLockPath, 'shared');
  try {
    const writerLock = writer
      ? await acquireAdvisoryLock(paths.writerLockPath, 'exclusive')
      : undefined;
    return {
      async release() {
        await writerLock?.release();
        await serviceGate.release();
      },
    };
  } catch (error) {
    await serviceGate.release();
    throw error;
  }
}

export async function acquireMaintenanceLocks(paths: EnvironmentPaths) {
  const serviceGate = await acquireAdvisoryLock(paths.serviceLockPath, 'exclusive');
  try {
    const writerLock = await acquireAdvisoryLock(paths.writerLockPath, 'exclusive');
    return {
      async release() {
        await writerLock.release();
        await serviceGate.release();
      },
    };
  } catch (error) {
    await serviceGate.release();
    throw error;
  }
}
