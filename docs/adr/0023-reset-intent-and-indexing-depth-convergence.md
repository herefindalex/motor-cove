# ADR 0023: Reset intent and indexing-depth convergence

- **Status:** accepted
- **Date:** 2026-09-22

## Context

The local reset command called `anvil_reset` before publishing its durable maintenance marker. A
process death in that interval left a new chain generation beside the old database and deployment
sidecars with no recovery evidence. If local deletion failed after the marker appeared, generic
database recovery could also clear the reset marker after validating the old database alone.

Indexer eligibility is `head - indexingDepth`. A database indexed with depth zero may therefore have
a checkpoint above the eligible target after an operator increases the depth. The normal idle path
previously marked that projection `CURRENT` without retracting the newly held-back blocks.

## Decision

1. Reset publishes `RESET / PREPARED` before invoking the chain-reset callback. After the callback
   succeeds, it publishes `CHAIN_RESET`, clears generated local state, publishes
   `LOCAL_STATE_CLEARED`, and only then clears the marker.
2. A failed marker retains `resetPhase`. Recovery never treats a valid old database as reset
   completion evidence. `PREPARED` is action-required because the chain result is unknown;
   `CHAIN_RESET` may finish idempotent local cleanup under bootstrap and maintenance ownership.
3. If a durable checkpoint exceeds the currently eligible indexing target, normal ingestion marks
   recovery required and stops. Operators use the existing explicit reindex workflow to converge to
   the stricter target. The runtime does not silently rewind projections.
4. Decreasing indexing depth remains ordinary forward catch-up. An unchanged depth at its eligible
   checkpoint remains an idle healthy poll.

## Consequences

- A process death after the chain side effect always leaves a reset marker for diagnosis.
- Reset recovery is phase-specific and cannot bless an old generation through schema verification.
- Increasing finality holdback is fail-closed until explicit reindex completes.
- The depth rule does not add a second indexer or maintenance mechanism.

## Verification

- A real child process records a controlled chain-generation side effect, pauses inside the reset
  callback, receives `SIGKILL`, and leaves `PREPARED` plus the old local generation. Recovery reports
  action required.
- Real advisory-lock and filesystem tests cover marker-before-RPC ordering, cleanup failure after
  `CHAIN_RESET`, idempotent recovery, preserved backups and lock inodes, and the managed Anvil reset
  path.
- Application tests cover increased depth, decreased depth, no eligible block, and unchanged-depth
  idle health.
