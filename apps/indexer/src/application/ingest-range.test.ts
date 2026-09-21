import { describe, expect, it } from 'vitest';
import type { BlockHeader, ChainReader, ProjectionUnitOfWork } from '../ports/index.js';
import { ingestRange } from './ingest-range.js';

const hash = (number: bigint): `0x${string}` => `0x${number.toString(16).padStart(64, '0')}`;

function header(number: bigint): BlockHeader {
  return {
    number,
    hash: hash(number + 1n),
    parentHash: number === 0n ? hash(0n) : hash(number),
    timestamp: 1_700_000_000n + number,
  };
}

function store() {
  const commits: Array<{ headers: readonly BlockHeader[]; checkpoint: BlockHeader }> = [];
  const unit: ProjectionUnitOfWork = {
    checkpoint: async () => null,
    commit: async (headers, _events, checkpoint) => {
      commits.push({ headers, checkpoint });
    },
    markRecoveryRequired: async () => undefined,
  };
  return { unit, commits };
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
});
