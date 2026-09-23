# ADR 0024: Durable attempt ownership and escrow admission

- Status: Accepted
- Date: 2026-09-22

## Context

Cross-tab submission ownership originally ended after the wallet returned a transaction hash. A
second activation could then create another operation and wallet request while the first transaction
was still pending and the latest chain state still satisfied simulation.

The escrow receiver hook rejected unsolicited safe ERC-721 transfers, but ordinary `transferFrom`
does not invoke that hook. A direct unsafe transfer could therefore move a `VehicleNFT` into the
escrow without creating a Sale or custody mapping, leaving the token outside the recovery interface.

## Decision

The submission capability treats selected journal states as durable ownership of the complete
immutable intent. It checks that journal state inside the existing submission coordinator before it
creates another operation. Pending, unknown, included-success, and orphaned attempts remain owners;
proved pre-submit failures and rejections release the intent. Explicit retries remain separate rows
linked through `retryOf` after a proved outcome.

`VehicleNFT` receives a one-time escrow binding during bootstrap. Its ERC-721 update path rejects a
transfer into that address unless the bound escrow is the authorized operator. Bootstrap journals
the binding transaction before minting or listing. The escrow receiver hook remains defense in
depth for the expected `createSale` receipt.

## Consequences

- A returned hash no longer permits a sequential same-intent wallet request while observation is
  unresolved, including after reload.
- Different immutable intents remain independent, and a wallet rejection before submission permits
  a fresh attempt.
- Direct safe and unsafe deposits into the bound escrow revert before custody can become untracked.
- Existing non-upgradeable deployments do not gain the binding. They require an explicit local reset
  and fresh bootstrap; tooling never replaces them implicitly.
- The seed journal gains `bind-vehicle-nft-escrow`, and the generated VehicleNFT ABI exposes
  `setEscrow` and `motorCoveEscrow`.

## Verification

- `TX-008` covers sequential submission, reload recovery, rejection, distinct intents, and explicit
  retry behavior.
- `SALE-006` covers direct `transferFrom` and `safeTransferFrom` rejection, legitimate listing,
  immutable binding, the escrow-custody invariant, and fresh-Anvil bootstrap binding.
