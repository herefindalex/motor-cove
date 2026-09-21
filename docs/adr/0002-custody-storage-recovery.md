# ADR 0002: Escrow custody, local storage, and explicit recovery

- **Status:** accepted and implemented within the documented local limits
- **Scope:** asset custody, claims, SQLite ownership, Indexer recovery

## Context

A sale can fail after an NFT or payment enters a contract. A receiver can reject ETH or an NFT.
Event projection can stop after source evidence is stored but before a read model is current. The
database also contains catalog data that cannot be recreated from chain logs.

## Decision

Transfer the NFT into escrow only when a sale is created. Completion, cancellation, and expiry set
the settlement outcome; seller proceeds or buyer refunds use pull claims; NFT delivery or reclaim
is a separate retryable operation.

Use same-host SQLite WAL with one projection writer and maintenance exclusion. Treat catalog rows
as off-chain authority and event-derived rows as rebuildable projections. Detect checkpoint or
canonical-history mismatch and stop. Operators choose catch-up, rebuild, reindex, restore, or a new
deployment after classifying the failure. Reconciliation compares at one block/hash and never
repairs state automatically.

## Why

Pull claims and separate NFT transfer let a failed receiver retry without rolling back the recorded
sale outcome. Mixed authority keeps catalog edits safe during projection rebuild. Detect-and-stop
avoids silently choosing a canonical branch or destroying evidence during a local-chain reset.

## Trade-offs

- Settlement requires extra user transactions for withdrawal, refund, and token reclaim.
- SQLite WAL and advisory file locks are limited to one host and trusted local processes.
- Recovery requires operator classification and downtime; automatic generic reorg repair is absent.
- Reconciliation enumerates sales and minted tokens through anchored contract counters; it still
  depends on historical RPC reads at that block.

## Consequences

Sale state, claim state, token reclaim, transaction observation, and projection freshness stay
separate in UI, API, and tests. Rebuild preserves catalog data. Reset, migration, restore, rebuild,
and reindex remain distinct guarded commands.

## Code and tests

- `chain/src/MotorCoveEscrow.sol` and `chain/test`
- `packages/database/src` and `apps/indexer/src`
- `tests/integration/indexer-store.test.ts`, `tests/integration/real-stack.test.ts`, and
  `tests/recovery/backup-restore.test.ts`
- [Escrow protocol](../protocol/escrow.md), [database architecture](../architecture/database.md),
  and [indexing recovery](../flows/indexing-and-recovery.md)
