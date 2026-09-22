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
});
