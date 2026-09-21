import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import type { JournalEntry } from '../../capabilities/transactions/index.js';
import { createTransactionChainReader } from './inspect-transaction.js';

const account = `0x${'1'.repeat(40)}` as const;
const contract = `0x${'2'.repeat(40)}` as const;
const transactionHash = `0x${'3'.repeat(64)}` as const;
const blockHash = `0x${'4'.repeat(64)}` as const;

const entry = (action: string): JournalEntry => ({
  schemaVersion: 1,
  clientOperationId: `operation-${action}`,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
  deploymentId: `0x${'5'.repeat(64)}`,
  chainId: 31_337,
  account,
  protocolVersion: '1',
  action,
  saleId: '7',
  intendedContract: contract,
  intendedCalldata: '0x1234',
  calldataSummary: action,
  valueWei: '0',
  status: 'SUBMITTED',
  originalTxHash: transactionHash,
  currentTxHash: transactionHash,
});

function client(receiptStatus: 'success' | 'reverted' = 'success'): PublicClient {
  return {
    getTransaction: vi.fn(async () => ({
      from: account,
      to: contract,
      value: 0n,
      input: '0x1234',
    })),
    getTransactionReceipt: vi.fn(async () => ({
      status: receiptStatus,
      transactionHash,
      blockNumber: 12n,
      blockHash,
      logs: [],
    })),
    getBlock: vi.fn(async () => ({ hash: blockHash })),
  } as unknown as PublicClient;
}

describe('createTransactionChainReader', () => {
  it.each([
    'APPROVE_TOKEN',
    'CREATE_SALE',
    'COMPLETE_SALE',
    'CANCEL_SALE',
    'EXPIRE_SALE',
    'WITHDRAW_PAYMENT',
    'RECLAIM_TOKEN',
  ])('observes an included receipt for %s using the saved transaction intent', async (action) => {
    await expect(
      createTransactionChainReader(client()).inspectTransaction(entry(action), transactionHash),
    ).resolves.toEqual({
      kind: 'INCLUDED_SUCCESS',
      transactionHash,
      blockNumber: 12n,
      blockHash,
    });
  });

  it('reports a non-funding revert without requiring a funding event', async () => {
    await expect(
      createTransactionChainReader(client('reverted')).inspectTransaction(
        entry('WITHDRAW_PAYMENT'),
        transactionHash,
      ),
    ).resolves.toEqual({
      kind: 'INCLUDED_REVERTED',
      transactionHash,
      blockNumber: 12n,
      blockHash,
    });
  });
});
