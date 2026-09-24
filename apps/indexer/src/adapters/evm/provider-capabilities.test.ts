import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import { assertProviderCapabilities, probeProviderCapabilities } from './provider-capabilities.js';

const hash = `0x${'a'.repeat(64)}` as const;
const address = `0x${'b'.repeat(40)}` as const;
const manifest = {
  chainId: '1',
  deploymentId: hash,
  nft: { address },
  escrow: { address, blockNumber: '5', blockHash: hash },
} as DeploymentManifest;

function client(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getChainId: vi.fn(async () => 1),
    getBlock: vi.fn(async () => ({ number: 10n, hash })),
    getLogs: vi.fn(async () => []),
    readContract: vi.fn(async () => hash),
    ...overrides,
  } as unknown as PublicClient;
}

describe('RPC provider capability probe', () => {
  it('accepts a provider proving all required public-chain capabilities', async () => {
    const capabilities = await probeProviderCapabilities(client(), manifest, chainProfileForId(1));
    expect(capabilities).toEqual({
      chainId: 1,
      blockHashLogs: 'SUPPORTED',
      finalizedTag: 'SUPPORTED',
      historicalState: 'SUPPORTED',
    });
    expect(() => assertProviderCapabilities(capabilities, chainProfileForId(1))).not.toThrow();
  });

  it('rejects missing finalized tag without trying latest as a substitute', async () => {
    const getBlock = vi.fn(async (params?: { blockTag?: string }) => {
      if (params?.blockTag === 'finalized') throw new Error('unsupported block tag');
      return { number: 10n, hash };
    });
    const capabilities = await probeProviderCapabilities(
      client({ getBlock }),
      manifest,
      chainProfileForId(1),
    );
    expect(capabilities.finalizedTag).toBe('UNSUPPORTED');
    expect(() => assertProviderCapabilities(capabilities, chainProfileForId(1))).toThrow(
      'PROVIDER_CAPABILITY_UNAVAILABLE',
    );
  });

  it('rejects providers that do not support block-hash-bound logs', async () => {
    const capabilities = await probeProviderCapabilities(
      client({
        getLogs: vi.fn(async () => {
          throw new Error('blockHash unsupported');
        }),
      }),
      manifest,
      chainProfileForId(1),
    );
    expect(capabilities.blockHashLogs).toBe('UNSUPPORTED');
    expect(() => assertProviderCapabilities(capabilities, chainProfileForId(1))).toThrow(
      'PROVIDER_CAPABILITY_UNAVAILABLE',
    );
  });

  it('does not require finalized tag from the Anvil immediate-finality profile', async () => {
    const anvilManifest = { ...manifest, chainId: '31337' } as DeploymentManifest;
    const anvilClient = client({ getChainId: vi.fn(async () => 31337) });
    const capabilities = await probeProviderCapabilities(
      anvilClient,
      anvilManifest,
      chainProfileForId(31337),
    );
    expect(capabilities.finalizedTag).toBe('NOT_REQUIRED');
    expect(anvilClient.getBlock).not.toHaveBeenCalledWith({ blockTag: 'finalized' });
  });
});
