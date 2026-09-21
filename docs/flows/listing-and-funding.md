# Listing and funding flow

This page traces `SALE-001` and `SALE-002` from UI intent to independent chain and projection evidence.

## Approve and list

Approval and listing are two transactions. `approve` authorizes the escrow for one token and does
not move it. `createSale` verifies the caller owns the token, transfers it into escrow through the
safe receiver guard, records `LISTED`, and emits `SaleCreated`.

## Fund

1. The sale page reads the API snapshot and current wallet/network state.
2. The EVM gateway simulates `fundSale(saleId)` with the exact `priceWei`.
3. The transaction journal durably records the fixed intent and wallet-request boundary, then the
   wallet submits exactly once.
4. The contract rejects seller self-purchase or a non-exact value. Success records buyer and expiry.
5. The frontend verifies sender, escrow, calldata, value, receipt, canonical block, and the exact
   `SaleFunded` log. Independently, the Indexer pulls that event, applies the sale projector, and
   advances the checkpoint.
6. A selector-scoped API read returns coverage, event lookup, projection effect, freshness, and
   provenance from one SQLite snapshot. `NOT_REACHED` means the chain payment is known while the
   marketplace projection is still catching up.
7. `MATCHED` plus `CONSISTENT` proves this snapshot reflects the funding. The current Sale may be
   `FUNDED`, `COMPLETED`, or `EXPIRED`; later progress does not erase the historical funding effect.

Funding never creates a payment claim. Completion creates a seller proceeds claim, while expiry
creates a buyer refund claim. A reflected funding operation therefore does not mean settlement or
withdrawal is complete.

## Unknown and stale outcomes

If submission may have reached the RPC, do not resend solely because the client timed out. Search
known hash/receipt evidence. With no hash, copy a candidate from wallet activity and run the same
read-only intent check. An unrelated candidate is rejected without changing the original entry. If
the receipt succeeded but the API remains `LISTED`, inspect the selector observation, checkpoint,
requested-height block hash, and deployment identity; do not pay again.

Code: `apps/web/src/integrations/evm/use-escrow-gateway.ts`,
`chain/src/MotorCoveEscrow.sol`, `apps/indexer/src/domain/projectors/sale-projector.ts`.
Verification is recorded separately in [evidence](../evidence/verification.json).
