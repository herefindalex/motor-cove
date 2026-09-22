// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '@motorcove/api-contracts';
import type {
  JournalEntry,
  TransactionJournal,
  TransactionObservationCoordinator,
} from '../../capabilities/transactions/index.js';
import { BrowserTransactionObservationCoordinator } from '../persistence/browser-observation-coordinator.js';
import { TransactionObserver } from './TransactionObserver.js';

const resumeJournalEntry = vi.hoisted(() => vi.fn());
const publicClient = vi.hoisted(() => ({}));
const chainReader = vi.hoisted(() => ({}));
vi.mock('wagmi', () => ({ usePublicClient: () => publicClient }));
vi.mock('./inspect-transaction.js', () => ({ createTransactionChainReader: () => chainReader }));
vi.mock('../../capabilities/transactions/index.js', () => ({
  isProjectionCurrentlyReflected: () => false,
  resumeJournalEntry,
}));

const deploymentId = `0x${'1'.repeat(64)}`;
const config = {
  deploymentId,
  chainId: '31337',
  protocolVersion: '1',
  nftAddress: `0x${'3'.repeat(40)}`,
  escrowAddress: `0x${'7'.repeat(40)}`,
  fundingPeriodSeconds: '300',
} satisfies PublicConfig;
const entry: JournalEntry = {
  schemaVersion: 1,
  revision: 1,
  clientOperationId: 'operation-a',
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
  status: 'SUBMITTED',
};

class TestJournal implements TransactionJournal {
  private entries: JournalEntry[];
  private readonly listeners = new Set<() => void>();

  constructor(entries: readonly JournalEntry[]) {
    this.entries = [...entries];
  }

  load(requestedDeploymentId: string) {
    return this.entries.filter((candidate) => candidate.deploymentId === requestedDeploymentId);
  }

  loadIssues() {
    return [];
  }

  save(candidate: JournalEntry) {
    this.replace(candidate);
    return candidate;
  }

  replace(candidate: JournalEntry) {
    this.entries = [
      ...this.entries.filter(
        (current) => current.clientOperationId !== candidate.clientOperationId,
      ),
      candidate,
    ];
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class RecordingCoordinator implements TransactionObservationCoordinator {
  readonly calls: Array<{
    identity: { deploymentId: string; clientOperationId: string };
    wait: boolean;
  }> = [];

  constructor(private readonly beforeOperation: () => Promise<unknown> = async () => undefined) {}

  async run<T>(
    identity: { readonly deploymentId: string; readonly clientOperationId: string },
    options: { readonly wait: boolean },
    operation: () => Promise<T>,
  ) {
    this.calls.push({ identity, wait: options.wait });
    await this.beforeOperation();
    return { acquired: true as const, result: await operation() };
  }
}

afterEach(() => {
  cleanup();
  resumeJournalEntry.mockReset();
});

describe('TransactionObserver coordination', () => {
  it('allows only one automatic generation across observer instances', async () => {
    const journal = new TestJournal([entry]);
    const coordinator = new BrowserTransactionObservationCoordinator();
    const release = deferred<undefined>();
    resumeJournalEntry.mockImplementation(async (current: JournalEntry) => {
      await release.promise;
      journal.save({
        ...current,
        revision: (current.revision ?? 0) + 1,
        updatedAt: '2026-09-22T00:00:02.000Z',
        status: 'INCLUDED_SUCCESS',
        receiptStatus: 'SUCCESS',
      });
    });

    render(
      <>
        <TransactionObserver config={config} journal={journal} coordinator={coordinator} />
        <TransactionObserver config={config} journal={journal} coordinator={coordinator} />
      </>,
    );

    await waitFor(() => expect(resumeJournalEntry).toHaveBeenCalledTimes(1));
    release.resolve(undefined);
    await waitFor(() => expect(journal.load(deploymentId)[0]?.status).toBe('INCLUDED_SUCCESS'));
    expect(resumeJournalEntry).toHaveBeenCalledTimes(1);
  });

  it('reloads the latest journal revision after acquiring ownership', async () => {
    const journal = new TestJournal([entry]);
    const allowOwnership = deferred<undefined>();
    const coordinator = new RecordingCoordinator(() => allowOwnership.promise);
    resumeJournalEntry.mockResolvedValue(undefined);

    render(<TransactionObserver config={config} journal={journal} coordinator={coordinator} />);
    await waitFor(() => expect(coordinator.calls).toHaveLength(1));
    journal.replace({
      ...entry,
      revision: 2,
      updatedAt: '2026-09-22T00:00:02.000Z',
      verificationRequestId: 'latest-generation',
    });
    allowOwnership.resolve(undefined);

    await waitFor(() => expect(resumeJournalEntry).toHaveBeenCalledTimes(1));
    expect(resumeJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 2, verificationRequestId: 'latest-generation' }),
      expect.anything(),
      undefined,
    );
  });

  it('queues a manual candidate through the coordinator', async () => {
    const manualEntry: JournalEntry = {
      ...entry,
      status: 'REPLACED_OR_CANCELLED',
      verificationAvailability: 'UNAVAILABLE',
    };
    const journal = new TestJournal([manualEntry]);
    const coordinator = new RecordingCoordinator();
    resumeJournalEntry.mockResolvedValue(undefined);

    render(<TransactionObserver config={config} journal={journal} coordinator={coordinator} />);
    const alternativeHash = `0x${'6'.repeat(64)}`;
    fireEvent.change(screen.getByLabelText(/Alternative transaction hash/), {
      target: { value: alternativeHash },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recheck evidence' }));

    await waitFor(() => expect(resumeJournalEntry).toHaveBeenCalledTimes(1));
    expect(coordinator.calls).toEqual([
      {
        identity: { deploymentId, clientOperationId: entry.clientOperationId },
        wait: true,
      },
    ]);
    expect(resumeJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      alternativeHash,
    );
  });
});
