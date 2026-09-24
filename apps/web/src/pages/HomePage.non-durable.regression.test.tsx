// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TransactionJournalProvider,
  type TransactionJournal,
} from '../capabilities/transactions/index.js';
import { HomePage } from './HomePage.js';

const deploymentId = `0x${'1'.repeat(64)}`;
const hash = `0x${'4'.repeat(64)}`;
const buyer = `0x${'2'.repeat(40)}`;
const seller = `0x${'3'.repeat(40)}`;

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'config')
      return {
        data: {
          deploymentId,
          chainId: '31337',
          protocolVersion: '0.2.0',
          nftAddress: `0x${'5'.repeat(40)}`,
          escrowAddress: `0x${'6'.repeat(40)}`,
          fundingPeriodSeconds: '300',
        },
        isError: false,
      };
    if (queryKey[0] === 'sales')
      return {
        data: {
          data: [
            {
              saleId: '7',
              tokenId: '1',
              seller,
              allowedBuyer: buyer,
              buyer: null,
              priceWei: '10',
              fundedAt: null,
              expiresAt: null,
              status: 'LISTED',
              tokenReclaimed: false,
              metadataStatus: 'MISSING',
              catalogId: null,
              claim: null,
            },
          ],
          provenance: { indexedBlockNumber: '1', projectorVersion: '1' },
        },
        isError: false,
      };
    if (queryKey[0] === 'vehicles')
      return { data: { data: [], provenance: { indexedBlockNumber: '1' } }, isError: false };
    return {
      data: {
        data: { projectionStatus: 'CURRENT', observationFreshness: 'FRESH', lagBlocks: '0' },
      },
      isError: false,
    };
  },
}));

vi.mock('../integrations/evm/use-wallet-state.js', () => ({
  useWalletState: () => ({
    state: { kind: 'connected', account: buyer },
    connectors: [],
    pending: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  }),
}));
vi.mock('../integrations/evm/use-escrow-gateway.js', () => ({
  useEscrowGateway: () => ({
    approveToken: vi.fn(),
    createSale: vi.fn(),
    fundSale: vi.fn(async () => ({
      kind: 'submitted-non-durable',
      hash,
      clientOperationId: 'operation-1',
    })),
    completeSale: vi.fn(),
    cancelSale: vi.fn(),
    expireSale: vi.fn(),
    withdrawPayment: vi.fn(),
    reclaimToken: vi.fn(),
  }),
}));
vi.mock('../integrations/evm/use-chain-time.js', () => ({ useChainTime: () => undefined }));
vi.mock('../integrations/evm/use-token-approvals.js', () => ({
  useTokenApprovals: () => new Map([['1', 'approved']]),
}));
vi.mock('../integrations/evm/TransactionObserver.js', () => ({
  TransactionObserver: () => <div>observer</div>,
}));

const journal: TransactionJournal = {
  load: () => [],
  loadIssues: () => [],
  save: (entry) => entry,
  subscribe: () => () => undefined,
};

afterEach(cleanup);

describe('R2-06 page-level non-durable hash regression guard', () => {
  it('keeps the returned hash copyable and visible', async () => {
    render(
      <MemoryRouter>
        <TransactionJournalProvider journal={journal}>
          <HomePage />
        </TransactionJournalProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fund exactly' }));

    await waitFor(() => expect(screen.getByText(hash)).toBeTruthy());
    expect(screen.getByText(/journal could not persist it/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy transaction hash' })).toBeTruthy();
  });
});
