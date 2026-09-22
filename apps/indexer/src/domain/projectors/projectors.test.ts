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

  it.each([
    {
      kind: 'SaleFunded',
      saleId: '9',
      buyer: '0x0000000000000000000000000000000000000002',
      amountWei: '10',
      fundedAt: '100',
      expiresAt: '400',
    },
    { kind: 'SaleCompleted', saleId: '9' },
    { kind: 'SaleCancelled', saleId: '9' },
    { kind: 'SaleExpired', saleId: '9' },
    {
      kind: 'TokenReclaimed',
      saleId: '9',
      tokenId: '3',
      recipient: '0x0000000000000000000000000000000000000002',
    },
  ] as const)('rejects $kind when its SaleCreated prerequisite is missing', (event) => {
    expect(() => projectSale(undefined, event)).toThrow(
      `PROJECTOR_INTEGRITY: ${event.kind} requires SaleCreated for sale 9`,
    );
  });

  it('rejects PaymentWithdrawn when its claim prerequisite is missing', () => {
    expect(() =>
      projectPayment(undefined, {
        kind: 'PaymentWithdrawn',
        saleId: '9',
        recipient: '0x0000000000000000000000000000000000000002',
      }),
    ).toThrow(
      'PROJECTOR_INTEGRITY: PaymentWithdrawn requires PaymentClaimCreated for payment-claim 9',
    );
  });

  it('keeps unrelated events as no-ops when no entity exists', () => {
    const transfer = {
      kind: 'Transfer' as const,
      tokenId: '9',
      from: '0x0000000000000000000000000000000000000001' as const,
      to: '0x0000000000000000000000000000000000000002' as const,
    };
    expect(projectSale(undefined, transfer)).toBeUndefined();
    expect(projectPayment(undefined, transfer)).toBeUndefined();
  });
});
