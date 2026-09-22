// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalEntry, TransactionJournal } from '../../capabilities/transactions/index.js';
import { TransactionObserver } from './TransactionObserver.js';

const resumeJournalEntry = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('wagmi', () => ({ usePublicClient: () => ({}) }));
vi.mock('./inspect-transaction.js', () => ({ createTransactionChainReader: () => ({}) }));
vi.mock('../../capabilities/transactions/index.js', () => ({ resumeJournalEntry }));

const deploymentId = `0x${'1'.repeat(64)}`;
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
  intendedContract: `0x${'3'.repeat(40)}`,
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

function journalWith(entries: readonly JournalEntry[]): TransactionJournal {
  return {
    load: () => entries,
    loadIssues: () => [],
    save: (saved) => saved,
    subscribe: () => () => undefined,
  };
}

afterEach(() => {
  cleanup();
  resumeJournalEntry.mockClear();
});

describe('TransactionObserver automatic receipt observation', () => {
  it('continues observing a locally non-final reverted receipt', async () => {
    render(<TransactionObserver deploymentId={deploymentId} journal={journalWith([entry])} />);

    await waitFor(() =>
      expect(resumeJournalEntry).toHaveBeenCalledWith(entry, expect.anything(), undefined),
    );
  });

  it('does not poll an operation known to have been rejected before submission', async () => {
    render(
      <TransactionObserver
        deploymentId={deploymentId}
        journal={journalWith([{ ...entry, status: 'REJECTED', receiptStatus: undefined }])}
      />,
    );

    await Promise.resolve();
    expect(resumeJournalEntry).not.toHaveBeenCalled();
  });

  it('accepts a read-only alternative hash when the saved hash is unavailable', async () => {
    render(
      <TransactionObserver
        deploymentId={deploymentId}
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
});
