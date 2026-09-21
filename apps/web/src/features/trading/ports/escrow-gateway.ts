import type { SubmissionResult } from '../../../capabilities/transactions/index.js';
export interface EscrowGateway {
  approveToken(tokenId: bigint): Promise<SubmissionResult>;
  createSale(tokenId: bigint, priceWei: bigint): Promise<SubmissionResult>;
  fundSale(saleId: bigint, priceWei: bigint): Promise<SubmissionResult>;
  completeSale(saleId: bigint): Promise<SubmissionResult>;
  cancelSale(saleId: bigint): Promise<SubmissionResult>;
  expireSale(saleId: bigint): Promise<SubmissionResult>;
  withdrawPayment(saleId: bigint, recipient: `0x${string}`): Promise<SubmissionResult>;
  reclaimToken(saleId: bigint, recipient: `0x${string}`): Promise<SubmissionResult>;
}
