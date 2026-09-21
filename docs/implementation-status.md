# Implementation status

Status captured on 2026-09-21 from the current pre-commit workspace. Capability metadata and
the verification JSON are the machine-readable sources; this page is a human summary.

| Area      | Required behavior                                                                                                                               | Implemented                                                                                                                                                               | Current local evidence                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | ERC-721 custody, sale transitions, pull claims, refund, withdrawal, reclaim, and liability invariant                                            | `chain/src` and generated ABI                                                                                                                                             | 12 unit and fuzz tests plus 1 stateful invariant test passed.                                                                                                                                                                                 |
| Frontend  | Feature/capability/adapter layers, explicit injected and local connector states, durable pre-submit journal, and read-only transaction recovery | `apps/web` capability ports plus EVM, HTTP, Wagmi, and localStorage adapters; generation-guarded verification; Web Locks serialize journal writers per deployment         | All eight supported actions have receipt outcomes; non-funding revert and reload cases passed. Six Playwright scenarios include two real multi-tab journal cases. Manual MetaMask was not run.                                                |
| API       | Read-only query API with validated wire schemas, selector observation, and provenance                                                           | Database reader plus Zod and OpenAPI contracts                                                                                                                            | 12 API contract tests, read-only boundary tests, one-snapshot concurrency, and real local convergence passed.                                                                                                                                 |
| Indexer   | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, and version gates                                                    | Pure projectors plus EVM and SQLite adapters; rebuild source preflight; eligible-depth reindex targets; explicit maintenance version transitions; idle transport recovery | Missing or altered journal evidence is rejected before projection deletion. Depth, target-hash change, prior-projector maintenance, recanonicalization, restore catch-up, reconciliation, RPC recovery, and process termination cases passed. |
| Database  | One migration history, managed environments, role exports, locks and marker, seed, backup/restore                                               | `@motorcove/database` is the only runtime database package; backup format binds deployment identity and sidecar checksums; restore rejects mismatches before quarantine   | Migration rollback, real `0000` to `0001` preserved-data upgrade, source digest, lock termination, backup/restore boundaries, and deployment mismatch refusal passed.                                                                         |

## Current executed gates

- `pnpm verify`: generation, database contract, formatting, docs, architecture, type checking,
  lint, 13 Foundry tests, 168 unit/component/database tests, 36 integration tests, and all
  7 workspace builds passed.
- `pnpm test:e2e`: 6 local Playwright scenarios passed against Anvil, managed SQLite, API,
  Indexer, and Web. Four cover marketplace and wallet recovery flows; two cover real Chromium
  multi-tab journal coordination and writer handoff.
- `pnpm test:migrations`: 1 file and 11 tests passed, including preserved data through the
  `0000` to `0001` migration.
- `pnpm test:recovery`: 1 file and 13 tests passed, including sidecar integrity and
  deployment-bound restore refusal before quarantine.
- The full gates cover rebuild source integrity, restore identity, all-action transaction
  observation, depth-aware reindexing, maintenance version gates, idle recovery, source
  reacquisition after migration, and journal serialization.
- Architecture validation passed for 142 source files and rejected all 8 negative fixtures.

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
