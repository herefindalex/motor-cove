# ADR 0009: Bootstrap and projection integrity gates

## Status

Accepted.

## Context

The local bootstrap journal made sequential retries conservative, but two processes could read the
same journal state before either persisted its transaction hash. API startup checked only the
deployment ID even though the database stores the immutable deployment descriptor. Reconciliation
checked payment claims only while iterating projected Sales. Projectors also treated an owned event
with a missing prerequisite entity as an unrelated event.

These gaps can publish a mixed deployment, omit an inconsistent projection row from diagnostics, or
advance a checkpoint after silently ignoring an event.

## Decision

- One nonblocking advisory lock owns the complete bootstrap callback for a managed environment. It
  is acquired before migration and held through chain receipt and database bootstrap persistence.
  Maintenance locks retain their existing narrower lifetime, so bootstrap never recursively takes
  the same exclusive maintenance lock.
- The read-only database reader exposes an immutable deployment descriptor. API startup compares it
  with the parsed manifest before constructing or listening on the server. Hexadecimal identities
  are case normalized; the stored manifest hash and semantic manifest content are both verified.
- Reconciliation enumerates every canonical Sale ID for chain claims and independently enumerates
  every projected claim row. Extra rows remain report-only mismatches.
- A projector raises a typed integrity error when an event it owns lacks its prerequisite Sale or
  Claim. The SQLite unit of work rolls back the block, source event, projection, and checkpoint,
  then records `RECOVERY_REQUIRED` outside the failed transaction.

## Consequences

Concurrent bootstrap exits with `RESOURCE_BUSY`; an operator may retry after the owner exits and the
new process will reopen the latest journal. The lock is local to one host, matching the supported
SQLite deployment model.

API startup fails closed and releases its reader when manifest and database evidence disagree. It
does not modify either source.

Reconciliation performs one claim getter read per canonical Sale at the anchored block. This is
bounded by the existing safe integer scope guard and remains a diagnostic operation.

Projection integrity failures require source or projection recovery. They never synthesize a
missing entity and never resend a chain transaction.
