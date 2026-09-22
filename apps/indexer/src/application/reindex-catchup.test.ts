import { describe, expect, it, vi } from 'vitest';
import type { BlockHeader } from '../ports/index.js';
import { catchUpToReindexTarget } from './reindex-catchup.js';

const target = { number: 1_001n };

const checkpoint = (number: bigint): BlockHeader => ({
  number,
  hash: `0x${(number + 1n).toString(16).padStart(64, '0')}`,
  parentHash: `0x${number.toString(16).padStart(64, '0')}`,
  timestamp: 1_700_000_000n + number,
});

describe('catchUpToReindexTarget', () => {
  it('does not count successful one-block batches as a retry budget', async () => {
    let currentNumber = 0n;
    const readCheckpoint = () =>
      Promise.resolve(currentNumber === 0n ? null : checkpoint(currentNumber));
    const ingestNext = vi.fn(async () => {
      currentNumber += 1n;
    });

    await catchUpToReindexTarget(readCheckpoint, ingestNext, target);

    expect(currentNumber).toBe(1_001n);
    expect(ingestNext).toHaveBeenCalledTimes(1_001);
  });

  it('fails closed when a successful ingestion call makes no durable progress', async () => {
    const current = checkpoint(50n);

    await expect(
      catchUpToReindexTarget(
        () => Promise.resolve(current),
        async () => undefined,
        target,
      ),
    ).rejects.toThrow('REINDEX_CATCHUP_NO_PROGRESS');
  });
});
