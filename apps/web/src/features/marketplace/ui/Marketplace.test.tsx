// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaleResponse } from '@motorcove/api-contracts';
import { Marketplace, type MarketActions } from './Marketplace.js';

const seller = `0x${'1'.repeat(40)}`;
const buyer = `0x${'2'.repeat(40)}`;
const sale = (priceWei: string): SaleResponse => ({
  saleId: priceWei,
  tokenId: priceWei,
  seller,
  buyer: null,
  priceWei,
  fundedAt: null,
  expiresAt: null,
  status: 'LISTED',
  tokenReclaimed: false,
  metadataStatus: 'MISSING',
  catalogId: null,
  claim: null,
});

afterEach(cleanup);

describe('Marketplace exact price presentation', () => {
  it('shows initial loading separately from a successfully empty result', () => {
    const { rerender } = render(
      <MemoryRouter>
        <Marketplace
          sales={[]}
          vehicles={[]}
          account={buyer}
          actions={undefined}
          provenance={null}
          currentTimestamp={undefined}
          loading
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading projected listings…')).toBeTruthy();
    expect(screen.queryByText('No projected listings.')).toBeNull();

    rerender(
      <MemoryRouter>
        <Marketplace
          sales={[]}
          vehicles={[]}
          account={buyer}
          actions={undefined}
          provenance={null}
          currentTimestamp={undefined}
          loading={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('No projected listings.')).toBeTruthy();
  });
  it.each([
    ['1', '0.000000000000000001 ETH'],
    ['500000000000000', '0.0005 ETH'],
    ['1000000000000001', '0.001000000000000001 ETH'],
    ['1000000000000000000', '1 ETH'],
    ['123456789012345678901234567890', '123456789012.34567890123456789 ETH'],
  ])('shows %s wei as %s', (priceWei, expected) => {
    render(
      <MemoryRouter>
        <Marketplace
          sales={[sale(priceWei)]}
          vehicles={[]}
          account={buyer}
          actions={undefined}
          provenance={null}
          currentTimestamp={undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('passes the exact displayed sale value to the fund action', () => {
    const selected = sale('500000000000000');
    const fund = vi.fn(async () => {});
    const actions = {
      fund,
      complete: vi.fn(),
      cancel: vi.fn(),
      expire: vi.fn(),
      withdraw: vi.fn(),
      reclaim: vi.fn(),
    } satisfies MarketActions;
    render(
      <MemoryRouter>
        <Marketplace
          sales={[selected]}
          vehicles={[]}
          account={buyer}
          actions={actions}
          provenance={null}
          currentTimestamp={undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('0.0005 ETH')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fund exactly' }));
    expect(fund).toHaveBeenCalledWith(selected);
  });

  it('shows and disables the pending action for one sale intent', () => {
    const selected = sale('7');
    const actions = {
      fund: vi.fn(),
      complete: vi.fn(),
      cancel: vi.fn(),
      expire: vi.fn(),
      withdraw: vi.fn(),
      reclaim: vi.fn(),
    } satisfies MarketActions;
    render(
      <MemoryRouter>
        <Marketplace
          sales={[selected]}
          vehicles={[]}
          account={buyer}
          actions={actions}
          pendingActionKeys={new Set(['FUND_SALE:7'])}
          provenance={null}
          currentTimestamp={undefined}
        />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Funding…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(actions.fund).not.toHaveBeenCalled();
  });
});
