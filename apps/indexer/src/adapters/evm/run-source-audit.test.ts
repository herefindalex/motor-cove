import { describe, expect, it, vi } from 'vitest';
import { keccak256, type PublicClient } from 'viem';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import type { ReadModelReader, SourceAuditBlock } from '@motorcove/database/reader';
import { evidenceDigest } from '../../domain/source-evidence.js';
import { runSourceAudit } from './run-source-audit.js';
import { logScopeHash } from '../../runtime/config.js';

const hash = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;
const address = `0x${'a'.repeat(40)}` as const;
const escrow = `0x${'b'.repeat(40)}` as const;
const code = '0x6000' as const;
const manifest = {
  chainId: '1',
  deploymentId: hash('1'),
  nft: { address, runtimeCodeHash: keccak256(code) },
  escrow: { address: escrow, runtimeCodeHash: keccak256(code) },
} as DeploymentManifest;
const localBlock: SourceAuditBlock = {
  blockNumber: '5',
  blockHash: hash('5'),
  parentHash: hash('4'),
  scanComplete: true,
  logScopeHash: logScopeHash(manifest),
  observedLogCount: 0,
  observedLogDigest: evidenceDigest([]),
  events: [],
};

function reader(): Pick<ReadModelReader, 'deploymentDescriptor' | 'sourceAuditRange'> {
  return {
    deploymentDescriptor: () =>
      ({
        deploymentId: manifest.deploymentId,
        chainId: manifest.chainId,
        nftAddress: address,
        escrowAddress: escrow,
      }) as ReturnType<ReadModelReader['deploymentDescriptor']>,
    sourceAuditRange: () =>
      ({
        data: [localBlock],
        provenance: { indexedBlockNumber: '5', logScopeHash: localBlock.logScopeHash },
      }) as unknown as ReturnType<ReadModelReader['sourceAuditRange']>,
  };
}

function secondary(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getChainId: vi.fn(async () => 1),
    getCode: vi.fn(async () => code),
    readContract: vi.fn(async () => manifest.deploymentId),
    getBlock: vi.fn(async (params?: { blockNumber?: bigint }) => ({
      number: params?.blockNumber ?? 5n,
      hash: hash('5'),
      parentHash: hash('4'),
    })),
    getLogs: vi.fn(async () => []),
    ...overrides,
  } as unknown as PublicClient;
}

const options = (rpc = secondary()) => ({
  reader: reader(),
  secondary: rpc,
  manifest,
  profile: chainProfileForId(1),
  primaryRpcUrl: 'http://127.0.0.1:8545/primary?token=secret',
  secondaryRpcUrl: 'http://127.0.0.1:8546/secondary?token=secret',
  fromBlock: 5n,
  toBlock: 5n,
  now: () => new Date('2026-09-23T00:00:00.000Z'),
});

describe('read-only secondary source audit', () => {
  it('reports MATCH from independent block-hash reads', async () => {
    const rpc = secondary();
    const report = await runSourceAudit(options(rpc));
    expect(report.result).toBe('MATCH');
    expect(report.finalizedAnchor).toEqual({ number: '5', hash: hash('5') });
    expect(rpc.getLogs).toHaveBeenCalledWith({
      address: [address, escrow],
      blockHash: hash('5'),
    });
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('rejects the same normalized primary and secondary endpoint before source reads', async () => {
    const rpc = secondary();
    const report = await runSourceAudit({
      ...options(rpc),
      secondaryRpcUrl: 'http://127.0.0.1:8545/primary?other=key',
    });
    expect(report).toMatchObject({
      result: 'UNVERIFIABLE',
      reason: 'SECONDARY_ENDPOINT_NOT_INDEPENDENT',
    });
    expect(rpc.getChainId).not.toHaveBeenCalled();
  });

  it('rejects the wrong secondary deployment without reading source logs', async () => {
    const rpc = secondary({ readContract: vi.fn(async () => hash('9')) });
    const report = await runSourceAudit(options(rpc));
    expect(report).toMatchObject({
      result: 'UNVERIFIABLE',
      reason: 'IDENTITY_MISMATCH: deployment runtime',
    });
    expect(rpc.getLogs).not.toHaveBeenCalled();
  });

  it('treats secondary transport failure as UNVERIFIABLE', async () => {
    const rpc = secondary({
      getLogs: vi.fn(async () => {
        throw new Error('secret transport URL');
      }),
    });
    const report = await runSourceAudit(options(rpc));
    expect(report.result).toBe('UNVERIFIABLE');
    expect(JSON.stringify(report)).not.toContain('secret');
  });
});
