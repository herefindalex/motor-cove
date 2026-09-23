// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import type {
  JournalEntry,
  JournalLoadIssue,
  TransactionJournal,
} from '../../capabilities/transactions/index.js';
import { TransactionObserver } from './TransactionObserver.js';

const resumeJournalEntry = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('wagmi', () => ({ usePublicClient: () => ({}) }));
vi.mock('./inspect-transaction.js', () => ({ createTransactionChainReader: () => ({}) }));
vi.mock('../../capabilities/transactions/index.js', () => ({ resumeJournalEntry }));

const deploymentId = `0x${'1'.repeat(64)}`;
const config = {
  deploymentId,
  chainId: '31337',
  protocolVersion: '1',
  nftAddress: `0x${'3'.repeat(40)}`,
  escrowAddress: `0x${'7'.repeat(40)}`,
  fundingPeriodSeconds: '300',
} satisfies PublicConfig;
const entry = {
  schemaVersion: 1,
  clientOperationId: 'reverted-operation',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:01.000Z',
  deploymentId,
  chainId: 31_337,
  account: `0x${'2'.repeat(40)}`,
  protocolVersion: '1',
  action: 'APPROVE_TOKEN',
  tokenId: '7',
  intendedContract: config.nftAddress,
  intendedCalldata: '0x1234',
  calldataSummary: 'APPROVE_TOKEN',
  valueWei: '0',
  originalTxHash: `0x${'4'.repeat(64)}`,
  currentTxHash: `0x${'4'.repeat(64)}`,
  receiptStatus: 'REVERTED',
  receiptBlockNumber: '8',
  receiptBlockHash: `0x${'5'.repeat(64)}`,
  status: 'INCLUDED_REVERTED',
} satisfies JournalEntry;

function journalWith(
  entries: readonly JournalEntry[],
  issues: readonly JournalLoadIssue[] = [],
): TransactionJournal {
  return {
    load: () => entries,
    loadIssues: () => issues,
    save: (saved) => saved,
    subscribe: () => () => undefined,
  };
}

afterEach(() => {
  cleanup();
  resumeJournalEntry.mockClear();
});

describe('TransactionObserver automatic receipt observation', () => {
  it('continues observing non-final reverted evidence', async () => {
    render(<TransactionObserver config={config} journal={journalWith([entry])} />);

    await waitFor(() =>
      expect(resumeJournalEntry).toHaveBeenCalledWith(
        entry,
        expect.anything(),
        undefined,
        'AUTOMATIC',
      ),
    );
  });

  it('does not automatically observe a rejected operation', async () => {
    render(
      <TransactionObserver
        config={config}
        journal={journalWith([{ ...entry, status: 'REJECTED', receiptStatus: undefined }])}
      />,
    );

    await Promise.resolve();
    expect(resumeJournalEntry).not.toHaveBeenCalled();
  });

  it('allows a read-only alternative hash for unavailable verification', async () => {
    render(
      <TransactionObserver
        config={config}
        journal={journalWith([
          {
            ...entry,
            status: 'REPLACED_OR_CANCELLED',
            verificationAvailability: 'UNAVAILABLE',
          },
        ])}
      />,
    );
    const alternativeHash = `0x${'6'.repeat(64)}`;

    fireEvent.change(screen.getByLabelText('Alternative transaction hash from wallet activity'), {
      target: { value: alternativeHash },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recheck evidence' }));

    await waitFor(() => expect(resumeJournalEntry).toHaveBeenCalled());
    const lastCall = resumeJournalEntry.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ originalTxHash: entry.originalTxHash });
    expect(lastCall?.[2]).toBe(alternativeHash);
  });

  it('asks for the current or replacement wallet hash when the original disappeared', () => {
    render(
      <TransactionObserver
        config={config}
        journal={journalWith([
          {
            ...entry,
            status: 'SUBMITTED',
            nonce: 4,
            verificationAvailability: 'UNAVAILABLE',
            lastErrorCategory: 'REPLACEMENT_HASH_REQUIRED',
          },
        ])}
      />,
    );

    expect(screen.getByText(/original transaction hash is no longer available/i)).toBeTruthy();
    expect(
      screen.getByLabelText('Current or replacement transaction hash from wallet activity'),
    ).toBeTruthy();
  });

  it('shows that the latest verification is tab-local when durable writes fail', () => {
    render(
      <TransactionObserver
        config={config}
        journal={journalWith(
          [entry],
          [
            {
              deploymentId,
              reason: 'STORAGE_UNAVAILABLE',
              detail: 'Quota exceeded',
            },
          ],
        )}
      />,
    );

    expect(screen.getByText(/Latest verification is available only in this tab/)).toBeTruthy();
  });
});
