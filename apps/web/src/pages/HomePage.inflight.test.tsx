// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TransactionJournalProvider,
  type TransactionJournal,
} from '../capabilities/transactions/index.js';
import { HomePage } from './HomePage.js';

const deploymentId = `0x${'1'.repeat(64)}`;
const buyer = `0x${'2'.repeat(40)}`;
const seller = `0x${'3'.repeat(40)}`;
const controlled = vi.hoisted(() => ({
  fundSale: vi.fn(),
  release: undefined as (() => void) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'config')
      return { data: { deploymentId, chainId: '31337' }, isError: false };
    if (queryKey[0] === 'sales')
      return {
        data: {
          data: [
            {
              saleId: '7',
              tokenId: '1',
              seller,
              buyer: null,
              priceWei: '1000000000000000000',
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
        data: {
          projectionStatus: 'CURRENT',
          observationFreshness: 'FRESH',
          lagBlocks: '0',
        },
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
    fundSale: controlled.fundSale,
    completeSale: vi.fn(),
    cancelSale: vi.fn(),
    expireSale: vi.fn(),
    withdrawPayment: vi.fn(),
    reclaimToken: vi.fn(),
  }),
}));
vi.mock('../integrations/evm/use-chain-time.js', () => ({ useChainTime: () => undefined }));
vi.mock('../integrations/evm/TransactionObserver.js', () => ({
  TransactionObserver: () => <div>observer</div>,
}));

const journal: TransactionJournal = {
  load: () => [],
  loadIssues: () => [],
  save: (entry) => entry,
  subscribe: () => () => undefined,
};

describe('HomePage transaction intent ownership', () => {
  beforeEach(() => {
    controlled.fundSale.mockReset();
    controlled.fundSale.mockImplementation(
      () =>
        new Promise((resolve) => {
          controlled.release = () =>
            resolve({
              kind: 'submitted',
              hash: `0x${'4'.repeat(64)}`,
              clientOperationId: 'operation-1',
            });
        }),
    );
  });

  afterEach(() => {
    cleanup();
    controlled.release = undefined;
  });

  it('disables the sale intent while pending and invokes the gateway once on rapid clicks', async () => {
    render(
      <MemoryRouter>
        <TransactionJournalProvider journal={journal}>
          <HomePage />
        </TransactionJournalProvider>
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Fund exactly' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(controlled.fundSale).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Funding…' }).hasAttribute('disabled')).toBe(true);

    await act(async () => controlled.release?.());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fund exactly' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
  });
});
