# ADR 0018: Serialize in-flight intents and preserve source identity

- **Status:** accepted
- **Date:** 2026-09-22

## Context

An immutable transaction intent is written before the wallet request, but two UI invocations can
reach that boundary before the first simulation finishes. Durable journaling records both attempts;
it does not decide which concurrent attempt owns the right to open the wallet.

NFT ownership identity is the tuple `(deployment, collection, token)`. Reconciliation previously
reduced that identity to `token`, so an ownership row from a collection outside the deployment
manifest could satisfy or disappear behind the expected row.

Reindex distinguishes a missing source row from source evidence whose stored content contradicts
its digest or completed-block header. A missing row can be inserted during a normal rewind. Existing
conflicting content must be archived and removed before the same event identity can be reacquired.

## Decision

Transaction submission obtains synchronous, application-lifetime ownership for the complete
immutable intent before its first asynchronous step. A duplicate intent fails with
`OPERATION_ALREADY_IN_FLIGHT`; a different intent remains independent. Page-level action ownership
also disables the matching action while it is pending and releases ownership in `finally`. The
durable pre-wallet write and all hash/unknown recovery rules remain authoritative.

Reconciliation reads `collection_address` with every ownership row. Only the manifest collection
can satisfy an anchored `ownerOf` result. A row for another collection is an explicit
`UNEXPECTED_COLLECTION` mismatch, including when the expected row also exists. Rows from another
deployment remain outside the run.

Source refresh classification is evaluated when maintenance asks and again before preparation. A
non-null source record whose decoded payload, raw envelope, decoder version, record digest, or
same-count completed-block digest is inconsistent requires a verified pre-refresh backup and a full
scan-start reacquisition. A pure missing row keeps the narrower rewind and insert path. Normal
ingestion still rejects conflicting event identity; maintenance does not weaken that invariant.

## Consequences

- Rapid repeated activation of one action produces one journal intent and one wallet request.
- Pending state is scoped per sale/action instead of blocking unrelated marketplace work.
- Reconciliation reports collection identity in ownership differences and cannot return `MATCH`
  for extra ownership rows from another collection.
- Conflicting source evidence remains available in the verified backup before active source rows are
  reacquired from chain.
- Missing source rows do not require a destructive source refresh when ordinary reindex can insert
  them safely.

## Verification boundary

Unit and component regressions use a controlled pending simulation and real React DOM. SQLite/CLI
tests cover ownership tuples and source classification. Harness-owned Anvil tests cover real
reconciliation and the verified source archive/reacquisition path. These checks do not establish
manual wallet extension behavior or public archive-RPC availability.
