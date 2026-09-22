# Implementation status

Status captured on 2026-09-22 from the current pre-commit workspace. Capability metadata and
the verification JSON are the machine-readable sources; this page is a human summary.

| Area      | Required behavior                                                                                                                                                         | Implemented                                                                                                                                                                                                                                                                                       | Current local evidence                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | ERC-721 custody, sale transitions, pull claims, refund, withdrawal, reclaim, and independently calculated liability invariants                                            | `chain/src` and generated ABI                                                                                                                                                                                                                                                                     | Stateful Foundry checks compare `totalLiability` with funded Sales plus claimable Claims, then check balance coverage; local EVM only.                                                                                                                                    |
| Frontend  | Feature/capability/adapter layers, exact bigint amount presentation, explicit injected local connector states, durable pre-submit journal, read-only transaction recovery | `apps/web` capability ports plus EVM, HTTP, Wagmi, and localStorage adapters; full deployment recheck after the awaited pre-wallet write; response provenance checks; per-operation journal revisions; Web Locks serialize journal writers; unavailable storage reads preserve tab-local evidence | All eight supported action receipt outcomes; unavailable verification can check an alternative wallet hash without replacing the saved hash or requesting a wallet write; storage denial exposes a visible reload limit. Manual MetaMask was not run.                     |
| API       | Read-only query API with validated wire schemas, uint256 request boundaries, historical report scope, observation freshness, and per-event provenance                     | Database reader plus Zod and OpenAPI contracts                                                                                                                                                                                                                                                    | Fastify/reader contracts distinguish raw canonical and orphan event rows through `canonical`, `scanComplete`, and `sourceLogScopeHash`.                                                                                                                                   |
| Indexer   | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, version gates, interpretable raw history                                                       | Pure projectors plus EVM and SQLite adapters; rebuild source preflight; fixed-target reindex resume; explicit failed-rebuild to full-reindex transition; verified pre-refresh backups; maintenance version transitions; idle transport recovery; failed latest-head reconciliation reports        | Real reorg and same-history reindex cases retain displaced evidence and update each event's current canonical status without confusing it with projection state. Head acquisition failure persists `UNVERIFIABLE / HEAD_UNKNOWN` instead of leaving only an older report. |
| Database  | One migration history, managed environments, role exports, locks and marker, seed, backup/restore                                                                         | `@motorcove/database` is the only runtime database package; reset shares bootstrap lifecycle ownership; backup distinguishes deployed and predeployment identity; restore validates deployment identity and keeps SQLite file generations together                                                | A zero-deployment old-schema database is backed up and migrated without fabricated sidecars; predeployment restore is explicitly unsupported. A killed hot-WAL restore cannot attach the old WAL to a staged backup. Hardware power loss remains unverified.              |

## Current executed gates

R12 hardening is implemented in the working source: a transient post-hash chain-seed journal fault
preserves a resumable hash without resubmission, browser storage access denial retains visible
tab-local evidence with an explicit reload limit, and reconciliation persists an
`UNVERIFIABLE / HEAD_UNKNOWN` report when its first RPC read fails. Focused evidence is recorded by
the matching test lanes; the repository-wide gate evidence is authoritative only at the revision
named in `docs/evidence/verification.json`.

- `pnpm verify`: generation, database contract, formatting, docs, architecture, type checking,
  lint, 13 Foundry tests, 252 unit/component/database tests, 49 integration tests, and all
  7 workspace builds passed.
- `pnpm test:e2e`: 6 local Playwright scenarios passed against Anvil, managed SQLite, API,
  Indexer, and Web. The marketplace lane includes non-durable hash preservation across client
  navigation and the explicit reload limit. Two scenarios cover real Chromium multi-tab journal
  coordination and writer handoff. A fresh context also observes a stopped Indexer as stale without
  relying on local transaction evidence.
- `pnpm test:migrations`: 1 file and 13 tests passed, including preserved data through the
  `0000` to `0001` migration.
- `pnpm test:recovery`: 1 file and 14 tests passed, including sidecar integrity,
  deployment-bound restore refusal, and process-killed hot-WAL generation isolation.
- The full gates cover rebuild source integrity, restore identity, all-action transaction
  observation, depth-aware reindexing, maintenance version gates, idle recovery, source
  reacquisition after migration, and journal serialization.
- Architecture validation passed for 151 source files and rejected all 10 negative fixtures,
  including relative and aliased Web-to-database targets.

See exact commands, timestamps, environments, and limitations in the
[verification records](evidence/verification.json),
[database matrix](testing/database-acceptance-matrix.md), and
[documentation matrix](testing/documentation-acceptance-matrix.md).

## Remaining product verification gaps

1. Inject real process death inside the chain broadcast-to-hash journal window. Deterministic
   state-machine tests cover known-hash resume and conservative `UNKNOWN`, but not that exact
   operating-system timing window.
2. Hardware power loss and full host-filesystem exhaustion remain unverified. Current evidence
   covers bounded SQLite page exhaustion, transactional rollback, WAL recovery, and
   harness-owned `SIGKILL`.
3. Manual MetaMask behavior, cross-device journal coordination, public-network behavior,
   branch protection, and final reviewer identities require owner-controlled external
   environments and are not local implementation claims.

Remote CI evidence is added to the machine-readable verification record after the corresponding
commit completes; this pre-commit status does not reuse a prior commit's CI result.
