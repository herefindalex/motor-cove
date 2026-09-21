# Implementation status

Status captured on 2026-09-21 from the local source tree before its first publication. Capability
metadata and the verification JSON are the machine-readable sources; this page is the human summary.

| Area                   | Required behavior                                                                                         | Implemented                                                                             | Current local evidence                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts              | ERC-721 custody, sale transitions, pull claims, refund/withdraw/reclaim, liability invariant              | `chain/src` and generated ABI                                                           | 12 unit/fuzz tests and 1 stateful invariant test passed.                                                                                                                                                 |
| Frontend               | Feature/capability/adapter layers, durable pre-submit journal, read-only hash/event/projection recovery   | `apps/web` capability ports plus EVM, HTTP, Wagmi, and localStorage adapters            | 20 focused recovery tests; real replacement/reorg tests; 4 Playwright scenarios including one-broadcast response loss and reload recovery passed. Manual MetaMask was not run.                           |
| API                    | Readonly query API with validated wire schemas, selector observation, and provenance                      | Database reader plus Zod/OpenAPI contracts                                              | 12 API contract tests, readonly boundary tests, one-snapshot concurrency, and real local convergence passed.                                                                                             |
| Indexer                | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, version gates                  | Pure projectors plus EVM/SQLite adapters and recovery commands                          | Real Anvil convergence, orphan/reinclude, canonical reindex, restore catch-up, reconciliation, and child-process `SIGKILL` cases passed.                                                                 |
| Database               | One migration history, managed environments, role exports, locks/marker, seed, backup/restore             | `@motorcove/database` is the only runtime database package                              | Migration failure rollback, source digest, lock kill, busy/full faults, seed conflict, backup/restore, and deployment reset detection passed. DB-03 remains open because no prior schema release exists. |
| Documentation delivery | Navigable scope/architecture/operations, provider-consumer contracts, local/CI gates, evidence discipline | Bilingual entry, public docs, generated maps, docs/architecture checks, and CI workflow | Docs, architecture, format, typecheck, lint, complete verify, and E2E gates passed locally; remote settings remain unobserved.                                                                           |

## Current executed gates

- `pnpm verify`: generation, database contract, formatting, docs, architecture, typecheck, lint,
  13 Foundry tests, 84 unit/component/database tests, 26 integration tests, and all 7 workspace
  builds passed.
- `pnpm test:e2e`: 4 local Playwright scenarios passed against Anvil, managed SQLite, API,
  Indexer, Web, and a controlled EIP-1193 provider.
- `pnpm test:migrations`: 1 file and 9 tests passed.
- `pnpm test:db`: 3 files and 18 tests passed.
- `pnpm test:seeds`: 1 file and 4 tests passed.
- `pnpm test:recovery`: 1 file and 4 tests passed.
- The focused chain/database recovery run passed 2 files and 7 tests.
- Three real Anvil/SQLite integration files passed concurrently with 6 tests, establishing the
  configured suite isolation for DB-54.

See exact commands, timestamps, environments, and limits in
[verification records](evidence/verification.json), the
[database matrix](testing/database-acceptance-matrix.md), and the
[documentation matrix](testing/documentation-acceptance-matrix.md).

## Remaining product or verification gaps

1. Add a preserved-data prior-schema upgrade fixture when the first real schema change exists.
   Creating a fictional released schema now would make DB-03 evidence misleading.
2. Inject a real process death inside the chain broadcast-to-hash journal window. Deterministic
   state-machine tests cover known-hash resume and conservative `UNKNOWN`, but not that exact
   operating-system timing window.
3. Hardware power-loss and full host-filesystem exhaustion remain unverified. Current evidence is
   bounded SQLite page exhaustion, transactional rollback, WAL recovery, and harness-owned
   `SIGKILL`.
4. Manual MetaMask behavior, public-network behavior, remote GitHub Actions, branch protection, and
   final reviewer identities require owner-controlled external environments. They are not local
   implementation claims.
