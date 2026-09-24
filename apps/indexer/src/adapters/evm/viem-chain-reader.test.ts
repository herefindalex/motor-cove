import { encodeAbiParameters, encodeEventTopics, toEventSelector, type PublicClient } from 'viem';
import { motorCoveEscrowAbi } from '@motorcove/chain-artifacts';
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

  it('retains SaleCreated while excluding unrelated Approval from the same block', async () => {
    const escrow = '0x0000000000000000000000000000000000000002';
    const observed = header(5n);
    const identity = {
      blockNumber: 5n,
      blockHash: observed.hash,
      transactionHash: hash(7n),
      transactionIndex: 0,
    };
    const getLogs = vi.fn().mockResolvedValue([
      {
        ...identity,
        address,
        logIndex: 0,
        topics: [toEventSelector('Approval(address,address,uint256)')],
        data: '0x',
      },
      {
        ...identity,
        address: escrow,
        logIndex: 1,
        topics: encodeEventTopics({
          abi: motorCoveEscrowAbi,
          eventName: 'SaleCreated',
          args: { saleId: 1n, tokenId: 2n, seller: address },
        }),
        data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [address, 10n]),
      },
    ]);
    const reader = new ViemChainReader({ getLogs } as unknown as PublicClient, address, escrow);

    const events = await reader.getEvents([observed]);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toMatchObject({
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '2',
      allowedBuyer: address,
      priceWei: '10',
    });
  });
});
