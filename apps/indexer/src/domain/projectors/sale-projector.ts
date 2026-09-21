import type { NormalizedEvent } from '../events.js';

export interface SaleProjection {
  readonly saleId: string;
  readonly tokenId: string;
  readonly seller: string;
  readonly buyer: string | null;
  readonly priceWei: string;
  readonly fundedAt: string | null;
  readonly expiresAt: string | null;
  readonly status: 'LISTED' | 'FUNDED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  readonly tokenReclaimed: boolean;
}

export function projectSale(
  current: SaleProjection | undefined,
  event: NormalizedEvent,
): SaleProjection | undefined {
  if (event.kind === 'SaleCreated') {
    if (current) throw new Error(`Sale ${event.saleId} already exists`);
    return {
      saleId: event.saleId,
      tokenId: event.tokenId,
      seller: event.seller,
      buyer: null,
      priceWei: event.priceWei,
      fundedAt: null,
      expiresAt: null,
      status: 'LISTED',
      tokenReclaimed: false,
    };
  }
  if (!('saleId' in event) || !current || event.saleId !== current.saleId) return current;
  switch (event.kind) {
    case 'SaleFunded':
      if (current.status !== 'LISTED') throw new Error('SaleFunded requires LISTED');
      return {
        ...current,
        buyer: event.buyer,
        fundedAt: event.fundedAt,
        expiresAt: event.expiresAt,
        status: 'FUNDED',
      };
    case 'SaleCompleted':
      if (current.status !== 'FUNDED') throw new Error('SaleCompleted requires FUNDED');
      return { ...current, status: 'COMPLETED' };
    case 'SaleCancelled':
      if (current.status !== 'LISTED') throw new Error('SaleCancelled requires LISTED');
      return { ...current, status: 'CANCELLED' };
    case 'SaleExpired':
      if (current.status !== 'FUNDED') throw new Error('SaleExpired requires FUNDED');
      return { ...current, status: 'EXPIRED' };
    case 'TokenReclaimed':
      if (current.status !== 'CANCELLED' && current.status !== 'EXPIRED')
        throw new Error('TokenReclaimed requires terminal return state');
      return { ...current, tokenReclaimed: true };
    default:
      return current;
  }
}
