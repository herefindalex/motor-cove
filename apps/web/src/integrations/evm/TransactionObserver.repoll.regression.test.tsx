// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import type { JournalEntry, TransactionJournal } from '../../capabilities/transactions/index.js';
import { TransactionObserver } from './TransactionObserver.js';

const resumeJournalEntry = vi.hoisted(() => vi.fn());
vi.mock('wagmi', () => ({ usePublicClient: () => ({}) }));
vi.mock('./inspect-transaction.js', () => ({ createTransactionChainReader: () => ({}) }));
vi.mock('../../capabilities/transactions/index.js', () => ({ resumeJournalEntry }));

const deploymentId = `0x${'1'.repeat(64)}`;
const config: PublicConfig = {
  deploymentId,
  chainId: '31337',
  protocolVersion: '0.1.0',
  nftAddress: `0x${'2'.repeat(40)}`,
  escrowAddress: `0x${'3'.repeat(40)}`,
  fundingPeriodSeconds: '300',
};
const entry: JournalEntry = {
  schemaVersion: 1,
  clientOperationId: 'operation-1',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  deploymentId,
  chainId: 31_337,
  account: `0x${'4'.repeat(40)}`,
  protocolVersion: '0.1.0',
  action: 'APPROVE_TOKEN',
  tokenId: '7',
  intendedContract: config.nftAddress,
  intendedCalldata: '0x1234',
  calldataSummary: 'APPROVE_TOKEN',
  valueWei: '0',
  originalTxHash: `0x${'5'.repeat(64)}`,
  currentTxHash: `0x${'5'.repeat(64)}`,
  status: 'SUBMITTED',
};
const journal: TransactionJournal = {
  load: () => [entry],
  loadIssues: () => [],
  save: (value) => value,
  subscribe: () => () => undefined,
};

describe('R9-02 observer repoll regression guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resumeJournalEntry.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not reenter while pending and polls again after the prior attempt settles', async () => {
    let settleFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      settleFirst = resolve;
    });
    resumeJournalEntry
      .mockImplementationOnce(async () => first)
      .mockResolvedValue({ kind: 'UNAVAILABLE', reason: 'API_REQUEST_TIMEOUT' });

    render(<TransactionObserver config={config} journal={journal} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(resumeJournalEntry).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(resumeJournalEntry).toHaveBeenCalledTimes(1);

    await act(async () => {
      settleFirst();
      await first;
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(resumeJournalEntry).toHaveBeenCalledTimes(2);
  });
});
