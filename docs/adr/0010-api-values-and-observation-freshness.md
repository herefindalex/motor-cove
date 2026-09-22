# ADR 0010: API values and observation freshness

## Status

Accepted.

## Context

The database persisted a reconciliation report's source scope, but the reader omitted that field
from the historical record. The sales route validated decimal syntax without enforcing the EVM
`uint256` limit. The marketplace reduced exact wei to integer milli-ether for display while keeping
the full value in the wallet request. Finally, a persisted `CURRENT` projection status remained
visually current after its worker heartbeat stopped.

These are boundary and presentation failures. The stored chain values, protocol amounts, and
projection state machine remain authoritative and do not need a new storage or recovery system.

## Decision

- Historical reconciliation data carries its own `logScopeHash`. The response envelope keeps the
  current read snapshot's provenance separately; neither scope substitutes for the other.
- Public sale IDs are canonical decimal `uint256` strings. The API rejects malformed and overflow
  values before calling the database reader. Receipt block selectors remain bounded by the
  application's safe integer storage contract.
- The trading feature formats wei with bigint quotient and remainder arithmetic. Primary sale
  prices show an exact ETH value, including sub-milli-ether amounts, and never pass through
  JavaScript `Number`.
- `projectionStatus` is explicitly the last persisted projection result. Read presentation derives
  `observationFreshness` and `observationAgeSeconds` from the worker heartbeat with an injectable
  clock. The default stale threshold is 30 seconds and API processes may set
  `MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS` for a measured local environment.
- A stale or unknown observation reports `lagBlocks: null`; it does not invent a current chain head.
  `RECOVERY_REQUIRED` remains visible and is never cleared by freshness presentation.

## Consequences

Malformed or overflowing sale IDs produce `400 INVALID_SALE_ID`; a valid missing ID still produces
`404 SALE_NOT_FOUND`, and unexpected reader failures remain internal errors.

Users see the same exact amount that a funding action receives. This changes display text only; it
does not alter contract values, parsers, seed data, or transaction requests.

Stopping the Indexer leaves the API readable while its observation eventually becomes stale. A
worker heartbeat can restore fresh presentation without rewriting projection history. The
freshness calculation is read-only and does not create recovery markers.
