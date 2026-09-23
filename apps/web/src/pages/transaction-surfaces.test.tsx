// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  TransactionJournalProvider,
  type JournalEntry,
} from '../capabilities/transactions/index.js';
import { LocalStorageJournal } from '../integrations/persistence/local-storage-journal.js';
import { HomePage } from './HomePage.js';
import { SaleDetailPage } from './SaleDetailPage.js';

const deploymentId = `0x${'1'.repeat(64)}`;
const transactionHash = `0x${'4'.repeat(64)}`;

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'config')
      return { data: { deploymentId, chainId: '31337' }, isError: false };
    return { data: undefined, isError: true };
  },
}));

vi.mock('react-router-dom', () => ({ useParams: () => ({ saleId: '7' }) }));
vi.mock('../integrations/evm/use-wallet-state.js', () => ({
  useWalletState: () => ({
    state: { kind: 'disconnected' },
    connectors: [],
    pending: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  }),
}));
vi.mock('../integrations/evm/use-escrow-gateway.js', () => ({
  useEscrowGateway: () => undefined,
}));
vi.mock('../integrations/evm/use-chain-time.js', () => ({ useChainTime: () => undefined }));
vi.mock('../integrations/evm/use-token-approvals.js', () => ({
  useTokenApprovals: () => new Map([['1', 'approved']]),
}));
vi.mock('../integrations/evm/TransactionObserver.js', () => ({
  TransactionObserver: () => <div>RPC transaction observer active</div>,
}));

const entry: JournalEntry = {
  schemaVersion: 1,
  clientOperationId: 'operation-1',
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
  deploymentId,
  chainId: 31_337,
  account: `0x${'2'.repeat(40)}`,
  protocolVersion: '1',
  action: 'FUND_SALE',
  saleId: '7',
  intendedContract: `0x${'3'.repeat(40)}`,
  intendedCalldata: '0x1234',
  calldataSummary: 'FUND_SALE',
  valueWei: '10',
  walletRequestStartedAt: '2026-09-21T00:00:01.000Z',
  originalTxHash: transactionHash,
  currentTxHash: transactionHash,
  evidenceSource: 'WALLET_RETURNED',
  association: 'EXACT_SUBMISSION',
  status: 'SUBMITTED',
};

describe('transaction surfaces during API failure', () => {
  beforeEach(() => {
    localStorage.setItem(`motorcove:journal:v1:${deploymentId}`, JSON.stringify([entry]));
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('keeps the home observer and transaction hash visible', () => {
    render(
      <TransactionJournalProvider journal={new LocalStorageJournal()}>
        <HomePage />
      </TransactionJournalProvider>,
    );
    expect(screen.getByText('Integration error')).toBeTruthy();
    expect(screen.getByText('RPC transaction observer active')).toBeTruthy();
    expect(screen.getByText(transactionHash)).toBeTruthy();
  });

  it('keeps the sale observer and matching transaction hash visible', () => {
    render(
      <TransactionJournalProvider journal={new LocalStorageJournal()}>
        <SaleDetailPage />
      </TransactionJournalProvider>,
    );
    expect(screen.getByText('Sale detail unavailable')).toBeTruthy();
    expect(screen.getByText('RPC transaction observer active')).toBeTruthy();
    expect(screen.getByText(transactionHash)).toBeTruthy();
  });
});
