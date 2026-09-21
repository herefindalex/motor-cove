# Protocol artifact reference

This page points to generated and human-readable contract interfaces without duplicating the ABI.

| Artifact            | Canonical source                            | Generated consumer surface                                    |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Vehicle NFT         | `chain/src/VehicleNFT.sol`                  | `packages/chain-artifacts/src/generated/vehicle-nft.ts`       |
| Escrow interface    | `chain/src/interfaces/IMotorCoveEscrow.sol` | `packages/chain-artifacts/src/generated/motor-cove-escrow.ts` |
| Escrow behavior     | `chain/src/MotorCoveEscrow.sol`             | ABI arrays exported by `@motorcove/chain-artifacts`           |
| Deployment identity | On-chain `deploymentId()` and code          | `packages/chain-artifacts/src/manifest.ts`                    |

## Public operations

`createSale`, `fundSale`, `completeSale`, `cancelSale`, `expireSale`, `withdrawPayment`, and
`reclaimToken` are the write operations. `getSale` and `getPaymentClaim` provide direct chain reads.
Vehicle minting is development-owner-only and belongs to local setup, not a public marketplace API.

## Event contract

The Indexer consumes ERC-721 `Transfer` plus escrow sale, claim, withdrawal, and reclaim events.
ABI compatibility alone does not establish unchanged behavior. A provider change requires contract
tests, regenerated artifacts, decoder/projector review, consumer tests, and deployment compatibility.

Run `pnpm generate:check` to compare deterministic ABI/OpenAPI artifacts with source. The current
Drizzle migration generator is a separate project command.

See [escrow semantics](../protocol/escrow.md) and [delivery workflow](../collaboration/delivery-workflow.md).
