# MotorCove documentation

This index gives a 5-minute route into the repository and a 30-minute route to implementation and
evidence. Internal Chinese handoff specifications under `internal/` define requirements; public
pages describe the inspected implementation and recorded verification separately.

## Understand the project

1. [Project scope](project-scope.md) defines the business slice, engineering scope, non-goals,
   limits, and open implementation gaps.
2. [Technology choices](technology-choices.md) explains what each tool owns, why it was selected,
   and what its presence does not prove.
3. [Architecture overview](architecture/overview.md) separates runtime flows from code dependencies.
4. [Engineering capability map](engineering-capability-map.md) connects claims to code, scenarios,
   executed evidence, and limits.

## Trace a transaction

1. [Wallet and network](flows/wallet-and-network.md) follows injected-wallet connection and failure.
2. [Listing and funding](flows/listing-and-funding.md) traces approval, escrow listing, and funding.
3. [Transaction lifecycle](protocol/transaction-lifecycle.md) keeps transaction, sale, claim, and
   projection state separate.
4. [Backend and Indexer](architecture/backend-indexer.md) follows logs through ordered projection.
5. [Data authority](architecture/data-authority.md) identifies the authority behind each result.
6. [Settlement and claims](flows/settlement-and-claims.md) covers complete/withdraw,
   cancel/reclaim, and expire/refund/reclaim.

## Run and inspect

1. [Local development](runbooks/local-development.md) starts a fresh owned environment.
2. [Demo walkthrough](demo/walkthrough.md) provides transaction, failure/recovery, and team paths.
   A [Traditional Chinese walkthrough](demo/walkthrough.zh-TW.md) covers the same executable steps.
3. [Testing strategy](testing/strategy.md) maps engineering questions to test layers and evidence.
4. [Scenario catalog](testing/scenario-catalog.md) and
   [acceptance evidence](demo/acceptance-evidence.md) show what has actually run.
5. [Command reference](reference/commands.md) lists effects and prerequisites from root scripts.

Operational runbooks:

- [Database migrations](runbooks/database-migrations.md)
- [Seed and bootstrap](runbooks/seeding-and-bootstrap.md)
- [Indexer recovery](runbooks/indexer-recovery.md)
- [Projection rebuild and reindex](runbooks/projection-rebuild-and-reindex.md)
- [Reconciliation](runbooks/reconciliation.md)
- [Backup, restore, and maintenance recovery](runbooks/backup-restore-and-recovery.md)
- [Local reset](runbooks/local-reset.md)
- [Database changes and reset boundaries](runbooks/reset-and-migrations.md)

## Contribute safely

1. [Contributor guide](../CONTRIBUTING.md)
2. [Role onboarding](onboarding/README.md)
3. [Change recipes](onboarding/change-recipes.md)
4. [Ownership and contracts](collaboration/ownership-and-contracts.md)
5. [Parallel development](collaboration/parallel-development.md)
6. [Delivery workflow](collaboration/delivery-workflow.md)
7. [Change and release](collaboration/change-and-release.md)
8. [Dependency rules](architecture/dependency-rules.md)

Architecture decisions are recorded in [system boundaries](adr/0001-system-boundaries.md),
[custody, storage, and recovery](adr/0002-custody-storage-recovery.md), and
[compatibility, tools, and secrets](adr/0003-compatibility-and-tools.md). Bootstrap retry semantics are
recorded in [chain seed ambiguity](adr/0004-chain-seed-ambiguity.md). Funding observation and
read-only reload behavior are recorded in
[transaction convergence](adr/0005-transaction-convergence.md). Browser review without an extension
is bounded by the [local demo wallet decision](adr/0006-local-demo-wallet-boundary.md).
Concurrent maintenance, browser evidence, and RPC failure semantics are recorded in
[recovery evidence](adr/0007-concurrent-recovery-evidence.md). Rebuild-source, restore-identity,
action-wide receipt, and cross-tab journal decisions are recorded in
[recovery source and browser journal integrity](adr/0008-recovery-source-and-browser-journal-integrity.md).
Bootstrap ownership, deployment descriptor checks, complete claim reconciliation, and projector
prerequisites are recorded in
[bootstrap and projection integrity gates](adr/0009-bootstrap-and-projection-integrity-gates.md).

Historical reconciliation scope, exact value boundaries, and worker observation freshness are
recorded in [API values and observation freshness](adr/0010-api-values-and-observation-freshness.md).
Live deployment rechecks, volatile navigation, maintenance preconditions, lock cleanup, raw event
validity, resolved dependency boundaries, and independent liability evidence are recorded in
[runtime identity and diagnostic evidence](adr/0011-runtime-identity-and-diagnostic-evidence.md).
Fixed-target maintenance resume, verified source archives, final pre-wallet context checks, and
per-operation journal revisions are recorded in
[resumable maintenance and journal revisions](adr/0012-resumable-maintenance-and-journal-revisions.md).
Restore file generations, reset/bootstrap lifecycle ownership, and HTTP query deployment checks are
recorded in [restore lifecycle and query identity](adr/0013-restore-lifecycle-and-query-identity.md).

Migration continuation, metadata finalization, bounded HTTP verification, and symmetric local
receipt observation are recorded in
[migration resume and observation deadlines](adr/0014-migration-resume-and-observation-deadlines.md).
Failed-rebuild transition rules, alternative transaction candidates, and predeployment backup
identity are recorded in
[projection transition and predeployment evidence](adr/0015-projection-transition-and-predeployment-evidence.md).

## Evaluate current evidence

- [Implementation status](implementation-status.md) and [implementation plan](implementation-plan.md)
- [Documentation acceptance matrix](testing/documentation-acceptance-matrix.md)
- [Database acceptance matrix](testing/database-acceptance-matrix.md)
- [Machine-readable verification records](evidence/verification.json)
- [Measured toolchain](toolchain.md)

## Reference

- [Frontend architecture](architecture/frontend.md)
- [Database architecture](architecture/database.md) and
  [database ownership/dependencies](architecture/database-ownership-and-dependencies.md)
- [Escrow protocol](protocol/escrow.md)
- [Indexing and recovery flow](flows/indexing-and-recovery.md)
- [API](reference/api.md), [protocol artifacts](reference/protocol-artifacts.md), and
  [database schema](reference/database-schema.md)

No page in this index turns a requirement into an implementation or a test pass without evidence.
