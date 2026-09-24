// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { JournalEntry } from '../model.js';
import type { TransactionJournal } from '../ports.js';
import { TransactionTimeline } from './TransactionTimeline.js';

const deploymentId = `0x${'1'.repeat(64)}` as const;

describe('TransactionTimeline', () => {
  afterEach(cleanup);

  it('labels included public transaction as awaiting finality without premature projection lag', () => {
    const included: JournalEntry = {
      schemaVersion: 1,
      clientOperationId: 'public-included',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:01.000Z',
      deploymentId,
      chainId: 1,
      account: `0x${'2'.repeat(40)}`,
      protocolVersion: '1',
      action: 'FUND_SALE',
      saleId: '1',
      intendedContract: `0x${'3'.repeat(40)}`,
      intendedCalldata: '0x1234',
      calldataSummary: 'fundSale(1)',
      valueWei: '1',
      status: 'INCLUDED_SUCCESS',
      receiptBlockNumber: '123',
      finalityStatus: 'UNFINALIZED',
      projectionObservation: 'NOT_REACHED',
    };
    const journal: TransactionJournal = {
      load: () => [included],
      loadIssues: () => [],
      save: (value) => value,
      subscribe: () => () => undefined,
    };
    render(<TransactionTimeline deploymentId={deploymentId} journal={journal} />);
    expect(screen.getByText('Included; waiting for chain finality.')).toBeTruthy();
    expect(screen.getByText('Finalized marketplace projection is not expected yet.')).toBeTruthy();
    expect(
      screen.queryByText('Transaction included; marketplace data is still syncing.'),
    ).toBeNull();
  });
  it('keeps raw state visible alongside inclusion and projection-lag meaning', () => {
    const included: JournalEntry = {
      schemaVersion: 1,
      clientOperationId: 'operation-included',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:01.000Z',
      deploymentId,
      chainId: 31337,
      account: `0x${'2'.repeat(40)}`,
      protocolVersion: '1',
      action: 'FUND_SALE',
      saleId: '1',
      intendedContract: `0x${'3'.repeat(40)}`,
      intendedCalldata: '0x1234',
      calldataSummary: 'fundSale(1)',
      valueWei: '1',
      status: 'INCLUDED_SUCCESS',
      currentTxHash: `0x${'4'.repeat(64)}`,
      receiptBlockNumber: '123',
      projectionObservation: 'NOT_REACHED',
    };
    const journal: TransactionJournal = {
      load: () => [included],
      loadIssues: () => [],
      save: (value) => value,
      subscribe: () => () => undefined,
    };
    render(<TransactionTimeline deploymentId={deploymentId} journal={journal} />);
    expect(screen.getByText('INCLUDED_SUCCESS')).toBeTruthy();
    expect(screen.getByText('Included successfully')).toBeTruthy();
    expect(screen.getByText('Receipt block 123')).toBeTruthy();
    expect(
      screen.getByText('Transaction included; marketplace data is still syncing.'),
    ).toBeTruthy();
  });

  it('renders wallet rejection as a terminal pre-submission observation', () => {
    const rejected: JournalEntry = {
      schemaVersion: 1,
      clientOperationId: 'operation-1',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:01.000Z',
      deploymentId,
      chainId: 31337,
      account: `0x${'2'.repeat(40)}`,
      protocolVersion: '1',
      action: 'FUND_SALE',
      saleId: '1',
      intendedContract: `0x${'3'.repeat(40)}`,
      intendedCalldata: '0x1234',
      calldataSummary: 'fundSale(1)',
      valueWei: '1000000000000000000',
      status: 'REJECTED',
      lastErrorCategory: 'WALLET_REJECTED',
    };
    const journal: TransactionJournal = {
      load: () => [rejected],
      loadIssues: () => [],
      save: (value) => value,
      subscribe: () => () => undefined,
    };

    render(<TransactionTimeline deploymentId={deploymentId} journal={journal} />);

    expect(screen.getByText('FUND SALE')).toBeTruthy();
    expect(screen.getByText('REJECTED')).toBeTruthy();
    expect(screen.getByText('WALLET_REJECTED')).toBeTruthy();
    expect(screen.queryByText('SUBMITTED')).toBeNull();
  });

  it('shows that entries may be tab-only when durable storage cannot be read', () => {
    const journal: TransactionJournal = {
      load: () => [],
      loadIssues: () => [
        {
          deploymentId,
          reason: 'STORAGE_UNAVAILABLE',
          detail: 'storage denied by browser policy',
        },
      ],
      save: (entry) => entry,
      subscribe: () => () => undefined,
    };

    render(<TransactionTimeline deploymentId={deploymentId} journal={journal} />);
    expect(screen.getByRole('status').textContent).toContain(
      'Browser transaction storage is unavailable',
    );
    expect(screen.getByText('No wallet operations recorded for deployment.')).toBeTruthy();
  });
});
