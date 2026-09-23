import type { EscrowGateway } from '../ports/escrow-gateway.js';
import { parseEth } from '../model/amount.js';
export async function approveAndCreateListing(
  gateway: EscrowGateway,
  tokenId: string,
  priceEth: string,
  allowedBuyer: `0x${string}`,
) {
  const approval = await gateway.approveToken(BigInt(tokenId));
  if (approval.kind !== 'submitted') return { step: 'approval' as const, result: approval };
  return {
    step: 'approval-submitted' as const,
    result: approval,
    next: () => gateway.createSale(BigInt(tokenId), parseEth(priceEth), allowedBuyer),
  };
}
