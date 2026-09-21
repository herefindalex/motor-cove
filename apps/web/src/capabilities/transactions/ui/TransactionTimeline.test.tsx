// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { JournalEntry } from '../model.js';
import type { TransactionJournal } from '../ports.js';
import { TransactionTimeline } from './TransactionTimeline.js';

const deploymentId = `0x${'1'.repeat(64)}` as const;

describe('TransactionTimeline', () => {
  afterEach(cleanup);

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
      save: () => undefined,
      subscribe: () => () => undefined,
    };

    render(<TransactionTimeline deploymentId={deploymentId} journal={journal} />);

    expect(screen.getByText('FUND SALE')).toBeTruthy();
    expect(screen.getByText('REJECTED')).toBeTruthy();
    expect(screen.getByText('WALLET_REJECTED')).toBeTruthy();
    expect(screen.queryByText('SUBMITTED')).toBeNull();
  });
});
