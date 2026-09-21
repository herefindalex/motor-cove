# ADR 0005: Read-only transaction recovery and snapshot convergence

- **Status:** accepted
- **Scope:** `SALE-002`, browser journal recovery, funding observation, Indexer commit faults

## Context

A wallet hash, a successful receipt, an indexed event, and a projected Sale become visible at
different times. A reload during any gap must recover by reading evidence without repeating a
payment. Comparing only checkpoint height or combining rows from different SQLite moments can also
produce a false completion result.

## Decision

Persist the immutable funding intent and wallet-request boundary before invoking the wallet. Keep
submission in a dedicated application function. Recovery has only chain-read, API-read, and journal
ports; architecture checks reject a wallet-write dependency.

Extend the existing sale GET route with an all-or-none event selector. The database reader returns
coverage, requested-height canonical header, event lookup, projection effect, freshness, and
provenance from one read transaction. A consistent funding effect accepts `FUNDED`, `COMPLETED`, or
`EXPIRED` and does not require a payment claim.

Keep the existing Indexer transaction boundary. A test-only synchronous fault hook provides exact
pre-BEGIN, pre-COMMIT, and post-COMMIT process barriers for child-process `SIGKILL` tests.

Assign each asynchronous verification a generation ID and merge its result into the latest saved
journal entry only while that generation remains current. Nonce enrichment also reloads the latest
entry and changes only the nonce. Define current projection success with one selector that requires
included success, a successful receipt, and a reflected projection together.

## Consequences

- Reload, polling, candidate-hash verification, and projection retry cannot submit transactions.
- A missing hash remains actionable `UNKNOWN`; the UI never describes another payment as safe.
- Successful chain execution and projection convergence remain separate user-visible facts.
- Same-nonce replacements are classified as repricing, cancellation, or a different call before any
  replacement receipt can satisfy the original intent.
- Orphaned receipt evidence remains visible as `NONCANONICAL`; same-hash reinclusion must establish a
  new canonical receipt and event identity.
- A slow verification or nonce lookup cannot replace newer receipt or projection evidence.
- Selector requests cannot mutate Indexer health or database state.
- WAL process-kill evidence is recorded separately from graceful rollback and hardware power loss.

See [transaction lifecycle](../protocol/transaction-lifecycle.md),
[listing and funding](../flows/listing-and-funding.md), and
[testing strategy](../testing/strategy.md).
