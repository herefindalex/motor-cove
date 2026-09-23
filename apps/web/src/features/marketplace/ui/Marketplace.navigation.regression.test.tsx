// @vitest-environment jsdom

import { createContext, useContext, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaleResponse } from '@motorcove/api-contracts';
import { Marketplace, type MarketActions } from './Marketplace.js';

const seller = `0x${'1'.repeat(40)}`;
const buyer = `0x${'2'.repeat(40)}`;
const sale: SaleResponse = {
  saleId: '7',
  tokenId: '7',
  seller,
  buyer: null,
  priceWei: '1',
  fundedAt: null,
  expiresAt: null,
  status: 'LISTED',
  tokenReclaimed: false,
  metadataStatus: 'MISSING',
  catalogId: null,
  claim: null,
};
const actions: MarketActions = {
  fund: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
  expire: vi.fn(),
  withdraw: vi.fn(),
  reclaim: vi.fn(),
};
const Evidence = createContext<string | null>(null);

function Probe() {
  const evidence = useContext(Evidence);
  const location = useLocation();
  return <div>{`evidence=${evidence};path=${location.pathname}`}</div>;
}
function Harness() {
  const [evidence] = useState('volatile-hash-survives-router-navigation');
  return (
    <Evidence.Provider value={evidence}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Marketplace
                sales={[sale]}
                vehicles={[]}
                account={buyer}
                actions={actions}
                provenance={null}
                currentTimestamp={undefined}
              />
              <Probe />
            </>
          }
        />
        <Route
          path="/sales/:saleId"
          element={
            <>
              <div>sale detail route</div>
              <Probe />
            </>
          }
        />
      </Routes>
    </Evidence.Provider>
  );
}

afterEach(cleanup);

describe('R6-04 router regression guard', () => {
  it('uses client-side navigation so in-memory evidence survives', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('evidence=volatile-hash-survives-router-navigation;path=/'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Vehicle #7' }));

    expect(screen.getByText('sale detail route')).toBeTruthy();
    expect(
      screen.getByText('evidence=volatile-hash-survives-router-navigation;path=/sales/7'),
    ).toBeTruthy();
  });
});
