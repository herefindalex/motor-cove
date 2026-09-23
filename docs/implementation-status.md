# Implementation status

Status captured on 2026-09-22 from the current pre-commit workspace. Capability metadata and the
verification JSON are the machine-readable sources; this page is the human summary.

| Area      | Required behavior                                                                                                                                                         | Implemented                                                                                                                                                                                           | Current local evidence                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | ERC-721 custody, sale transitions, pull claims, refund, withdrawal, reclaim, independently calculated liability invariants                                                | `chain/src` and generated ABI                                                                                                                                                                         | Stateful Foundry checks independently sum funded Sales and claimable Claims before checking balance coverage; local EVM only.                                                                                                           |
| Frontend  | Feature/capability/adapter layers, exact bigint amount presentation, explicit injected local connector states, durable pre-submit journal, read-only transaction recovery | `apps/web` capability ports plus EVM, HTTP, Wagmi, localStorage, operation-scoped observation, and immutable-intent submission coordination adapters                                                  | Unit, component, and two-page Chromium coverage verifies one observer owner per operation and one submitter per immutable intent, owner-close handoff, independent work, and safe volatile-hash promotion. Manual MetaMask was not run. |
| API       | Read-only query API with validated wire schemas, uint256 request boundaries, historical report scope, observation freshness, and per-event provenance                     | Database reader plus Zod and generated OpenAPI contracts                                                                                                                                              | Fastify and reader contracts distinguish raw canonical and orphan event rows through `canonical`, `scanComplete`, and `sourceLogScopeHash`.                                                                                             |
| Indexer   | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, version gates, and interpretable raw history                                                   | Pure projectors plus EVM and SQLite adapters; rebuild source preflight; fixed-target reindex resume; explicit failed-rebuild to full-reindex transition; verified pre-refresh evidence archives       | SQLite and loopback Anvil tests cover replay, reorg, source reacquisition, long catch-up, and restart boundaries. Public archive-provider behavior remains unverified.                                                                  |
| Database  | Native migration history, operation markers, owned maintenance, seed/bootstrap lifecycle, backup/restore identity, and generation-safe recovery                           | `@motorcove/database`; bootstrap-owned snapshots and restores; unique marker publication temps; source-ready standard backups; operation-bound evidence archives; restore quarantine and verification | Real advisory-lock tests prove snapshots and restore cannot overlap bootstrap, incomplete bootstrap sidecars are rejected, and changed sidecars stop restore before quarantine. Hardware power loss remains unverified.                 |

## Current executed gates

R20 hardening is implemented in the working source. Standard backups hold shared bootstrap
ownership, restores hold exclusive bootstrap ownership, and migration safety backups reuse the
ownership already held by bootstrap. Deployed backups require a complete seed-journal and receipt
pair. Restore compares all bootstrap sidecars before quarantine. Reconciliation samples the head
again at publication so an anchored match cannot publish stale `CURRENT` freshness.

- `pnpm verify`: generation, database contract, formatting, docs, architecture, type checking, lint,
  13 Foundry tests, 47 unit/component/database files with 314 tests, 14 integration files with 60
  tests, and all 7 workspace builds passed.
- `pnpm test:e2e`: 8 local Playwright scenarios passed against harness-owned Anvil, managed SQLite,
  API, Indexer, and Web.
- Focused R20 coverage passed 52 backup, restore, migration, and reconciliation tests. They exercise
  real advisory-lock contention, complete sidecar pairs, pre-quarantine generation checks, a caller
  that already owns bootstrap, publication-time head advancement, and publication-head failure.
- Documentation checks generated 18 capabilities and 48 commands, validated database acceptance IDs
  through DB-72, and rejected all 8 negative fixtures.

Exact commands, timestamps, environment, source fingerprint, and limitations are recorded in the
[verification records](evidence/verification.json), the
[database matrix](testing/database-acceptance-matrix.md), and the
[documentation matrix](testing/documentation-acceptance-matrix.md).

## Remaining product verification gaps

1. Inject real process death inside the chain broadcast-to-hash journal window. Deterministic state
   machine tests cover known-hash resume and conservative `UNKNOWN`, but not that exact operating
   system timing window.
2. Hardware power loss and full host-filesystem exhaustion remain unverified. Current evidence covers
   bounded SQLite page exhaustion, transaction rollback, WAL recovery, and harness-owned `SIGKILL`.
3. Manual MetaMask behavior, cross-device journal coordination, public-network behavior, branch
   protection, and final reviewer identities require owner-controlled external environments.

Remote CI evidence is added to the machine-readable verification record only after the corresponding
commit completes; this pre-commit status does not reuse a prior commit's CI result.
