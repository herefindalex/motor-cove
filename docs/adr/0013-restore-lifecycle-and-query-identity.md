# ADR 0013: Restore file sets, lifecycle ownership, and query identity

- **Status:** accepted
- **Date:** 2026-09-22

## Context

Three boundaries used related identifiers without enforcing the same lifetime. Restore moved the
SQLite main file and WAL/SHM sidecars one at a time, so recovery could install a staged snapshot
beside a sidecar left by the previous active database. Bootstrap used an outer ownership lock while
reset used only the service and writer gates. Web query keys contained a deployment ID, but a parsed
HTTP response could still carry provenance from another deployment.

## Decision

1. Restore recovery treats the main file, WAL, and SHM as one generation. Before installing a staged
   standalone snapshot, recovery moves any remaining active sidecars into that operation's
   quarantine. Rolling back from quarantine reunites its main file and sidecars. Duplicate active and
   quarantined sidecars are ambiguous and remain recovery-required.
2. Reset acquires the same outer bootstrap ownership before the maintenance service and writer locks.
   It must own both before `anvil_reset` or filesystem mutation. The fixed order is lifecycle
   ownership, service gate, then writer gate.
3. Web snapshot requests capture the expected deployment in their query function. The HTTP adapter
   parses the wire contract and then compares response provenance with that expected deployment.
   Mismatched data is rejected rather than cached or relabeled. Config polling can then supply the
   replacement deployment context; polling is not treated as identity validation.

## Consequences

- A staged backup cannot replay a hot WAL left by the database it replaces.
- Reset cannot race a bootstrap transaction or its durable chain-seed journal.
- A query key remains a cache namespace; the response provenance is an independent runtime check.
- SQLite crash tests use harness-owned temporary databases and a killed child writer. They do not
  claim hardware power-loss behavior.

## Verification

- `tests/recovery/backup-restore.test.ts` creates a committed hot WAL in a child process, kills that
  process, reproduces the main-file-only switch, and verifies recovery returns the backup value.
- `tests/database/reset-cli.test.ts` holds the real bootstrap `flock`, proves `anvil_reset` is not
  called, releases ownership, and proves reset can then complete.
- `apps/web/src/integrations/http/motorcove-api.test.ts` checks Sale, Vehicle, and System snapshots
  reject a different deployment, do not populate the wrong TanStack Query cache entry, recover under
  the replacement deployment key, and accept equivalent hex case.
