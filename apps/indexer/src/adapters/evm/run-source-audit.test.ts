import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { keccak256, toEventSelector, type PublicClient } from 'viem';
import type { DeploymentManifest } from '@motorcove/chain-artifacts/manifest';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import { LOG_SCOPE_VERSION, motorCoveSourceScope } from '@motorcove/chain-artifacts/source-scope';
import type { ReadModelReader, SourceAuditBlock } from '@motorcove/database/reader';
import {
  evidenceDigest,
  eventEnvelope,
  type RawEventIdentity,
} from '../../domain/source-evidence.js';
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

function saleEvidence() {
  const sale: RawEventIdentity = {
    blockNumber: 5n,
    blockHash: hash('5'),
    transactionHash: hash('7'),
    transactionIndex: 0,
    logIndex: 1,
    contractAddress: escrow,
    topics: [toEventSelector('SaleCreated(uint256,uint256,address,address,uint256)')],
    data: '0x1234',
  };
  const block: SourceAuditBlock = {
    ...localBlock,
    observedLogCount: 1,
    observedLogDigest: evidenceDigest([eventEnvelope(sale)]),
    events: [
      {
        blockNumber: '5',
        blockHash: sale.blockHash,
        transactionHash: sale.transactionHash,
        transactionIndex: sale.transactionIndex,
        logIndex: sale.logIndex,
        contractAddress: sale.contractAddress,
        topics: sale.topics,
        data: sale.data,
      },
    ],
  };
  const localReader = {
    ...reader(),
    sourceAuditRange: () =>
      ({
        data: [block],
        provenance: { indexedBlockNumber: '5', logScopeHash: block.logScopeHash },
      }) as unknown as ReturnType<ReadModelReader['sourceAuditRange']>,
  } satisfies Pick<ReadModelReader, 'deploymentDescriptor' | 'sourceAuditRange'>;
  return { sale, localReader };
}

describe('read-only secondary source audit', () => {
  it('revalidates the fixed finalized anchor after collecting source evidence', async () => {
    let evidenceRead = false;
    const rpc = secondary({
      getBlock: vi.fn(async () => ({
        number: 5n,
        hash: evidenceRead ? hash('9') : hash('5'),
        parentHash: hash('4'),
      })),
      getLogs: vi.fn(async () => {
        evidenceRead = true;
        return [];
      }),
    });
    expect(await runSourceAudit(options(rpc))).toMatchObject({
      result: 'UNVERIFIABLE',
      reason: 'FINALIZED_BLOCK_HASH_CHANGED',
    });
    expect(rpc.getLogs).toHaveBeenCalledOnce();
  });

  it('rejects a numbered block that contradicts the finalized anchor', async () => {
    const rpc = secondary({
      getBlock: vi.fn(async (params: { blockTag?: string; blockNumber?: bigint }) => ({
        number: 5n,
        hash: params.blockTag === 'finalized' ? hash('9') : hash('5'),
        parentHash: hash('4'),
      })),
    });
    const report = await runSourceAudit(options(rpc));
    expect(report).toMatchObject({
      result: 'UNVERIFIABLE',
      reason: 'FINALIZED_BLOCK_HASH_CHANGED',
    });
  });

  it('rejects a provider block returned at the wrong height before reading its logs', async () => {
    const rpc = secondary({
      getBlock: vi.fn(async (params: { blockTag?: string; blockNumber?: bigint }) => ({
        number: params.blockNumber === 5n ? 4n : 6n,
        hash: params.blockNumber === 5n ? hash('5') : hash('6'),
        parentHash: hash('4'),
      })),
    });
    const report = await runSourceAudit(options(rpc));
    expect(report).toMatchObject({
      result: 'UNVERIFIABLE',
      reason: 'SECONDARY_BLOCK_IDENTITY_INVALID',
    });
    expect(rpc.getLogs).not.toHaveBeenCalled();
  });

  it('hashes the shared source scope version and event selectors', () => {
    const scope = JSON.stringify({
      version: LOG_SCOPE_VERSION,
      deploymentId: manifest.deploymentId.toLowerCase(),
      chainId: manifest.chainId,
      scanStartBlock: manifest.scanStartBlock,
      sources: motorCoveSourceScope(manifest.nft.address, manifest.escrow.address),
    });
    expect(logScopeHash(manifest)).toBe(`0x${createHash('sha256').update(scope).digest('hex')}`);
  });
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

  it('ignores an Approval-only block in the same way as primary ingestion', async () => {
    const approval = {
      address,
      blockNumber: 5n,
      blockHash: hash('5'),
      transactionHash: hash('8'),
      transactionIndex: 0,
      logIndex: 0,
      topics: [toEventSelector('Approval(address,address,uint256)')],
      data: '0x',
    };
    const report = await runSourceAudit(
      options(secondary({ getLogs: vi.fn(async () => [approval]) })),
    );
    expect(report.result).toBe('MATCH');
  });

  it('compares SaleCreated while excluding Approval in a mixed block', async () => {
    const sale: RawEventIdentity = {
      blockNumber: 5n,
      blockHash: hash('5'),
      transactionHash: hash('7'),
      transactionIndex: 0,
      logIndex: 1,
      contractAddress: escrow,
      topics: [toEventSelector('SaleCreated(uint256,uint256,address,address,uint256)')],
      data: '0x1234',
    };
    const approval = {
      address,
      blockNumber: 5n,
      blockHash: hash('5'),
      transactionHash: hash('8'),
      transactionIndex: 0,
      logIndex: 0,
      topics: [toEventSelector('Approval(address,address,uint256)')],
      data: '0x',
    };
    const block: SourceAuditBlock = {
      ...localBlock,
      observedLogCount: 1,
      observedLogDigest: evidenceDigest([eventEnvelope(sale)]),
      events: [
        {
          blockNumber: '5',
          blockHash: sale.blockHash,
          transactionHash: sale.transactionHash,
          transactionIndex: sale.transactionIndex,
          logIndex: sale.logIndex,
          contractAddress: sale.contractAddress,
          topics: sale.topics,
          data: sale.data,
        },
      ],
    };
    const localReader = {
      ...reader(),
      sourceAuditRange: () =>
        ({
          data: [block],
          provenance: { indexedBlockNumber: '5', logScopeHash: block.logScopeHash },
        }) as unknown as ReturnType<ReadModelReader['sourceAuditRange']>,
    } as Pick<ReadModelReader, 'deploymentDescriptor' | 'sourceAuditRange'>;
    const secondaryLogs = [
      approval,
      {
        ...sale,
        address: sale.contractAddress,
      },
    ];
    const report = await runSourceAudit({
      ...options(secondary({ getLogs: vi.fn(async () => secondaryLogs) })),
      reader: localReader,
    });
    expect(report.result).toBe('MATCH');
  });

  it('reports a missing scoped SaleCreated as MISMATCH', async () => {
    const { localReader } = saleEvidence();
    const report = await runSourceAudit({ ...options(), reader: localReader });
    expect(report.result).toBe('MISMATCH');
    expect(report.mismatches.length).toBeGreaterThan(0);
  });

  it('reports changed raw event data as MISMATCH', async () => {
    const { sale, localReader } = saleEvidence();
    const report = await runSourceAudit({
      ...options(
        secondary({
          getLogs: vi.fn(async () => [{ ...sale, address: escrow, data: '0x5678' }]),
        }),
      ),
      reader: localReader,
    });
    expect(report.result).toBe('MISMATCH');
  });

  it.each([
    ['block hash', hash('9'), hash('4')],
    ['parent hash', hash('5'), hash('9')],
  ])('reports a changed %s as MISMATCH', async (_name, blockHash, parentHash) => {
    const report = await runSourceAudit(
      options(
        secondary({
          getBlock: vi.fn(async () => ({ number: 5n, hash: blockHash, parentHash })),
        }),
      ),
    );
    expect(report.result).toBe('MISMATCH');
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
