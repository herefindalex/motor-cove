# Parallel development

This page explains which artifacts let work proceed independently and which gates remain hard
dependencies.

Frontend, API, Indexer, Database, and Protocol can develop against reviewed ABI, Zod/OpenAPI,
deployment manifest, package exports, Drizzle schema contract, and explicit test fixtures. Apps must
not source-import another app to unblock work.

An ABI fixture can unblock UI state and decoder unit tests before deployment. A reader interface can
unblock API presenters before Indexer integration. These mocks do not satisfy real deployment,
atomic ingestion, or browser E2E gates.

Contract and schema changes land with generated artifacts, provider tests, consumer compatibility
tests, migration/rebuild impact, recovery path, and updated evidence metadata. Feature branches use
the repository naming policy and do not commit local DBs, manifests, backups, traces, or secrets.

Database provider changes are complete only when API and Indexer consumer contract tests pass in the
same worktree. Source-only provider tests may proceed in parallel, but they do not satisfy that
consumer gate.
