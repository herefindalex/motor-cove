import type { NormalizedEvent } from '../events.js';
import { ProjectionIntegrityError } from './projection-integrity-error.js';

export interface PaymentProjection {
  readonly saleId: string;
  readonly beneficiary: string;
  readonly amountWei: string;
  readonly kind: 'SELLER_PROCEEDS' | 'BUYER_REFUND';
  readonly status: 'CLAIMABLE' | 'WITHDRAWN';
  readonly recipient: string | null;
}
export function projectPayment(
  current: PaymentProjection | undefined,
  event: NormalizedEvent,
): PaymentProjection | undefined {
  if (event.kind === 'PaymentClaimCreated') {
    if (current) throw new Error(`Claim for sale ${event.saleId} already exists`);
    return {
      saleId: event.saleId,
      beneficiary: event.beneficiary,
      amountWei: event.amountWei,
      kind: event.claimKind,
      status: 'CLAIMABLE',
      recipient: null,
    };
  }
  if (event.kind === 'PaymentWithdrawn') {
    if (!current)
      throw new ProjectionIntegrityError(
        'payment-claim',
        event.saleId,
        event.kind,
        'PaymentClaimCreated',
      );
    if (current.saleId !== event.saleId)
      throw new ProjectionIntegrityError(
        'payment-claim',
        event.saleId,
        event.kind,
        `claim ${event.saleId}`,
      );
    if (current.status !== 'CLAIMABLE') throw new Error('Claim already withdrawn');
    return { ...current, status: 'WITHDRAWN', recipient: event.recipient };
  }
  return current;
}
