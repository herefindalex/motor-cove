# Settlement and claims flow

This page traces completion, cancellation, expiry, payment claims, and NFT recovery.

## Complete and withdraw

Before expiry, only the recorded buyer can complete a funded sale. Completion transfers the NFT to
the buyer and creates a `SELLER_PROCEEDS` claim. The seller then calls `withdrawPayment` in a separate
transaction. The beneficiary authorizes withdrawal; the recipient may be another safe address.

## Cancel and reclaim

Only the seller can cancel a listed sale. Cancellation changes sale state but leaves the NFT in
escrow. The seller calls `reclaimToken` separately, and the transfer can be retried if the recipient
rejected the NFT without rolling back the earlier cancellation.

## Expire, refund, and reclaim

After the on-chain deadline, anyone can execute expiry. This creates `BUYER_REFUND`; it does not send
ETH automatically. Buyer refund withdrawal and seller NFT reclaim are independent operations. A
failed recipient call rolls back only the attempted withdrawal or reclaim transaction.

## Invariants

Each funded principal becomes at most one claim. Claim amount and beneficiary remain attributable to
the sale. `totalLiability` decreases only after a successful transfer. Historical buyer does not
become the permanent ownership source; ERC-721 `Transfer` events drive current ownership.

See [escrow protocol](../protocol/escrow.md) and contract tests under `chain/test`.
