# ADR 0025: Filesystem, transaction, and restore evidence boundaries

- Status: Accepted
- Date: 2026-09-23

## Context

Three recovery boundaries depended on evidence that could change after an earlier check.

Reset validated the owned environment before taking maintenance locks, then later used the database
and reports directories for destructive cleanup. A process could replace either child with a symlink
after the ownership check. Restore verified a backup checksum, then copied the source into staging
without proving that the staged bytes were the verified generation. Transaction recovery treated an
explicitly missing nonce-backed original hash as a generic RPC failure, so the interface did not tell
the operator that a current or replacement wallet hash was required.

## Decision

Reset revalidates `databaseDir` and `reportsDir` after taking the maintenance gates and again before
generated-state deletion. Each path must exist, be a directory, not be a symlink, and resolve inside
the real environment root. The chain callback and marker publication occur only after that post-lock
check.

Restore verifies the selected backup as before, copies its database to operation-owned staging, and
hashes the staged bytes against the manifest before quarantining the active generation. Schema and
deployment checks still apply to the same staged file.

Transaction inspection classifies an explicit not-found response as
`REPLACEMENT_HASH_REQUIRED` only when the journal has a nonce, has no recorded receipt block, and the
inspected hash is its saved current or original hash. Recovery persists that classification and asks
for a wallet activity hash. Candidate verification remains read-only and retains the immutable
intent and original hash.

## Consequences

- Post-ownership symlink replacement cannot redirect reset cleanup or reach the chain callback.
- A backup source that changes between verification and copying cannot replace the active database.
- An operator receives a precise recovery action when a wallet has replaced or dropped a known
  nonce-backed transaction.
- Generic RPC failure remains unavailable observation evidence and does not imply replacement.
- None of these decisions authorizes automatic transaction resubmission, environment reset, or
  sidecar replacement.

## Verification

- `DB-74` replaces each destructive reset child with an external symlink and proves zero chain calls,
  no marker, and preserved external bytes.
- `DB-75` changes the backup source at the copy boundary and proves checksum rejection before
  quarantine while the active database remains readable.
- `TX-009` covers chain inspection, journal persistence, and the Observer prompt for a verified
  current or replacement hash without a wallet write.
