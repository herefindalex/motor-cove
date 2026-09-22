import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireAdvisoryLock } from '../connection/flock.js';
import { verifyOwnedEnvironment } from '../connection/environment.js';
import type { EnvironmentPaths } from '../types/index.js';

interface ManagedNodeBinding {
  readonly formatVersion: 1;
  readonly environmentId: string;
  readonly rpcEndpoint: string;
  readonly registeredAt: string;
}

function validCanonicalEndpoint(endpoint: string): boolean {
  const match = /^http:\/\/loopback:(\d+)$/.exec(endpoint);
  if (!match?.[1]) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

export function canonicalManagedNodeEndpoint(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/')
  )
    throw new Error(`MANAGED_NODE_RPC_REFUSED: expected loopback HTTP origin, got ${url.origin}`);
  return `http://loopback:${url.port || '80'}`;
}

function parseBinding(path: string, expectedEnvironmentId: string): ManagedNodeBinding {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`MANAGED_NODE_BINDING_INVALID: ${path}`);
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('formatVersion' in value) ||
    value.formatVersion !== 1 ||
    !('environmentId' in value) ||
    typeof value.environmentId !== 'string' ||
    !('rpcEndpoint' in value) ||
    typeof value.rpcEndpoint !== 'string' ||
    !('registeredAt' in value) ||
    typeof value.registeredAt !== 'string' ||
    value.environmentId !== expectedEnvironmentId ||
    !validCanonicalEndpoint(value.rpcEndpoint) ||
    Number.isNaN(Date.parse(value.registeredAt))
  )
    throw new Error(`MANAGED_NODE_BINDING_INVALID: ${path}`);
  return value as ManagedNodeBinding;
}

function bindings(paths: EnvironmentPaths): readonly ManagedNodeBinding[] {
  const environments = resolve(paths.managedRoot, 'environments');
  if (!existsSync(environments)) return [];
  return readdirSync(environments, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      environmentId: entry.name,
      path: resolve(environments, entry.name, 'managed-node.json'),
    }))
    .filter((binding) => existsSync(binding.path))
    .map((binding) => parseBinding(binding.path, binding.environmentId));
}

function assertDedicated(
  paths: EnvironmentPaths,
  endpoint: string,
  allBindings: readonly ManagedNodeBinding[],
): void {
  const conflicts = allBindings.filter(
    (binding) => binding.rpcEndpoint === endpoint && binding.environmentId !== paths.environmentId,
  );
  if (conflicts.length > 0)
    throw new Error(
      `MANAGED_NODE_SHARED: ${endpoint} is assigned to ${conflicts
        .map((binding) => binding.environmentId)
        .sort()
        .join(',')}`,
    );
}

async function withRegistryLock<T>(paths: EnvironmentPaths, operation: () => T): Promise<T> {
  const lock = await acquireAdvisoryLock(
    resolve(paths.managedRoot, 'locks', 'managed-nodes.lock'),
    'exclusive',
  );
  try {
    return operation();
  } finally {
    await lock.release();
  }
}

export async function claimManagedNode(paths: EnvironmentPaths, rpcUrl: string): Promise<void> {
  verifyOwnedEnvironment(paths);
  const endpoint = canonicalManagedNodeEndpoint(rpcUrl);
  await withRegistryLock(paths, () => {
    const allBindings = bindings(paths);
    assertDedicated(paths, endpoint, allBindings);
    if (existsSync(paths.nodeBindingPath)) {
      const current = parseBinding(paths.nodeBindingPath, paths.environmentId);
      if (current.environmentId !== paths.environmentId || current.rpcEndpoint !== endpoint)
        throw new Error('MANAGED_NODE_BINDING_MISMATCH');
      return;
    }
    const binding: ManagedNodeBinding = {
      formatVersion: 1,
      environmentId: paths.environmentId,
      rpcEndpoint: endpoint,
      registeredAt: new Date().toISOString(),
    };
    writeFileSync(paths.nodeBindingPath, `${JSON.stringify(binding, null, 2)}\n`, {
      flag: 'wx',
      flush: true,
    });
  });
}

export async function verifyManagedNodeOwnership(
  paths: EnvironmentPaths,
  rpcUrl: string,
): Promise<void> {
  verifyOwnedEnvironment(paths);
  const endpoint = canonicalManagedNodeEndpoint(rpcUrl);
  await withRegistryLock(paths, () => {
    if (!existsSync(paths.nodeBindingPath)) throw new Error('MANAGED_NODE_OWNERSHIP_REQUIRED');
    const current = parseBinding(paths.nodeBindingPath, paths.environmentId);
    if (current.environmentId !== paths.environmentId || current.rpcEndpoint !== endpoint)
      throw new Error('MANAGED_NODE_BINDING_MISMATCH');
    assertDedicated(paths, endpoint, bindings(paths));
  });
}
