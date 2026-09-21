import { describe, expect, it } from 'vitest';
import type { BlockHeader } from '../ports/index.js';
import { resolveEligibleReindexTarget } from './reindex-target.js';

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
});
