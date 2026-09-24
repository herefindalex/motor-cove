# ADR 0028: Public-chain finality, provider trust, and marketplace scope

- Status: Accepted
- Date: 2026-09-23

## Context

MotorCove began as a local engineering research project on loopback Anvil. Earlier decisions made
transaction uncertainty, deployment identity, raw chain evidence, projection recovery, browser
journal durability, and escrow custody explicit. The project now has enough evidence to define how
those boundaries should evolve if the same architecture is exercised against public EVM networks.

A comparative review of Seaport, LooksRare, Ponder, Graph Node, Subsquid, go-ethereum, and other
open-source Web3 systems highlighted two different classes of complexity.

Generalized marketplace protocols such as Seaport and LooksRare need signatures, counters, nonces,
cancellation, balance and approval revalidation, and partial-fill state because an order may remain
off-chain while the maker retains custody. MotorCove does not currently have that problem: creating
a sale transfers the NFT into `MotorCoveEscrow`.

Indexer systems expose a different set of risks. A canonical block near the head is not necessarily
final, the same confirmation count means different amounts of time on different chains, RPC
providers have different historical and finality capabilities, a live connection can stop making
progress, and an internally consistent local index can still be incomplete. Those concerns apply
directly to MotorCove if it moves beyond local Anvil.

The project therefore needs explicit decisions about finality, supported networks, provider trust,
funding authorization, ingestion transport, and listing custody before adding public-chain
complexity.

## Decision

### 1. Projection is finalized-only

MotorCove will not project speculative public-chain head state.

For public-chain profiles, a block becomes eligible for the application projection only after it
satisfies the profile's finality policy. Receipt inclusion and chain finality remain separate
claims. An included transaction may be visible to the browser before its effects are eligible for
the finalized application projection.

Anvil is an explicit exception for local development and test use: its profile may treat the latest
local block as immediately final.

MotorCove will not introduce hot-block undo logs or reversible speculative projection state as part
of this decision. A contradiction to a previously accepted finalized anchor is an integrity event
and must fail closed into recovery.

### 2. Supported chain profiles are Anvil, Ethereum, and Polygon

MotorCove will define three explicit chain profiles:

- Anvil, chain ID 31337, for loopback development and tests.
- Ethereum, chain ID 1.
- Polygon, chain ID 137.

This is not a claim of arbitrary EVM-chain support.

Ethereum and Polygon profiles require a provider capable of supplying the finalized-chain evidence
required by the profile. MotorCove will not silently guess a confirmation depth when that capability
is unavailable. Unsupported chain IDs fail closed.

Chain-specific policy belongs in a `ChainProfile`-style contract rather than scattered conditionals.

### 3. Normal runtime uses one primary provider; critical audits use a second source

MotorCove will continue to use one primary RPC provider for normal runtime operation.

It will not require multi-provider quorum on every hot-path request.

Critical finalized-source verification will use a separately configured secondary source. The audit
compares retained MotorCove block/log evidence with independently fetched finalized evidence. A
secondary-source mismatch is diagnostic evidence; the audit does not automatically rewrite the
database or trigger a wallet action.

Internal consistency and independent-source agreement are separate claims.

### 4. Sales are reserved for a seller-selected buyer

MotorCove will no longer model funding as a public mempool race in which any non-seller may fund the
sale first.

A seller chooses one allowed buyer when creating a sale. The escrow contract stores that
authorization, and `fundSale` accepts payment only from that address.

The projection and API expose the reserved buyer separately from the actual funding buyer:

```text
allowedBuyer
```

means the seller-authorized buyer before funding, while:

```text
buyer
```

means the address that actually funded the on-chain sale. Once funded, those identities must agree.

This choice better matches the intended vehicle-marketplace settlement model, where commercial
agreement can precede on-chain settlement.

### 5. Indexing remains polling-based

MotorCove will keep one polling ingestion model.

This decision intentionally avoids introducing a second historical/realtime ownership boundary,
WebSocket subscription recovery, silent subscription stalls, reconnect/resubscribe behavior, and
handoff deduplication before product latency requirements justify that complexity.

If sub-poll-interval realtime behavior becomes a requirement, it requires a separate architecture
decision.

### 6. Listing remains escrow-custodial

Creating a listing continues to move the NFT into MotorCove escrow.

MotorCove will not add off-chain signed listings or seller-retained NFT listings as part of the
public-chain readiness work.

Therefore Seaport/LooksRare-style maker-order machinery is deliberately out of scope:

- EIP-712 marketplace order signatures
- maker counters and nonce trees
- cancel-all order counters
- partial fills
- transfer conduits
- arbitrary execution zones

The current `VehicleNFT` escrow binding, direct-deposit rejection, `custodySaleId` invariant,
reclaim flow, and pull-payment claims remain part of the protocol.

## Consequences

### Finality latency is accepted

A finalized-only projection is intentionally slower than projecting the chain tip.

For a high-value vehicle marketplace, this trade is preferred over maintaining reversible
speculative application state.

The browser may show that a transaction is included while the marketplace projection is still
waiting for finality. That is expected behavior, not projection failure.

### Provider capability becomes part of configuration correctness

A syntactically valid RPC URL is not sufficient.

The active chain profile determines required capabilities, including finalized-chain observation and
any historical state needed by reconciliation. Startup and operator tooling fail explicitly when a
required capability is unavailable.

### Independent verification costs more but is not on the hot path

Critical source audits require another provider or independently operated data source.

This adds operational cost, but only audit/recovery evidence needs that independence. Normal reads
and indexing remain single-provider.

### Reserved-buyer settlement is less permissionless

An arbitrary wallet can no longer race to fund a listed vehicle.

This intentionally gives up permissionless first-come funding in exchange for settlement that
matches a seller-approved commercial counterparty.

If a future product requires open public sales, that is a new protocol decision rather than a UI
toggle.

### Polling favors one correctness model over minimum latency

MotorCove accepts polling latency in exchange for one ingestion path and fewer historical/realtime
boundary conditions.

### Escrow custody avoids off-chain order invalidation complexity

Moving the NFT into escrow at listing time prevents many cases where a previously signed order
becomes unfulfillable because the seller transfers the NFT or revokes marketplace approval.

The cost is that listing requires custody transfer and cancellation requires explicit reclaim.

That trade remains intentional.

## Provider and finality model

The implementation should make finality policy explicit, conceptually:

```text
Anvil
→ immediate local finality

Ethereum
→ finalized RPC evidence required

Polygon
→ finalized RPC evidence required
```

If a configured Ethereum or Polygon provider cannot establish the required finalized state,
MotorCove does not silently fall back to the latest head.

The public projection target is derived from finalized evidence, not from a generic operator-selected
confirmation count.

A future ADR may add a carefully documented fallback policy if a supported production provider or
network makes that necessary.

## Transaction lifecycle

Receipt execution and finality are separate dimensions.

Conceptually:

```text
SUBMITTED
→ INCLUDED
→ FINALIZED
```

while execution remains:

```text
SUCCESS
or
REVERTED
```

An included receipt can still become orphaned before finality.

A finalized receipt no longer requires ordinary shallow-reorg polling. A contradiction to finalized
evidence is treated as an integrity incident.

## Source audit

MotorCove will add a read-only operator audit for finalized ranges.

The audit compares, at minimum:

- block number and hash
- parent hash
- MotorCove log scope
- scoped log count
- scoped log digest
- retained raw event identity

between local retained evidence and a separately configured secondary source.

The result is one of:

```text
MATCH
MISMATCH
UNVERIFIABLE
```

`UNVERIFIABLE` is never treated as `MATCH`.

The audit never submits a transaction, clears recovery evidence, or automatically rewrites the
projection.

## Reserved-buyer sale model

Sale creation binds:

```text
seller
tokenId
priceWei
allowedBuyer
```

and transfers custody to the escrow.

Funding requires:

```text
msg.sender == allowedBuyer
msg.value == priceWei
```

The sale's actual `buyer` is set by successful funding and must equal `allowedBuyer`.

Cancellation, completion, expiry, refund, seller reclaim, and pull-payment semantics otherwise
remain unchanged unless their existing invariants require a mechanical schema/event update.

## Safety and verification boundary

The repository's existing safety policy remains unchanged.

Automated tests and contributor verification use loopback infrastructure only. Ethereum and Polygon
profiles are architecture/configuration contracts and are tested through deterministic local or
mocked provider behavior.

This ADR does not authorize:

- mainnet deployment;
- public testnet deployment;
- public RPC use in repository verification;
- real wallet secrets or real assets.

## Alternatives considered

### Project the chain tip and roll back shallow reorgs

Rejected for now.

It would reduce latency but require reversible projections, crash-safe undo state, hot-block
journals, rollback ordering, and more complicated recovery. Current product requirements do not
justify that complexity.

### Use a fixed confirmation depth for every EVM chain

Rejected.

Block cadence and finality behavior differ materially across networks. A fixed block count is not a
portable time or safety guarantee.

### Query multiple providers for every runtime operation

Rejected.

It adds latency and complexity to the hot path. Independent evidence is most valuable for critical
audit and recovery, so MotorCove uses a secondary source there instead.

### Public first-come funding

Rejected for the current vehicle-marketplace model.

It makes funding a public mempool race. The accepted model treats the on-chain transaction as
settlement with a seller-approved buyer.

### WebSocket realtime indexing

Rejected for now.

There is no product latency requirement that justifies adding subscription liveness and
historical/realtime handoff complexity.

### Non-custodial signed listings

Rejected for now.

They would require an order protocol with signatures, replay protection, expiry, cancellation,
live balance/approval checks, and nonce/counter semantics. Escrow custody intentionally avoids that
surface.

## Revisit triggers

Revisit finalized-only projection if:

- the product requires state at or near chain tip;
- finalized latency is unacceptable;
- a clear reversible-projection design and operational budget exist.

Revisit supported networks when a concrete additional chain is required. Add a profile only after
its finality and provider semantics are documented.

Revisit single-primary-provider runtime if:

- provider divergence becomes a frequent operational problem;
- a safety-critical flow requires quorum reads.

Revisit reserved-buyer funding if:

- MotorCove intentionally adds public open listings;
- auction or competitive bidding becomes a product requirement.

Revisit polling if:

- measured product latency requires realtime head delivery.

Revisit escrow custody if:

- the product intentionally requires non-custodial listings or signed off-chain offers.

Each trigger requires a new ADR; none is an implementation-detail exception to this decision.

## Implementation compatibility contract

The Web build selects exactly one configured chain profile and RPC transport. Its Anvil demo
connectors are never registered for Ethereum or Polygon. Primary ingestion and the secondary
read-only audit both retain NFT `Transfer` and the eight MotorCove escrow lifecycle events from
the same shared selector scope. `logScopeHash` binds the scope version, chain, deployment, scan
start, source roles, addresses, and event selectors; changing that contract requires a new scope
hash. Decoder and projector compatibility remain separately gated by the projector version.

Reserved-buyer `createSale` and `SaleCreated` are a breaking protocol change. This implementation
uses `protocolVersion=0.2.0` in manifests, API configuration, browser intent identity, and release
metadata. ABI and runtime code hashes still independently bind the deployed contracts. Migration
`0003` preserves historical projector-v1 Sale rows with `allowed_buyer=NULL`; it does not invent a
buyer. An old checkpoint cannot resume projector-v2 incremental ingestion. Local demo operators
must use an explicit owned-environment reset and redeploy; any future production transition needs
a separately specified replay or migration procedure.

## Verification

The implementation that follows this ADR must include evidence for:

- explicit Anvil/Ethereum/Polygon profile selection;
- unsupported-chain rejection;
- finalized-only projection targeting;
- provider-capability failure behavior;
- included-vs-finalized transaction behavior;
- finalized-anchor contradiction entering recovery;
- secondary-source audit match, mismatch, identity mismatch, and unavailable cases;
- contract-enforced reserved buyer;
- outsider funding rejection;
- reserved-buyer projection, API, UI and E2E flow;
- preservation of escrow custody invariants;
- absence of a new WebSocket ingestion path;
- full historical regression coverage.

Final delivery requires:

```bash
pnpm verify
pnpm test:e2e
```

and must record that public-chain profiles were verified with loopback/mocked fixtures unless a
future safety decision explicitly authorizes otherwise.
