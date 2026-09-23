# Implementation status

Status reconciled on 2026-09-23 through the R26 commit. Capability metadata and the
verification JSON are the machine-readable sources; this page is the human summary.

| Area      | Required behavior                                                                                                                                                         | Implemented                                                                                                                                                                                                                                 | Current local evidence                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | ERC-721 custody, sale transitions, pull claims, refund, withdrawal, reclaim, independently calculated liability invariants                                                | `chain/src` and generated ABI                                                                                                                                                                                                               | Stateful Foundry checks independently sum funded Sales and claimable Claims before checking balance coverage; local EVM only.                                                                                                                                               |
| Frontend  | Feature/capability/adapter layers, exact bigint amount presentation, explicit injected local connector states, durable pre-submit journal, read-only transaction recovery | `apps/web` capability ports plus EVM, HTTP, Wagmi, localStorage, operation-scoped observation, and immutable-intent submission coordination adapters                                                                                        | Unit and component coverage preserves nonce-backed original hashes, requests a current or replacement wallet hash after explicit RPC not-found, and never resubmits. Two-page Chromium coverage verifies observation and submission ownership. Manual MetaMask was not run. |
| API       | Read-only query API with validated wire schemas, uint256 request boundaries, historical report scope, observation freshness, and per-event provenance                     | Database reader plus Zod and generated OpenAPI contracts                                                                                                                                                                                    | Fastify and reader contracts distinguish raw canonical and orphan event rows through `canonical`, `scanComplete`, and `sourceLogScopeHash`.                                                                                                                                 |
| Indexer   | Ordered source evidence, atomic commit, catch-up, replay, rebuild/reindex, version gates, and interpretable raw history                                                   | Pure projectors plus EVM and SQLite adapters; rebuild source preflight; fixed-target reindex resume; explicit failed-rebuild to full-reindex transition; verified pre-refresh evidence archives                                             | SQLite and loopback Anvil tests cover replay, reorg, source reacquisition, long catch-up, and restart boundaries. Public archive-provider behavior remains unverified.                                                                                                      |
| Database  | Native migration history, operation markers, owned maintenance, seed/bootstrap lifecycle, backup/restore identity, and generation-safe recovery                           | `@motorcove/database`; bootstrap-owned snapshots and restores; post-lock destructive-path containment; staged-copy checksum verification; unique marker publication temps; source-ready standard backups; operation-bound evidence archives | Real temporary-filesystem tests reject reset child symlinks before chain mutation and preserve lock reuse. Real SQLite fixtures reject changed backup bytes before active quarantine. Hardware power loss remains unverified.                                               |

## Current executed gates

Current hardening is implemented in the working source. Transaction submission keeps durable
same-intent ownership after a hash is returned and after journal reload until the attempt reaches a
terminal outcome; wallet rejection and explicit retry retain their defined recovery paths. Each
VehicleNFT deployment binds once to its MotorCoveEscrow, direct safe and unsafe deposits into the
escrow are rejected, and legitimate `createSale` custody remains available. Existing local
deployments without that immutable binding require an explicit demo reset before reuse.

- `pnpm verify`: generation, database contract, formatting, docs, architecture, type checking, lint,
  17 Foundry tests, 53 unit/component/database files with 370 tests, 14 integration files with 61
  tests, and all 7 workspace builds passed.
- `pnpm test:e2e`: 8 local Playwright scenarios passed against harness-owned Anvil, managed SQLite,
  API, Indexer, and Web.
- Focused coverage passed 24 Web submission/coordinator/gateway tests, 17 Foundry tests, and 5
  fresh-Anvil bootstrap/ownership/settlement tests. The command groups overlap with the complete
  verification lanes by design.
- Four historical meta-regression guards add 19 table-driven and component tests for router-held
  evidence, observer re-poll ownership, deployment identity fields, and page-level non-durable hash
  disclosure. Recovery barrier, bootstrap receipt, and rebuild freshness guards remain outside this
  baseline until their corresponding product invariants are implemented.
- Database documentation checks executed current migrations in isolated SQLite, matched all 13
  physical tables to the semantic model, passed 4 focused contract tests, and kept generated
  columns, keys, indexes, constraints, digests, and the authority matrix byte-current.
- R23 focused checks passed 72 tests across reset containment, restore copy-boundary verification,
  chain inspection, recovery persistence, and Observer presentation. Database and recovery lanes
  passed 43 and 25 tests, and transaction UI components passed 5 tests.
- Documentation checks generated 18 capabilities and 48 commands, validated database acceptance IDs
  through DB-75, rejected all 8 documentation negative fixtures, and rejected all 10 architecture
  negative fixtures.

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
commit completes; every result below is bound to its own source commit.

## R25 incremental result

The persisted projection recovery barrier now blocks ordinary Indexer writer startup and commits.
Canonical or source integrity evidence selects reindex; projector-only integrity may select rebuild
after raw-source verification. Reindex retains its recovery reason through replay and catch-up, and
releases it only after the canonical target proof. Reconciliation retains a maintenance-owned
diagnostic report path while ordinary writes are blocked.

Bootstrap publishes immutable sidecars through validated, flushed temporary files and atomic
rename. A deployed standard backup requires a valid historical bootstrap receipt paired with its
seed journal; backup verification checks receipt schema and identity again. Local-only projection
rebuild does not renew worker heartbeat or live RPC freshness.

For the R25 commit `be88e9e`, `pnpm verify` passed 58 unit/component files (394 tests),
17 integration files (73 tests), and the production build. `pnpm test:e2e` passed 8 Playwright
scenarios on a harness-owned loopback Anvil stack. The temporary provider and filesystem fixtures
do not constitute real wallet, public-chain, or hardware power-loss evidence. The source revision
and fingerprint are in `docs/evidence/verification.json`. Remote CI run
[35835549975](https://github.com/herefindalex/motor-cove/actions/runs/35835549975) completed
successfully for that commit.

## Post-R25 database documentation and R26 audit

DB-DOC-2 (`b18e941`) reconciled all 13 migrated tables with explicit authority, identity,
restore, and temporal contracts. It added a generated table contract and timestamp-field drift
checks without changing the physical schema. R26 (`e2a7830`) found that a future persisted worker
heartbeat was incorrectly presented as fresh; the real SQLite/API regression failed on the old
reader and passed after `UNKNOWN` freshness and null lag replaced that claim. Catalog no-op seed
timestamp behavior is also pinned by a regression. No schema migration was required;
[database temporal semantics](database/temporal-semantics.md) describes the current contract.

Both stages passed local `pnpm verify` and `pnpm test:e2e`. Remote CI completed successfully for
[DB-DOC-2](https://github.com/herefindalex/motor-cove/actions/runs/35838072123) and
[R26](https://github.com/herefindalex/motor-cove/actions/runs/35840091000), including `docs:smoke`,
`pnpm verify`, and `pnpm test:e2e`. These local and CI runs use synthetic loopback chain evidence;
manual wallet-provider and public-network behavior remain outside their scope.
