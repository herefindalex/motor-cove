# ADR 0017: Recoverable evidence and unavailable observations

- **Status:** accepted
- **Date:** 2026-09-22

## Context

A chain seed can receive a transaction hash before its first `SUBMITTED` journal write completes. A
browser can also retain tab-local transaction evidence while policy temporarily prevents access to
`localStorage`. In both cases the known evidence still exists, but a storage failure must not be
misclassified as proof that no transaction was submitted.

Reconciliation has the same evidence boundary. Once the database and checkpoint are readable, an
unavailable latest-head RPC is itself a result of the attempted check. Leaving only an older stored
report hides the new failed observation.

## Decision

Chain seed separates submission failure from post-hash persistence failure. After a transient first
write failure, it retries only the journal write, persists the original hash as `SUBMITTED`, and
returns a stable recoverable error. A later invocation verifies that hash through the existing
receipt path and never calls the submit callback again. Hashless ambiguity and changed receipt
identity remain fail-closed.

The browser journal catches storage access failures inside the adapter, records
`STORAGE_UNAVAILABLE`, and merges any application-lifetime volatile entries into the readable
snapshot. Transaction UI states that these entries may be tab-only and will not survive reload.
Pre-wallet durable intent failure still prevents the wallet request.

Reconciliation includes latest-head acquisition in the report lifecycle. If that read fails after a
checkpoint is available, it persists `UNVERIFIABLE` with `HEAD_UNKNOWN`, records the cause, and exits
nonzero. It does not reuse an older head or older report as evidence for the current run.

## Consequences

- A one-time post-hash journal fault can be resumed read-only without a duplicate seed transaction.
- Seed failure categories distinguish submission ambiguity, persistence recovery, stranded
  preparation, and changed receipt evidence.
- Tab-local transaction hashes remain visible while durable browser storage cannot be read.
- Storage recovery does not invent durability; a real reload still loses volatile-only evidence.
- Operators and API consumers can see that a reconciliation attempt failed before head acquisition.
- These changes do not add a second journal, storage backend, reconciliation table, or recovery
  framework.
