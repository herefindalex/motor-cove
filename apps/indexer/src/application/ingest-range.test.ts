import { describe, expect, it } from 'vitest';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import type { OrderedEvent } from '../domain/events.js';
import type { BlockHeader, ChainReader, ProjectionUnitOfWork } from '../ports/index.js';
import { ChainTransportUnavailableError, ingestRange } from './ingest-range.js';

const hash = (number: bigint): `0x${string}` => `0x${number.toString(16).padStart(64, '0')}`;

function header(number: bigint): BlockHeader {
  return {
    number,
    hash: hash(number + 1n),
    parentHash: number === 0n ? hash(0n) : hash(number),
    timestamp: 1_700_000_000n + number,
  };
}

function store(checkpoint: BlockHeader | null = null) {
  const commits: Array<{
    headers: readonly BlockHeader[];
    events: readonly OrderedEvent[];
    checkpoint: BlockHeader;
  }> = [];
  const recoveries: string[] = [];
  const current: bigint[] = [];
  const unit: ProjectionUnitOfWork = {
    checkpoint: async () => checkpoint,
    commit: async (headers, events, checkpoint) => {
      commits.push({ headers, events, checkpoint });
    },
    markRecoveryRequired: async (reason) => {
      recoveries.push(reason);
    },
    markCurrent: async (head) => {
      current.push(head);
    },
  };
  return { unit, commits, recoveries, current };
}

describe('ingestRange', () => {
  it('projects only finalized blocks when the public chain tip is ahead', async () => {
    const chain: ChainReader = {
      getHead: async () => header(8n),
      getFinalizedHead: async () => header(5n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store();
    await ingestRange(chain, target.unit, 100n, 0n, 0n, undefined, chainProfileForId(1));
    expect(target.commits).toHaveLength(1);
    expect(target.commits[0]?.checkpoint.number).toBe(5n);
    expect(target.commits[0]?.headers.every((item) => item.number <= 5n)).toBe(true);
  });

  it('requires recovery if finalized evidence contradicts the committed boundary', async () => {
    let readsAtFive = 0;
    const chain: ChainReader = {
      getHead: async () => header(5n),
      getFinalizedHead: async () => header(5n),
      getBlock: async (number) => {
        if (number === 5n && ++readsAtFive >= 4) return { ...header(number), hash: hash(999n) };
        return header(number);
      },
      getEvents: async () => [],
    };
    const target = store();
    await expect(
      ingestRange(chain, target.unit, 100n, 0n, 0n, undefined, chainProfileForId(1)),
    ).rejects.toThrow('FINALIZED_BLOCK_HASH_CHANGED');
    expect(target.recoveries).toContain('FINALIZED_BLOCK_HASH_CHANGED');
  });

  it('shrinks an RPC-limited range without skipping blocks', async () => {
    const attempts: string[] = [];
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async (headers) => {
        const from = headers[0]?.number ?? 0n;
        const to = headers.at(-1)?.number ?? from;
        attempts.push(`${from}:${to}`);
        if (to - from > 1n) throw new Error('RPC_RANGE_LIMIT');
        return [];
      },
    };
    const target = store();

    await ingestRange(chain, target.unit, 8n);

    expect(attempts).toEqual(['0:7', '0:3', '0:1']);
    expect(target.commits).toHaveLength(1);
    expect(target.commits[0]?.headers.map((item) => item.number)).toEqual([0n, 1n]);
    expect(target.commits[0]?.checkpoint.number).toBe(1n);
  });

  it('holds back the configured indexing depth', async () => {
    const ranges: string[] = [];
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async (headers) => {
        const from = headers[0]?.number ?? 0n;
        const to = headers.at(-1)?.number ?? from;
        ranges.push(`${from}:${to}`);
        return [];
      },
    };
    const target = store();

    await ingestRange(chain, target.unit, 100n, 0n, 2n);

    expect(ranges).toEqual(['0:7']);
    expect(target.commits[0]?.checkpoint.number).toBe(7n);
  });

  it('does not advance beyond a fixed maintenance target when the live head moves', async () => {
    const ranges: string[] = [];
    const chain: ChainReader = {
      getHead: async () => header(12n),
      getBlock: async (number) => header(number),
      getEvents: async (headers) => {
        const from = headers[0]?.number ?? 0n;
        const to = headers.at(-1)?.number ?? from;
        ranges.push(`${from}:${to}`);
        return [];
      },
    };
    const target = store(header(3n));

    await ingestRange(chain, target.unit, 100n, 0n, 0n, 7n);

    expect(ranges).toEqual(['4:7']);
    expect(target.commits[0]?.checkpoint.number).toBe(7n);
  });

  it('marks an already caught-up idle chain current after transport recovery', async () => {
    const durable = header(7n);
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store(durable);

    await ingestRange(chain, target.unit, 100n, 0n, 2n);

    expect(target.commits).toHaveLength(0);
    expect(target.current).toEqual([9n]);
  });

  it('requires explicit recovery when increased indexing depth excludes the checkpoint', async () => {
    const durable = header(100n);
    const chain: ChainReader = {
      getHead: async () => header(100n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store(durable);

    await expect(ingestRange(chain, target.unit, 100n, 0n, 10n)).rejects.toThrow(
      'RECOVERY_REQUIRED: checkpoint exceeds eligible indexing target',
    );

    expect(target.commits).toHaveLength(0);
    expect(target.current).toEqual([]);
    expect(target.recoveries).toEqual(['CHECKPOINT_EXCEEDS_ELIGIBLE_TARGET']);
  });

  it('catches forward when decreased indexing depth expands the eligible range', async () => {
    const durable = header(90n);
    const ranges: string[] = [];
    const chain: ChainReader = {
      getHead: async () => header(100n),
      getBlock: async (number) => header(number),
      getEvents: async (headers) => {
        ranges.push(`${headers[0]?.number}:${headers.at(-1)?.number}`);
        return [];
      },
    };
    const target = store(durable);

    await ingestRange(chain, target.unit, 100n, 0n, 2n);

    expect(ranges).toEqual(['91:98']);
    expect(target.commits[0]?.checkpoint.number).toBe(98n);
    expect(target.recoveries).toEqual([]);
  });

  it('requires recovery when no block is eligible but a checkpoint exists', async () => {
    const durable = header(1n);
    const chain: ChainReader = {
      getHead: async () => header(1n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store(durable);

    await expect(ingestRange(chain, target.unit, 100n, 0n, 2n)).rejects.toThrow(
      'RECOVERY_REQUIRED: checkpoint exceeds eligible indexing target',
    );
    expect(target.recoveries).toEqual(['CHECKPOINT_EXCEEDS_ELIGIBLE_TARGET']);
    expect(target.current).toEqual([]);
  });

  it('binds event reads to headers captured after the head changes branches', async () => {
    const branchHash = (number: bigint, branch: bigint) => hash(number * 10n + branch);
    const branchHeader = (number: bigint, branch: bigint): BlockHeader => ({
      number,
      hash: branchHash(number, branch),
      parentHash: number === 104n ? hash(104n) : branchHash(number - 1n, branch),
      timestamp: 1_700_000_000n + number,
    });
    const requestedHashes: string[][] = [];
    const funded: OrderedEvent = {
      blockNumber: 105n,
      transactionIndex: 0,
      logIndex: 0,
      blockHash: branchHash(105n, 2n),
      transactionHash: hash(999n),
      contractAddress: '0x0000000000000000000000000000000000000001',
      topics: [],
      data: '0x',
      event: {
        kind: 'SaleFunded',
        saleId: '1',
        buyer: '0x0000000000000000000000000000000000000002',
        amountWei: '1',
        fundedAt: '1',
        expiresAt: '2',
      },
    };
    const chain: ChainReader = {
      getHead: async () => branchHeader(105n, 1n),
      getBlock: async (number) => branchHeader(number, 2n),
      getEvents: async (headers) => {
        requestedHashes.push(headers.map((item) => item.hash));
        return [funded];
      },
    };
    const target = store();

    await ingestRange(chain, target.unit, 2n, 104n);

    expect(requestedHashes).toEqual([[branchHash(104n, 2n), branchHash(105n, 2n)]]);
    expect(target.commits[0]?.events).toEqual([funded]);
    expect(target.commits[0]?.checkpoint.hash).toBe(branchHash(105n, 2n));
  });

  it('marks current after committing the eligible target', async () => {
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store(header(6n));

    await ingestRange(chain, target.unit, 1n, 0n, 2n);

    expect(target.commits).toHaveLength(1);
    expect(target.current).toEqual([9n]);
  });

  it('does not mark current when a committed batch remains behind the eligible target', async () => {
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store(header(5n));

    await ingestRange(chain, target.unit, 1n, 0n, 2n);

    expect(target.commits).toHaveLength(1);
    expect(target.commits[0]?.checkpoint.number).toBe(6n);
    expect(target.current).toEqual([]);
  });

  it('does not publish live currentness for an older fixed maintenance target', async () => {
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store(header(6n));

    await ingestRange(chain, target.unit, 1n, 0n, 0n, 7n);

    expect(target.commits).toHaveLength(1);
    expect(target.commits[0]?.checkpoint.number).toBe(7n);
    expect(target.current).toEqual([]);

    const completedTarget = store(header(7n));
    await ingestRange(chain, completedTarget.unit, 1n, 0n, 0n, 7n);
    expect(completedTarget.commits).toHaveLength(0);
    expect(completedTarget.current).toEqual([]);
  });

  it('rejects a new batch that no longer joins the durable checkpoint', async () => {
    const durable = header(100n);
    const forked = { ...header(101n), parentHash: hash(999n) };
    const chain: ChainReader = {
      getHead: async () => forked,
      getBlock: async (number) => (number === durable.number ? durable : forked),
      getEvents: async () => [],
    };
    const target = store(durable);

    await expect(ingestRange(chain, target.unit, 8n)).rejects.toThrow(
      'RECOVERY_REQUIRED: checkpoint parent discontinuity',
    );
    expect(target.commits).toHaveLength(0);
    expect(target.recoveries).toEqual(['CHECKPOINT_PARENT_DISCONTINUITY']);
  });

  it('classifies a checkpoint RPC timeout as transport without requesting recovery', async () => {
    const durable = header(100n);
    const chain: ChainReader = {
      getHead: async () => header(101n),
      getBlock: async () => {
        throw new Error('request timed out');
      },
      getEvents: async () => [],
    };
    const target = store(durable);

    await expect(ingestRange(chain, target.unit, 8n)).rejects.toBeInstanceOf(
      ChainTransportUnavailableError,
    );
    expect(target.commits).toHaveLength(0);
    expect(target.recoveries).toEqual([]);
  });

  it('requires recovery when the provider confirms the checkpoint block is gone', async () => {
    const durable = header(100n);
    const missing = Object.assign(new Error('Block 100 could not be found.'), {
      name: 'BlockNotFoundError',
    });
    const chain: ChainReader = {
      getHead: async () => header(99n),
      getBlock: async () => {
        throw missing;
      },
      getEvents: async () => [],
    };
    const target = store(durable);

    await expect(ingestRange(chain, target.unit, 8n)).rejects.toThrow(
      'RECOVERY_REQUIRED: checkpoint block unavailable',
    );
    expect(target.recoveries).toEqual(['CHECKPOINT_BLOCK_UNAVAILABLE']);
  });

  it('does not retry a deterministic chain adapter failure as transport', async () => {
    const chain: ChainReader = {
      getHead: async () => {
        throw new Error('DECODER_CONTRACT_MISMATCH');
      },
      getBlock: async (number) => header(number),
      getEvents: async () => [],
    };
    const target = store();

    await expect(ingestRange(chain, target.unit)).rejects.toThrow('DECODER_CONTRACT_MISMATCH');
    await expect(ingestRange(chain, target.unit)).rejects.not.toBeInstanceOf(
      ChainTransportUnavailableError,
    );
    expect(target.recoveries).toEqual([]);
  });
});
