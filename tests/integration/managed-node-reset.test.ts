import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { environmentPaths } from '../../packages/database/src/connection/environment.js';
import { openProjectionWriter } from '../../packages/database/src/projection-writer/index.js';

describe('managed Anvil reset ownership', () => {
  const repositoryRoot = resolve(import.meta.dirname, '../..');
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'motorcove-managed-anvil-'));
  const firstRpc = 'http://127.0.0.1:18549';
  const secondRpc = 'http://127.0.0.1:18550';
  const foundryPath = resolve(process.env.HOME ?? '', '.foundry/bin');
  const baseEnvironment = {
    ...process.env,
    PATH: `${foundryPath}:${process.env.PATH ?? ''}`,
    MOTORCOVE_WORKSPACE_ROOT: workspaceRoot,
  };
  const firstEnvironment = {
    ...baseEnvironment,
    MOTORCOVE_ENV: 'managed-first',
    MOTORCOVE_RPC_URL: firstRpc,
  };
  const secondEnvironment = {
    ...baseEnvironment,
    MOTORCOVE_ENV: 'managed-second',
    MOTORCOVE_RPC_URL: secondRpc,
  };
  const children: ChildProcess[] = [];

  async function rpc(url: string, method: string): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    });
    return ((await response.json()) as { result?: unknown }).result;
  }

  async function waitForRpc(url: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if (await rpc(url, 'eth_chainId')) return;
      } catch {
        // retry harness-owned Anvil startup
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(`Timed out waiting for ${url}`);
  }

  function startAnvil(port: string): ChildProcess {
    const child = spawn(
      'anvil',
      ['--host', '127.0.0.1', '--port', port, '--chain-id', '31337', '--silent'],
      { env: baseEnvironment, stdio: 'ignore' },
    );
    children.push(child);
    return child;
  }

  function bootstrap(environment: NodeJS.ProcessEnv): void {
    execFileSync('corepack', ['pnpm', '--filter', '@motorcove/indexer', 'bootstrap'], {
      cwd: repositoryRoot,
      env: environment,
      stdio: 'pipe',
    });
  }

  function reset(environment: NodeJS.ProcessEnv, rpcUrl: string) {
    return spawnSync(
      'corepack',
      ['pnpm', '--filter', '@motorcove/indexer', 'exec', 'tsx', 'src/cli/reset.ts', '--yes'],
      {
        cwd: repositoryRoot,
        env: { ...environment, MOTORCOVE_RPC_URL: rpcUrl },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
  }

  beforeAll(async () => {
    startAnvil('18549');
    startAnvil('18550');
    await Promise.all([waitForRpc(firstRpc), waitForRpc(secondRpc)]);
    bootstrap(firstEnvironment);
    bootstrap(secondEnvironment);
  }, 120_000);

  afterAll(() => {
    for (const child of children) child.kill('SIGTERM');
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('rejects shared-node reset before RPC mutation and permits each dedicated node', async () => {
    const firstPaths = environmentPaths(workspaceRoot, 'managed-first');
    const firstWriter = await openProjectionWriter(firstPaths);
    const firstBlock = await rpc(firstRpc, 'eth_blockNumber');
    try {
      const activeConflict = reset(secondEnvironment, firstRpc);
      expect(activeConflict.status).not.toBe(0);
      expect(`${activeConflict.stdout}${activeConflict.stderr}`).toContain(
        'MANAGED_NODE_BINDING_MISMATCH',
      );
      expect(await rpc(firstRpc, 'eth_blockNumber')).toBe(firstBlock);
    } finally {
      await firstWriter.close();
    }

    const idleConflict = reset(secondEnvironment, firstRpc);
    expect(idleConflict.status).not.toBe(0);
    expect(`${idleConflict.stdout}${idleConflict.stderr}`).toContain(
      'MANAGED_NODE_BINDING_MISMATCH',
    );
    expect(await rpc(firstRpc, 'eth_blockNumber')).toBe(firstBlock);

    const secondReset = reset(secondEnvironment, secondRpc);
    expect(`${secondReset.stdout}${secondReset.stderr}`).toContain('"status":"complete"');
    expect(secondReset.status).toBe(0);
    expect(await rpc(firstRpc, 'eth_blockNumber')).toBe(firstBlock);

    const firstReset = reset(firstEnvironment, firstRpc);
    expect(`${firstReset.stdout}${firstReset.stderr}`).toContain('"status":"complete"');
    expect(firstReset.status).toBe(0);
  }, 120_000);
});
