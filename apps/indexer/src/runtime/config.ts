import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { environmentPaths } from '@motorcove/database/environment';
import type { EnvironmentPaths } from '@motorcove/database/types';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from '@motorcove/chain-artifacts/manifest';

export interface RuntimeConfig {
  readonly rpcUrl: string;
  readonly environment: EnvironmentPaths;
  readonly databasePath: string;
  readonly manifestPath: string;
  readonly batchSize: bigint;
  readonly indexingDepth: bigint;
  readonly manifest: DeploymentManifest;
}

function unsignedEnvironment(name: string, fallback: string, minimum: bigint): bigint {
  const raw = process.env[name] ?? fallback;
  if (!/^\d+$/.test(raw) || BigInt(raw) < minimum)
    throw new Error(`${name}_INVALID: expected an integer >= ${minimum}`);
  return BigInt(raw);
}
export function paths() {
  const repositoryRoot = resolve(
    process.env.MOTORCOVE_WORKSPACE_ROOT ?? resolve(import.meta.dirname, '../../../..'),
  );
  const environment = environmentPaths(repositoryRoot, process.env.MOTORCOVE_ENV ?? 'local');
  return {
    rpcUrl: process.env.MOTORCOVE_RPC_URL ?? 'http://127.0.0.1:8545',
    environment,
    databasePath: environment.databasePath,
    manifestPath: environment.deploymentPath,
    batchSize: unsignedEnvironment('MOTORCOVE_INDEX_BATCH_SIZE', '100', 1n),
    indexingDepth: unsignedEnvironment('MOTORCOVE_INDEXING_DEPTH', '0', 0n),
  };
}

export function logScopeHash(manifest: DeploymentManifest): `0x${string}` {
  const scope = JSON.stringify({
    version: 'motorcove-v1',
    deploymentId: manifest.deploymentId.toLowerCase(),
    scanStartBlock: manifest.scanStartBlock,
    addresses: [manifest.nft.address.toLowerCase(), manifest.escrow.address.toLowerCase()].sort(),
  });
  return `0x${createHash('sha256').update(scope).digest('hex')}`;
}
export function loadConfig(): RuntimeConfig {
  const base = paths();
  const manifest = deploymentManifestSchema.parse(
    JSON.parse(readFileSync(base.manifestPath, 'utf8')),
  );
  return { ...base, manifest };
}
