export type Address = `0x${string}`;

export type NormalizedEvent =
  | {
      kind: 'SaleCreated';
      saleId: string;
      tokenId: string;
      seller: Address;
      allowedBuyer: Address;
      priceWei: string;
    }
  | {
      kind: 'SaleFunded';
      saleId: string;
      buyer: Address;
      amountWei: string;
      fundedAt: string;
      expiresAt: string;
    }
  | { kind: 'SaleCompleted'; saleId: string }
  | { kind: 'SaleCancelled'; saleId: string }
  | { kind: 'SaleExpired'; saleId: string }
  | {
      kind: 'PaymentClaimCreated';
      saleId: string;
      beneficiary: Address;
      amountWei: string;
      claimKind: 'SELLER_PROCEEDS' | 'BUYER_REFUND';
    }
  | { kind: 'PaymentWithdrawn'; saleId: string; recipient: Address }
  | { kind: 'TokenReclaimed'; saleId: string; tokenId: string; recipient: Address }
  | { kind: 'Transfer'; tokenId: string; from: Address; to: Address };

export interface OrderedEvent {
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly blockHash: `0x${string}`;
  readonly transactionHash: `0x${string}`;
  readonly contractAddress: Address;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
  readonly event: NormalizedEvent;
}
