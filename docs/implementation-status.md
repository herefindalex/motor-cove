# Implementation status

Status captured on 2026-09-22 from the current pre-commit workspace. Capability metadata and
the verification JSON are the machine-readable sources; this page is a human summary.

| Area      | Required behavior                                                                                                                                                                 | Implemented                                                                                                                                                                          | Current local evidence                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts | ERC-721 custody, sale transitions, pull claims, refund, withdrawal, reclaim, and independently calculated liability invariants                                                    | `chain/src` and generated ABI                                                                                                                                                        | Stateful Foundry checks compare `totalLiability` with funded Sales plus claimable Claims, then check balance coverage; local EVM only.                                                                 |
| Frontend  | Feature/capability/adapter layers, exact bigint amount presentation, explicit injected and local connector states, durable pre-submit journal, and read-only transaction recovery | `apps/web` capability ports plus EVM, HTTP, Wagmi, and localStorage adapters; full deployment recheck; Web Locks serialize journal writers; client routing preserves the tab overlay | All eight supported actions have receipt outcomes; pending deployment replacement stops before the wallet; volatile hash navigation and real reload limits are exercised. Manual MetaMask was not run. |
| API       | Read-only query API with validated wire schemas, uint256 request boundaries, historical report scope, observation freshness, and per-event provenance                             | Database reader plus Zod and OpenAPI contracts                                                                                                                                       | Fastify/reader contracts distinguish raw canonical and orphan event rows through `canonical`, `scanComplete`, and `sourceLogScopeHash`.                                                                |
| Indexer   | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, version gates, and interpretable raw history                                                           | Pure projectors plus EVM and SQLite adapters; rebuild source preflight; eligible-depth reindex targets; explicit maintenance version transitions; idle transport recovery            | Real reorg and same-history reindex cases retain displaced evidence and update each event's current canonical status without confusing it with projection state.                                       |
| Database  | One migration history, managed environments, role exports, locks and marker, seed, backup/restore                                                                                 | `@motorcove/database` is the only runtime database package; seed rejects incomplete markers; lock cleanup shares one child completion; restore validates deployment identity         | Failed maintenance leaves catalog and bindings unchanged. Signal-before-release, repeated release, composite cleanup, migration, backup/restore, and deployment mismatch cases are covered locally.    |

## Current executed gates

- `pnpm verify`: generation, database contract, formatting, docs, architecture, type checking,
  lint, 13 Foundry tests, 208 unit/component/database tests, 47 integration tests, and all
  7 workspace builds passed.
- `pnpm test:e2e`: 6 local Playwright scenarios passed against Anvil, managed SQLite, API,
  Indexer, and Web. The marketplace lane includes non-durable hash preservation across client
  navigation and the explicit reload limit. Two scenarios cover real Chromium multi-tab journal
  coordination and writer handoff. A fresh context also observes a stopped Indexer as stale without
  relying on local transaction evidence.
- `pnpm test:migrations`: 1 file and 11 tests passed, including preserved data through the
  `0000` to `0001` migration.
- `pnpm test:recovery`: 1 file and 13 tests passed, including sidecar integrity and
  deployment-bound restore refusal before quarantine.
- The full gates cover rebuild source integrity, restore identity, all-action transaction
  observation, depth-aware reindexing, maintenance version gates, idle recovery, source
  reacquisition after migration, and journal serialization.
- Architecture validation passed for 150 source files and rejected all 10 negative fixtures,
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
