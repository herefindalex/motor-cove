import { describe, expect, it } from 'vitest';
import { projectSale } from './sale-projector.js';
import { projectPayment } from './payment-projector.js';

describe('pure projectors', () => {
  it('keeps sale and payment state independent', () => {
    const listed = projectSale(undefined, {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '9',
      seller: '0x0000000000000000000000000000000000000001',
      priceWei: '10',
    });
    const funded = projectSale(listed, {
      kind: 'SaleFunded',
      saleId: '1',
      buyer: '0x0000000000000000000000000000000000000002',
      amountWei: '10',
      fundedAt: '100',
      expiresAt: '400',
    });
    const completed = projectSale(funded, { kind: 'SaleCompleted', saleId: '1' });
    const claim = projectPayment(undefined, {
      kind: 'PaymentClaimCreated',
      saleId: '1',
      beneficiary: '0x0000000000000000000000000000000000000001',
      amountWei: '10',
      claimKind: 'SELLER_PROCEEDS',
    });
    expect(completed?.status).toBe('COMPLETED');
    expect(claim?.status).toBe('CLAIMABLE');
  });
  it('rejects impossible event order', () => {
    const listed = projectSale(undefined, {
      kind: 'SaleCreated',
      saleId: '1',
      tokenId: '9',
      seller: '0x0000000000000000000000000000000000000001',
      priceWei: '10',
    });
    expect(() => projectSale(listed, { kind: 'SaleCompleted', saleId: '1' })).toThrow(
      'requires FUNDED',
    );
  });
});
