# ADR 0008: Verify recovery sources and serialize browser journal writes

- **Status:** Accepted
- **Scope:** projection rebuild, database restore, transaction receipt observation, browser journal

## Context

Recovery commands can be more damaging than an ordinary failed request. A rebuild replaces derived
rows from the stored event journal, and restore replaces the active database file. Both operations
need to prove the identity and completeness of their source before changing active state.

Browser transaction recovery has a similar ownership problem. Every supported write action records
an intent before opening the wallet, but multiple tabs share one `localStorage` journal. A whole-array
read and write is not a cross-tab transaction.

## Decision

Projection ingestion records a digest that binds each raw log envelope, normalized event, and decoder
version. Rebuild verifies canonical block continuity, scan completion, checkpoint coverage, per-block
event count and digest, raw envelope digest, decoder version, and bound source-record digest before it
deletes any projection row. Missing or altered source evidence fails closed and requires reindex.

Backup format 2 records the deployment ID and the presence and SHA-256 digest of deployment,
bootstrap, and seed sidecars. Restore verifies that evidence and compares the backup deployment with
the active database and active deployment manifest before quarantine begins. Restore remains a
database operation; it does not reset a chain or replay chain seed writes.

Runtime projection stores keep strict projector and log-scope gates. Maintenance construction accepts
only named prior projector versions. A log-scope change is eligible only for a reindex from the
deployment scan start, where the old canonical source is actually removed and reacquired.

Known-hash receipt observation applies to every supported transaction action. Funding keeps its
additional `SaleFunded` event and projection-effect checks. Other actions stop at canonical receipt
success or revert and do not claim that Sale, Payment, or projection state has converged.

Browser journal writes use the Web Locks API with one lock per deployment. The application awaits the
pre-submit write before opening the wallet. A local promise queue is used only in environments without
Web Locks, such as unit tests. Newer same-operation evidence cannot be overwritten by an older write.

## Consequences

- A legacy event row without bound source evidence cannot be rebuilt; the operator must reindex it.
- A backup with missing, altered, or deployment-incompatible sidecars is rejected before file switch.
- Non-funding transaction status can resume after reload without fabricating business-state success.
- Tabs in the same browser profile preserve different operations and release ownership when a writer
  tab closes. Cross-device coordination is outside the local browser journal contract.

## Code and tests

- `apps/indexer/src/adapters/sqlite/sqlite-projection-store.ts`
- `apps/indexer/src/application/reindex-target.ts`
- `packages/database/src/maintenance/backup.ts`
- `packages/database/src/maintenance/restore.ts`
- `apps/web/src/integrations/evm/inspect-transaction.ts`
- `apps/web/src/integrations/persistence/local-storage-journal.ts`
- `tests/integration/indexer-store.test.ts`
- `tests/recovery/backup-restore.test.ts`
- `tests/e2e/journal-multitab.spec.ts`
