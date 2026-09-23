# ADR 0022: Bootstrap snapshot boundaries and reconciliation publication freshness

- **Status:** accepted
- **Date:** 2026-09-22

## Context

Bootstrap owns chain deployment, seed transactions, database registration, catalog data, projection
catch-up, and its completion receipt. Its exclusive lifecycle lock was separate from the service and
writer locks used by backup and restore. A standard backup could therefore copy a deployed database
after registration but before bootstrap completed. Restoring that older database later left the
newer seed journal and bootstrap receipt in place, publishing a mixed generation.

Reconciliation compares projection and chain state at one checkpoint block and hash. It sampled the
latest head before that potentially long comparison and reused the sample when publishing
freshness. A head that advanced during the comparison could therefore be reported as `CURRENT`.

## Decision

1. Standard backup acquires shared bootstrap ownership before maintenance locks. Restore acquires
   exclusive bootstrap ownership before maintenance locks. Active bootstrap, restore, and standard
   snapshot work cannot overlap in one managed environment.
2. Migration safety backup may explicitly reuse bootstrap ownership already held by the production
   bootstrap caller. This avoids reacquiring the non-reentrant lifecycle lock while preserving the
   same ownership boundary.
3. A deployed standard backup must contain both the seed journal and bootstrap receipt or neither.
   An incomplete pair is rejected during creation and verification.
4. Restore compares the active deployment, seed journal, and bootstrap receipt bytes with the
   verified backup before quarantine. Database-only restore does not combine an older snapshot with
   a newer bootstrap generation.
5. Reconciliation reads the latest head again after anchored comparison. The publication sample
   determines `CURRENT` or `PROJECTION_LAGGING`. If that sample is unavailable, the persisted attempt
   is `UNVERIFIABLE / HEAD_UNKNOWN` with the actual transport cause.

## Consequences

- A partial bootstrap database is not published as a restorable standard backup.
- Restore fails before quarantine when bootstrap sidecars changed after the snapshot.
- An anchored match remains valid at its checkpoint while publication freshness reflects a later
  head. The report never invents lag when the latest head cannot be observed.
- Locking remains local advisory `flock`; no distributed ownership claim is introduced.

## Verification

- Backup/restore tests hold real bootstrap locks, exercise real better-sqlite3 snapshots, reject
  incomplete and legacy sidecar pairs, reject changed active sidecars before quarantine, and prove a
  migration safety backup works under caller-held bootstrap ownership.
- Reconciliation integration tests execute the production CLI with real in-memory SQLite and a
  controlled chain client. They cover a head advancing during comparison and a failed publication
  head read, in addition to the existing first-read failure case.
