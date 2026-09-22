import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGTERM');
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const exit = (child: ChildProcess) =>
  new Promise<{ code: number | null; stderr: string }>((resolveExit) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.once('exit', (code) => resolveExit({ code, stderr }));
  });

describe('bootstrap ownership', () => {
  it('allows only one process into the protected bootstrap callback', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-bootstrap-owner-'));
    roots.push(root);
    const ready = join(root, 'ready');
    const release = join(root, 'release');
    const counter = join(root, 'counter');
    const helper = resolve(import.meta.dirname, '../helpers/bootstrap-ownership-child.ts');
    const args = ['--import', 'tsx', helper, root, 'concurrent-seed', ready, release, counter];
    const first = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    children.push(first);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if (readFileSync(ready, 'utf8') === 'ready\n') break;
      } catch {
        await wait(20);
      }
    }
    expect(readFileSync(ready, 'utf8')).toBe('ready\n');

    const second = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    children.push(second);
    const secondExit = await exit(second);
    expect(secondExit.code).not.toBe(0);
    expect(secondExit.stderr).toContain('RESOURCE_BUSY');
    expect(readFileSync(counter, 'utf8').trim().split('\n')).toHaveLength(1);

    writeFileSync(release, 'release\n');
    expect((await exit(first)).code).toBe(0);
    expect(readFileSync(counter, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
