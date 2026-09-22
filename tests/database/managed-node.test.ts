import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalManagedNodeEndpoint,
  claimManagedNode,
  environmentPaths,
  initializeOwnedEnvironment,
  verifyManagedNodeOwnership,
} from '@motorcove/database/maintenance';

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'motorcove-managed-node-'));
  roots.push(root);
  const first = environmentPaths(root, 'first');
  const second = environmentPaths(root, 'second');
  initializeOwnedEnvironment(first);
  initializeOwnedEnvironment(second);
  return { first, second };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('managed Anvil ownership', () => {
  it('normalizes loopback aliases to one registered node identity', () => {
    expect(canonicalManagedNodeEndpoint('http://localhost:18545')).toBe(
      canonicalManagedNodeEndpoint('http://127.0.0.1:18545/'),
    );
    expect(canonicalManagedNodeEndpoint('http://[::1]:18545')).toBe(
      canonicalManagedNodeEndpoint('http://127.0.0.1:18545'),
    );
  });

  it('refuses a second environment claiming the same managed node', async () => {
    const { first, second } = fixture();
    await claimManagedNode(first, 'http://localhost:18545');

    await expect(claimManagedNode(second, 'http://127.0.0.1:18545')).rejects.toThrow(
      'MANAGED_NODE_SHARED',
    );
    expect(() => readFileSync(second.nodeBindingPath)).toThrow();
  });

  it('keeps one environment bound to its original node and allows an independent node', async () => {
    const { first, second } = fixture();
    await claimManagedNode(first, 'http://127.0.0.1:18545');
    await claimManagedNode(second, 'http://127.0.0.1:18546');

    await expect(
      verifyManagedNodeOwnership(first, 'http://localhost:18545'),
    ).resolves.toBeUndefined();
    await expect(
      verifyManagedNodeOwnership(second, 'http://127.0.0.1:18546'),
    ).resolves.toBeUndefined();
    await expect(verifyManagedNodeOwnership(second, 'http://127.0.0.1:18545')).rejects.toThrow(
      'MANAGED_NODE_BINDING_MISMATCH',
    );
  });

  it('fails closed when reset or runtime cannot prove node ownership', async () => {
    const { first } = fixture();
    await expect(verifyManagedNodeOwnership(first, 'http://127.0.0.1:18545')).rejects.toThrow(
      'MANAGED_NODE_OWNERSHIP_REQUIRED',
    );
  });

  it('rejects a noncanonical binding before another environment can claim its alias', async () => {
    const { first, second } = fixture();
    writeFileSync(
      first.nodeBindingPath,
      `${JSON.stringify({
        formatVersion: 1,
        environmentId: first.environmentId,
        rpcEndpoint: 'http://localhost:18545',
        registeredAt: new Date().toISOString(),
      })}\n`,
    );

    await expect(claimManagedNode(second, 'http://127.0.0.1:18545')).rejects.toThrow(
      'MANAGED_NODE_BINDING_INVALID',
    );
    expect(() => readFileSync(second.nodeBindingPath)).toThrow();
  });
});
