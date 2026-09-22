import { describe, expect, it } from 'vitest';
import type { BlockHeader } from '../ports/index.js';
import { resolveEligibleReindexTarget, resolveReindexOperationRecovery } from './reindex-target.js';

const hash = (number: bigint): `0x${string}` => `0x${number.toString(16).padStart(64, '0')}`;

const block = (number: bigint): BlockHeader => ({
  number,
  hash: hash(number + 1n),
  parentHash: hash(number),
  timestamp: 1_700_000_000n + number,
});

describe('resolveEligibleReindexTarget', () => {
  it('uses the observed head when indexing depth is zero', async () => {
    await expect(
      resolveEligibleReindexTarget(
        { getHead: async () => block(10n), getBlock: async (number) => block(number) },
        0n,
      ),
    ).resolves.toEqual(block(10n));
  });

  it('captures the eligible block and hash when indexing depth is non-zero', async () => {
    await expect(
      resolveEligibleReindexTarget(
        { getHead: async () => block(10n), getBlock: async (number) => block(number) },
        2n,
      ),
    ).resolves.toEqual(block(8n));
  });

  it('returns no target when the chain head is shallower than the configured depth', async () => {
    await expect(
      resolveEligibleReindexTarget(
        { getHead: async () => block(1n), getBlock: async (number) => block(number) },
        2n,
      ),
    ).resolves.toBeNull();
  });

  it('rejects when the eligible target changes while it is captured', async () => {
    let reads = 0;
    await expect(
      resolveEligibleReindexTarget(
        {
          getHead: async () => block(10n),
          getBlock: async (number) => ({
            ...block(number),
            hash: hash(number + BigInt(++reads)),
          }),
        },
        2n,
      ),
    ).rejects.toThrow('REINDEX_TARGET_CHANGED');
  });

  it('resumes the recorded target when the chain head advances', async () => {
    let headReads = 0;
    await expect(
      resolveReindexOperationRecovery(
        {
          getHead: async () => {
            headReads += 1;
            return block(11n);
          },
          getBlock: async (number) => block(number),
        },
        0n,
        1n,
        {
          reindexFromBlock: '1',
          targetBlock: '10',
          targetHash: block(10n).hash,
        },
      ),
    ).resolves.toEqual({
      reindexFromBlock: '1',
      targetBlock: '10',
      targetHash: block(10n).hash,
    });
    expect(headReads).toBe(0);
  });

  it('rejects resume when the recorded target is no longer canonical', async () => {
    await expect(
      resolveReindexOperationRecovery(
        {
          getHead: async () => block(11n),
          getBlock: async (number) => ({ ...block(number), hash: hash(99n) }),
        },
        0n,
        1n,
        {
          reindexFromBlock: '1',
          targetBlock: '10',
          targetHash: block(10n).hash,
        },
      ),
    ).rejects.toThrow('REINDEX_TARGET_CHANGED');
  });

  it('rejects resume when the requested start differs from the operation', async () => {
    await expect(
      resolveReindexOperationRecovery(
        { getHead: async () => block(11n), getBlock: async (number) => block(number) },
        0n,
        2n,
        {
          reindexFromBlock: '1',
          targetBlock: '10',
          targetHash: block(10n).hash,
        },
      ),
    ).rejects.toThrow('MAINTENANCE_INCOMPLETE');
  });
});
