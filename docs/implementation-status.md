# Implementation status

Status captured on 2026-09-22 from the current pre-commit workspace. Capability metadata and
the verification JSON are the machine-readable sources; this page is a human summary.

| Area      | Required behavior                                                                                                                                                         | Implemented                                                                                                                                                                                                                                                                                        | Current local evidence                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | ERC-721 custody, sale transitions, pull claims, refund, withdrawal, reclaim, independently calculated liability invariants                                                | `chain/src` and generated ABI                                                                                                                                                                                                                                                                      | Stateful Foundry checks compare `totalLiability` with funded Sales plus claimable Claims, then check balance coverage; local EVM only.                                                                                                                                                                                                  |
| Frontend  | Feature/capability/adapter layers, exact bigint amount presentation, explicit injected local connector states, durable pre-submit journal, read-only transaction recovery | `apps/web` capability ports plus EVM, HTTP, Wagmi, and localStorage adapters; full deployment recheck before wallet submission; candidate inspection binds saved and configured identity to the RPC chain and on-chain deployment getter; failed recovery writes use the existing volatile overlay | Focused unit, integration, and Playwright coverage verifies all supported action receipts, identity mismatch rejection before transaction lookup, continued known-hash inspection during storage failure, unchanged durable bytes, tab-local warnings, reload fallback, and zero added wallet submissions. Manual MetaMask was not run. |
| API       | Read-only query API with validated wire schemas, uint256 request boundaries, historical report scope, observation freshness, and per-event provenance                     | Database reader plus Zod OpenAPI contracts                                                                                                                                                                                                                                                         | Fastify/reader contracts distinguish raw canonical and orphan event rows through `canonical`, `scanComplete`, and `sourceLogScopeHash`.                                                                                                                                                                                                 |
| Indexer   | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, version gates, and interpretable raw history                                                   | Pure projectors plus EVM and SQLite adapters; rebuild source preflight; fixed-target reindex resume; explicit failed-rebuild to full-reindex transition; verified pre-refresh backups; maintenance version transitions; failed latest-head reconciliation reports                                  | Real reorg and same-history reindex cases retain source evidence and report unavailable observations without inventing a successful match.                                                                                                                                                                                              |
| Database  | Native migration history, operation markers, owned maintenance, seed/bootstrap lifecycle, backup/restore identity, and generation-safe recovery                           | `@motorcove/database` runtime package; completion rereads the current marker after acquiring maintenance locks; restore keeps SQLite file generations together                                                                                                                                     | Real lock regression proves a recovery waiter selects the marker present after ownership acquisition and does not clear a newer projection marker. Hardware power loss remains unverified.                                                                                                                                              |

## Current executed gates

R16 hardening is implemented in the working source: migration resume requires a published backup
proof, revalidates it against the live source and deployment before SQL, and retries backup when no
proof exists. Environment initialization creates ownership only for genuinely empty directories;
existing databases and sidecars remain unowned and unchanged.

- `pnpm verify`: generation, database contract, formatting, docs, architecture, type checking, lint, 13 Foundry tests, 44 files / 291 unit, component, and database tests, 14 files / 58 integration tests, and all 7 workspace builds passed.
- `pnpm test:e2e`: 6 local Playwright scenarios passed against harness-owned Anvil, managed SQLite, API, Indexer, and Web. The recovery scenario observed an actual transaction lookup, no added wallet submission, unchanged durable journal bytes, the tab-local warning, and reload fallback.
- Focused R16 migration coverage passed 1 file / 24 tests, including repeated backup failure,
  verified snapshot reuse, unowned databases and sidecars, and idempotent empty initialization.
- Documentation checks generated 18 capabilities and 48 commands, validated database acceptance IDs through DB-67, and rejected all 8 negative fixtures. Architecture validation passed 159 source files and rejected all 10 dependency fixtures.

Exact commands, timestamps, environment, source fingerprint, and limitations are recorded in the
[verification records](evidence/verification.json), the
[database matrix](testing/database-acceptance-matrix.md), and the
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
