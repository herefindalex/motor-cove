import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import type { JournalEntry } from '../../capabilities/transactions/index.js';
import {
  createTransactionChainReader,
  type TransactionVerificationContext,
} from './inspect-transaction.js';

const account = `0x${'1'.repeat(40)}` as const;
const nft = `0x${'2'.repeat(40)}` as const;
const transactionHash = `0x${'3'.repeat(64)}` as const;
const blockHash = `0x${'4'.repeat(64)}` as const;
const deploymentId = `0x${'5'.repeat(64)}` as const;
const escrow = `0x${'6'.repeat(40)}` as const;
const verificationContext: TransactionVerificationContext = {
  chainId: 31_337,
  deploymentId,
  protocolVersion: '1',
  nftAddress: nft,
  escrowAddress: escrow,
};

const entry = (action: string): JournalEntry => ({
  schemaVersion: 1,
  clientOperationId: `operation-${action}`,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
  deploymentId,
  chainId: 31_337,
  account,
  protocolVersion: '1',
  action,
  saleId: '7',
  intendedContract: action === 'APPROVE_TOKEN' ? nft : escrow,
  intendedCalldata: '0x1234',
  calldataSummary: action,
  valueWei: '0',
  status: 'SUBMITTED',
  originalTxHash: transactionHash,
  currentTxHash: transactionHash,
});

function client(
  journalEntry: JournalEntry,
  options: {
    receiptStatus?: 'success' | 'reverted';
    chainId?: number;
    onChainDeploymentId?: `0x${string}`;
  } = {},
): PublicClient {
  return {
    getChainId: vi.fn(async () => options.chainId ?? 31_337),
    readContract: vi.fn(async () => options.onChainDeploymentId ?? deploymentId),
    getTransaction: vi.fn(async () => ({
      from: account,
      to: journalEntry.intendedContract,
      value: 0n,
      input: '0x1234',
    })),
    getTransactionReceipt: vi.fn(async () => ({
      status: options.receiptStatus ?? 'success',
      transactionHash,
      blockNumber: 12n,
      blockHash,
      logs: [],
    })),
    getBlock: vi.fn(async () => ({ hash: blockHash })),
  } as unknown as PublicClient;
}

describe('createTransactionChainReader', () => {
  it('uses durable finality for automatic observation but rechecks RPC on manual inspection', async () => {
    const finalizedEntry: JournalEntry = {
      ...entry('COMPLETE_SALE'),
      chainId: 1,
      status: 'INCLUDED_SUCCESS',
      receiptStatus: 'SUCCESS',
      receiptBlockNumber: '105',
      receiptBlockHash: blockHash,
      finalityStatus: 'FINALIZED',
      finalizedHeadNumber: '105',
      finalizedHeadHash: blockHash,
    };
    const rpc = client(finalizedEntry, { chainId: 1 });
    const reader = createTransactionChainReader(rpc, { ...verificationContext, chainId: 1 });
    expect(
      await reader.inspectTransaction(finalizedEntry, transactionHash, 'AUTOMATIC'),
    ).toMatchObject({
      kind: 'INCLUDED_SUCCESS',
      blockNumber: 105n,
      blockHash,
    });
    expect(rpc.getTransaction).not.toHaveBeenCalled();
    await reader.inspectTransaction(finalizedEntry, transactionHash, 'MANUAL');
    expect(rpc.getTransaction).toHaveBeenCalled();
  });
  it('requires a finalized head and matching receipt block on a public profile', async () => {
    const publicEntry = { ...entry('COMPLETE_SALE'), chainId: 1 };
    const context = { ...verificationContext, chainId: 1 };
    const getBlock = vi.fn(async ({ blockTag }: { blockTag?: string }) =>
      blockTag === 'finalized'
        ? { number: 104n, hash: blockHash }
        : { number: 105n, hash: blockHash },
    );
    const rpc = { ...client(publicEntry, { chainId: 1 }), getBlock } as unknown as PublicClient;
    const reader = createTransactionChainReader(rpc, context);
    expect(await reader.observeFinality!(publicEntry, 105n, blockHash)).toEqual({
      status: 'UNFINALIZED',
    });
    getBlock.mockImplementation(async ({ blockTag }: { blockTag?: string }) =>
      blockTag === 'finalized'
        ? { number: 106n, hash: blockHash }
        : { number: 105n, hash: blockHash },
    );
    expect(await reader.observeFinality!(publicEntry, 105n, blockHash)).toEqual({
      status: 'FINALIZED',
      headNumber: 106n,
      headHash: blockHash,
    });
    getBlock.mockRejectedValueOnce(new Error('finalized tag unavailable'));
    expect(await reader.observeFinality!(publicEntry, 105n, blockHash)).toEqual({
      status: 'UNKNOWN',
    });
  });
  it.each([
    'APPROVE_TOKEN',
    'CREATE_SALE',
    'COMPLETE_SALE',
    'CANCEL_SALE',
    'EXPIRE_SALE',
    'WITHDRAW_PAYMENT',
    'RECLAIM_TOKEN',
  ])('observes an included receipt for %s using verified source identity', async (action) => {
    const journalEntry = entry(action);

    await expect(
      createTransactionChainReader(client(journalEntry), verificationContext).inspectTransaction(
        journalEntry,
        transactionHash,
      ),
    ).resolves.toEqual({
      kind: 'INCLUDED_SUCCESS',
      transactionHash,
      blockNumber: 12n,
      blockHash,
    });
  });

  it('observes a reverted non-funding receipt', async () => {
    const journalEntry = entry('WITHDRAW_PAYMENT');

    await expect(
      createTransactionChainReader(
        client(journalEntry, { receiptStatus: 'reverted' }),
        verificationContext,
      ).inspectTransaction(journalEntry, transactionHash),
    ).resolves.toEqual({
      kind: 'INCLUDED_REVERTED',
      transactionHash,
      blockNumber: 12n,
      blockHash,
    });
  });

  it('refuses a candidate when the RPC reports a different chain', async () => {
    const journalEntry = entry('APPROVE_TOKEN');
    const publicClient = client(journalEntry, { chainId: 31_338 });

    await expect(
      createTransactionChainReader(publicClient, verificationContext).inspectTransaction(
        journalEntry,
        transactionHash,
      ),
    ).resolves.toEqual({
      kind: 'UNAVAILABLE',
      transactionHash,
      reason: 'RPC_CHAIN_ID_MISMATCH',
    });
    expect(publicClient.getTransaction).not.toHaveBeenCalled();
  });

  it('refuses a candidate when the RPC reports a different deployment', async () => {
    const journalEntry = entry('APPROVE_TOKEN');
    const publicClient = client(journalEntry, {
      onChainDeploymentId: `0x${'7'.repeat(64)}`,
    });

    await expect(
      createTransactionChainReader(publicClient, verificationContext).inspectTransaction(
        journalEntry,
        transactionHash,
      ),
    ).resolves.toEqual({
      kind: 'UNAVAILABLE',
      transactionHash,
      reason: 'RPC_DEPLOYMENT_ID_MISMATCH',
    });
    expect(publicClient.getTransaction).not.toHaveBeenCalled();
  });

  it('refuses an operation whose saved target is outside its deployment descriptor', async () => {
    const journalEntry = { ...entry('APPROVE_TOKEN'), intendedContract: escrow };
    const publicClient = client(journalEntry);

    await expect(
      createTransactionChainReader(publicClient, verificationContext).inspectTransaction(
        journalEntry,
        transactionHash,
      ),
    ).resolves.toEqual({
      kind: 'UNAVAILABLE',
      transactionHash,
      reason: 'SAVED_CONTRACT_IDENTITY_MISMATCH',
    });
    expect(publicClient.getChainId).not.toHaveBeenCalled();
  });

  it('requires a wallet replacement hash when a nonce-backed original hash disappeared', async () => {
    const journalEntry = { ...entry('APPROVE_TOKEN'), nonce: 12 };
    const publicClient = client(journalEntry);
    vi.mocked(publicClient.getTransaction).mockRejectedValue(
      Object.assign(new Error('Transaction could not be found'), {
        name: 'TransactionNotFoundError',
      }),
    );

    await expect(
      createTransactionChainReader(publicClient, verificationContext).inspectTransaction(
        journalEntry,
        transactionHash,
      ),
    ).resolves.toEqual({
      kind: 'REPLACEMENT_HASH_REQUIRED',
      transactionHash,
      nonce: 12,
    });
  });
});
