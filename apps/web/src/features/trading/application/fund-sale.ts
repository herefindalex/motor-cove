import type { EscrowGateway } from '../ports/escrow-gateway.js';
export const fundSale = (gateway: EscrowGateway, saleId: string, priceWei: string) =>
  gateway.fundSale(BigInt(saleId), BigInt(priceWei));
