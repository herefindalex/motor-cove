# ADR 0015: Projection recovery transitions and predeployment evidence

- **Status:** accepted
- **Date:** 2026-09-22

## Context

A rebuild correctly rejected an incomplete local source journal, but its durable
`REBUILD_PROJECTION` marker then prevented the documented reindex recovery command from acquiring
the operation. The browser recovery core accepted an alternative transaction hash, while the UI
only exposed that input when no hash existed. Migration backup also required a deployment sidecar
for every older initialized schema, including a valid database that had never registered a chain
deployment.

## Decision

1. Projection maintenance permits one explicit operation transition: a failed rebuild whose saved
   error starts with `REBUILD_SOURCE_INCOMPLETE` may become a reindex only when the caller opts in,
   deployment/environment/database/schema identity matches, and the reindex starts at the required
   deployment scan-start block with a captured target block and hash. The transition happens while
   the exclusive gate remains held. The new marker receives a new operation ID and records the old
   operation ID, type, and error.
2. When a saved transaction hash exists but verification is unavailable, the recovery UI exposes an
   optional alternative hash. The existing read-only verifier still checks saved chain, deployment,
   account, target, calldata, value, and action-specific evidence. It preserves the original hash
   and does not gain a wallet-write port.
3. Backup manifests explicitly classify their source as `DEPLOYED` or `PREDEPLOYMENT`. A
   predeployment snapshot is valid only when the database has zero deployment rows and deployment,
   bootstrap receipt, and seed journal sidecars are all absent. A deployed source still requires a
   matching deployment sidecar. Predeployment backups preserve migration data but are not accepted
   by the deployment-bound restore command.

## Consequences

- Operators can follow rebuild source failure with the documented full reindex without deleting a
  marker or opening a gap in maintenance ownership.
- A candidate hash can recover a replacement or lost-provider observation while retaining the
  original transaction history and uncertainty.
- Schema migration can protect an initialized predeployment database without fabricating chain
  identity. Sidecar disagreement remains fail closed.
- The existing timeline-scoped Playwright locator remains the proof for duplicate hash presentation;
  the alert and timeline may both display the same hash.

## Verification

- `tests/database/projection-maintenance.test.ts` verifies unauthorized and wrong-start transitions
  fail, while the explicit full reindex records lineage and succeeds.
- `apps/web/src/integrations/evm/TransactionObserver.test.tsx` verifies an existing unavailable hash
  can submit an alternative to read-only recovery.
- `tests/migrations/migrations.test.ts` performs a real `0000` to `0001` predeployment backup and
  upgrade, checks the manifest classification, preserves catalog data, and retains zero deployment
  rows.
- `tests/e2e/marketplace.spec.ts` scopes the non-durable hash assertion to the named Transaction
  timeline while the notice also displays the hash.
