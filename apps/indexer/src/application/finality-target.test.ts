import { describe, expect, it } from 'vitest';
import { chainProfileForId } from '@motorcove/chain-artifacts/profiles';
import type { BlockHeader, ChainReader } from '../ports/index.js';
import { readProjectionTarget } from './finality-target.js';

const hash = (number: bigint): `0x${string}` => `0x${number.toString(16).padStart(64, '0')}`;
const header = (number: bigint): BlockHeader => ({
  number,
  hash: hash(number + 1n),
  parentHash: hash(number),
  timestamp: number,
});

function reader(tip: bigint, finalized?: bigint): ChainReader {
  return {
    getHead: async () => header(tip),
    ...(finalized === undefined ? {} : { getFinalizedHead: async () => header(finalized) }),
    getBlock: async (number) => header(number),
    getEvents: async () => [],
  };
}

describe('projection finality target', () => {
  it('uses the current Anvil head immediately', async () => {
    const result = await readProjectionTarget(reader(10n), chainProfileForId(31337), 0n);
    expect(result).toEqual({ observedHead: header(10n), eligibleHead: header(10n) });
  });

  it('retains explicit local depth for Anvil fault injection', async () => {
    const result = await readProjectionTarget(reader(10n), chainProfileForId(31337), 2n);
    expect(result.eligibleHead).toEqual(header(8n));
  });

  it.each([1, 137])('uses the verified finalized tag below chain tip for chain %i', async (id) => {
    const result = await readProjectionTarget(reader(110n, 100n), chainProfileForId(id), 0n);
    expect(result).toEqual({ observedHead: header(110n), eligibleHead: header(100n) });
  });

  it('does not fall back to latest if finalized evidence is unavailable', async () => {
    await expect(readProjectionTarget(reader(110n), chainProfileForId(1), 0n)).rejects.toThrow(
      'PROVIDER_CAPABILITY_UNAVAILABLE',
    );
  });

  it('does not allow local depth to define public-chain finality', async () => {
    await expect(
      readProjectionTarget(reader(110n, 100n), chainProfileForId(1), 1n),
    ).rejects.toThrow('PUBLIC_INDEXING_DEPTH_UNSUPPORTED');
  });
});
