import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireBootstrapOwnership,
  claimManagedNode,
  environmentPaths,
  initializeOwnedEnvironment,
} from '@motorcove/database/maintenance';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function runReset(environment: NodeJS.ProcessEnv) {
  const child = spawn(
    'corepack',
    ['pnpm', '--filter', '@motorcove/indexer', 'exec', 'tsx', 'src/cli/reset.ts', '--yes'],
    {
      cwd: resolve(import.meta.dirname, '../..'),
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', resolveExit);
  });
  return { code, output };
}

describe('local reset CLI refusal matrix', () => {
  it('DB-51 refuses non-loopback RPC before making a request', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-cli-'));
    roots.push(root);
    initializeOwnedEnvironment(environmentPaths(root, 'reset-cli'));
    const result = await runReset({
      ...process.env,
      MOTORCOVE_WORKSPACE_ROOT: root,
      MOTORCOVE_ENV: 'reset-cli',
      MOTORCOVE_RPC_URL: 'https://example.invalid',
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('RESET_RPC_REFUSED');
  });

  it.each([
    { chainId: '0x1', clientVersion: 'anvil/v1.8.3', expected: 'RESET_CHAIN_REFUSED' },
    { chainId: '0x7a69', clientVersion: 'Geth/v1.15.0', expected: 'RESET_CLIENT_REFUSED' },
  ])('DB-51 refuses $expected', async ({ chainId, clientVersion, expected }) => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-cli-'));
    roots.push(root);
    initializeOwnedEnvironment(environmentPaths(root, 'reset-cli'));
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        const method = (JSON.parse(body) as { method: string }).method;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: method === 'eth_chainId' ? chainId : clientVersion,
          }),
        );
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    try {
      const result = await runReset({
        ...process.env,
        MOTORCOVE_WORKSPACE_ROOT: root,
        MOTORCOVE_ENV: 'reset-cli',
        MOTORCOVE_RPC_URL: `http://127.0.0.1:${address.port}`,
      });
      expect(result.code).not.toBe(0);
      expect(result.output).toContain(expected);
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  });

  it('holds lifecycle ownership before invoking anvil_reset', async () => {
    const root = mkdtempSync(join(tmpdir(), 'motorcove-reset-cli-'));
    roots.push(root);
    const paths = environmentPaths(root, 'reset-cli');
    initializeOwnedEnvironment(paths);
    let resetCalls = 0;
    let resetMarkerDuringRpc: unknown;
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        const method = (JSON.parse(body) as { method: string }).method;
        if (method === 'anvil_reset') {
          resetCalls += 1;
          resetMarkerDuringRpc = JSON.parse(readFileSync(paths.maintenancePath, 'utf8'));
        }
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result:
              method === 'eth_chainId'
                ? '0x7a69'
                : method === 'web3_clientVersion'
                  ? 'anvil/v1.8.3'
                  : true,
          }),
        );
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    const environment = {
      ...process.env,
      MOTORCOVE_WORKSPACE_ROOT: root,
      MOTORCOVE_ENV: 'reset-cli',
      MOTORCOVE_RPC_URL: `http://127.0.0.1:${address.port}`,
    };
    await claimManagedNode(paths, environment.MOTORCOVE_RPC_URL);
    const before = readdirSync(paths.environmentDir).sort();
    try {
      const ownership = await acquireBootstrapOwnership(paths);
      try {
        const blocked = await runReset(environment);
        expect(blocked.code).not.toBe(0);
        expect(blocked.output).toContain('RESOURCE_BUSY');
        expect(resetCalls).toBe(0);
        expect(readdirSync(paths.environmentDir).sort()).toEqual(before);
        expect(existsSync(paths.maintenancePath)).toBe(false);
      } finally {
        await ownership.release();
      }

      const allowed = await runReset(environment);
      expect(allowed.code).toBe(0);
      expect(resetCalls).toBe(1);
      expect(resetMarkerDuringRpc).toMatchObject({
        operationType: 'RESET',
        stage: 'PREPARED',
        resetPhase: 'PREPARED',
      });
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  });
});
