import type { PublicClient } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import type { BlockHeader } from '../../ports/index.js';
import { ViemChainReader } from './viem-chain-reader.js';

const address = '0x0000000000000000000000000000000000000001';
const hash = (number: bigint): `0x${string}` => `0x${number.toString(16).padStart(64, '0')}`;
const header = (number: bigint): BlockHeader => ({
  number,
  hash: hash(number + 1n),
  parentHash: hash(number),
  timestamp: 1_700_000_000n + number,
});

describe('ViemChainReader', () => {
  it('queries every observed block by hash, including blocks with no logs', async () => {
    const getLogs = vi.fn().mockResolvedValue([]);
    const reader = new ViemChainReader(
      { getLogs } as unknown as PublicClient,
      address,
      '0x0000000000000000000000000000000000000002',
    );
    const headers = [header(10n), header(11n)];

    await expect(reader.getEvents(headers)).resolves.toEqual([]);

    expect(getLogs).toHaveBeenNthCalledWith(1, {
      address: [address, '0x0000000000000000000000000000000000000002'],
      blockHash: headers[0]?.hash,
    });
    expect(getLogs).toHaveBeenNthCalledWith(2, {
      address: [address, '0x0000000000000000000000000000000000000002'],
      blockHash: headers[1]?.hash,
    });
    expect(
      getLogs.mock.calls.some(([request]) => 'fromBlock' in request || 'toBlock' in request),
    ).toBe(false);
  });
});
