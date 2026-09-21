# ADR 0007: Serialize recovery evidence and classify runtime chain failures

- **Status:** accepted and implemented within the local runtime
- **Scope:** projection maintenance, Indexer polling, and browser transaction verification

## Context

Projection reindexing reuses durable blocks and events, browser verification can overlap with nonce
enrichment or another verification request, and JSON-RPC errors do not all mean the same thing. In
each case, treating an old or unavailable observation as current truth can erase newer evidence or
send an operator to the wrong recovery procedure.

## Decision

Rebuild and reindex run under the exclusive maintenance gate. They persist `PREPARED` and `ACTIVE`
markers before changing projection state, retain a `FAILED` marker on error, and clear the marker
only after success. Reindex can recanonicalize an existing block and reapply its already stored
events to the fresh projection. Every new batch verifies that its first parent hash joins the
durable checkpoint before commit.

Browser verification assigns each request a generation ID and reloads the latest journal entry
before saving. A result can update the journal only while its generation remains current. Optional
nonce enrichment merges only the nonce into the latest entry. The UI derives current projection
success from transaction status, receipt status, and projection observation together; historical
receipt evidence can remain after a reorg without being presented as current success.

The Indexer classifies transport timeouts and connection failures as temporary unavailability. It
keeps the checkpoint, marks projection freshness `STALE`, retries with bounded exponential backoff,
and lets API and Web processes continue. A changed checkpoint hash, a provider-confirmed missing
checkpoint block, or another integrity mismatch remains `RECOVERY_REQUIRED` and stops ingestion.
Shutdown stops scheduling polls, waits for the active poll, then closes the database writer.

### Operation-specific completion

An interrupted projection marker carries its deployment and recovery identity. Generic recovery does
not treat schema integrity as proof that rewind, rebuild, and catch-up completed. It returns
action-required and leaves the gate closed. Rerunning the exact operation may resume the marker under
the same lock; changed parameters are rejected.

Current projection success is bound to transaction hash, block hash, log index, deployment, and
projection build. If a returned transaction hash cannot be persisted, the hash and operation context
remain visible in a tab-local journal overlay with an explicit reload limitation. This overlay is not
durable or cross-device recovery.

## Trade-offs

- Browser generation checks coordinate saved journal evidence but do not provide a cross-device
  distributed transaction.
- A provider that incorrectly reports a historical block as missing can still require operator
  recovery; a timeout or connection error does not.
- Maintenance remains an explicit downtime operation on one trusted host.
- Backoff keeps stale reads available while delaying subsequent retry attempts by at most eight
  seconds.

## Consequences

Current validity and historical evidence remain separate. Projection maintenance cannot expose an
intermediate build to a normal reader or writer. The local process supervisor does not terminate
API and Web merely because the Indexer exits, and a graceful Indexer stop does not close SQLite
under an active poll.

## Code and tests

- `packages/database/src/maintenance/projection-operation.ts`
- `apps/indexer/src/application/ingest-range.ts` and `run-indexer.ts`
- `apps/web/src/capabilities/transactions/recovery.ts` and `submit-operation.ts`
- `tests/database/projection-maintenance.test.ts`
- `tests/integration/reindex-canonical.test.ts`
- focused Indexer and transaction capability tests beside their source
