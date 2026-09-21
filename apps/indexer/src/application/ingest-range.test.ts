import { describe, expect, it } from 'vitest';
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
  const commits: Array<{ headers: readonly BlockHeader[]; checkpoint: BlockHeader }> = [];
  const recoveries: string[] = [];
  const unit: ProjectionUnitOfWork = {
    checkpoint: async () => checkpoint,
    commit: async (headers, _events, checkpoint) => {
      commits.push({ headers, checkpoint });
    },
    markRecoveryRequired: async (reason) => {
      recoveries.push(reason);
    },
  };
  return { unit, commits, recoveries };
}

describe('ingestRange', () => {
  it('shrinks an RPC-limited range without skipping blocks', async () => {
    const attempts: string[] = [];
    const chain: ChainReader = {
      getHead: async () => header(9n),
      getBlock: async (number) => header(number),
      getEvents: async (from, to) => {
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
      getEvents: async (from, to) => {
        ranges.push(`${from}:${to}`);
        return [];
      },
    };
    const target = store();

    await ingestRange(chain, target.unit, 100n, 0n, 2n);

    expect(ranges).toEqual(['0:7']);
    expect(target.commits[0]?.checkpoint.number).toBe(7n);
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
