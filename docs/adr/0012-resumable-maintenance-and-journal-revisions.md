# ADR 0012: Resumable maintenance and journal revisions

- Status: accepted
- Date: 2026-09-22

## Context

Projection maintenance and browser transaction submission both cross durable boundaries. A reindex
may stop after recording its target, and a browser may wait for another tab before it can persist an
intent or returned hash. Recomputing a reindex target on resume, deleting source evidence without an
archive, or treating wall-clock time as a write version makes the durable record disagree with the
operation that actually ran.

## Decision

1. A new reindex captures the eligible target block and hash once. A resumed reindex reads that
   target from its matching maintenance marker, verifies the same block and hash twice, and keeps the
   original target even when the chain head has advanced. A changed target anchor fails closed.
2. Maintenance locks enter their cleanup scope immediately after acquisition. Marker parsing,
   identity checks, recovery resolution, schema verification, database opening, and the operation
   callback all release the same locks on failure.
3. A source-refreshing reindex creates and verifies a normal environment backup before deleting
   active headers or events. The verified backup ID is written into the maintenance marker first.
   Resume verifies that same backup. Failure to create or verify it leaves active source evidence
   untouched.
4. Each browser journal entry carries a per-operation revision. A write compares its expected
   revision and advances it inside the existing deployment Web Lock. A mismatch returns
   `JOURNAL_REVISION_CONFLICT`; `updatedAt` remains display evidence and never decides write order.
   If a wallet-returned hash races a newer hashless recovery revision for the same immutable intent,
   submission merges the hash into that latest revision. A different intent or hash remains a
   conflict and falls back to explicit non-durable handling.
5. Submission rechecks the complete live operation context after the awaited `AWAITING_WALLET`
   write and immediately before invoking the wallet.

## Consequences

- Operators can rerun the documented reindex command with the original `--from` value after an
  interruption without chasing a moving head.
- Source-refresh backups retain canonical and displaced raw evidence for diagnosis, but they do not
  turn a local backup into public archive-RPC availability.
- Stale browser work cannot report a durable update that was silently discarded. Callers must carry
  forward the entry returned by `save()` so the next write uses the persisted revision.
- A volatile overlay does not remove its earlier durable intent when another operation writes the
  shared deployment journal.
- The Web Locks boundary coordinates tabs in one browser profile. It does not coordinate devices,
  and volatile hashes still do not survive a real document reload.

## Verification

Unit and integration tests cover fixed-target resume, changed-anchor refusal, malformed and
mismatched marker cleanup, pre-refresh backup preservation, post-persistence context invalidation,
wall-clock rollback, revision conflict handling, and transaction recovery. A real Chromium
multi-tab test covers concurrent writers, stale revision rejection, and writer-tab handoff.
