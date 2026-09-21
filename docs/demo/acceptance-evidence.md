# Acceptance evidence

This page is a concise review index. Machine-readable commands, timestamps, source context,
and limitations are recorded in [verification.json](../evidence/verification.json). Design
requirements and implementation evidence remain separate.

| Evidence level          | Current executed result                                                                                                                                                                                                                                                                       | Limit                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Transaction application | Focused tests passed durable pre-submit persistence, all eight supported action receipt outcomes, non-funding reload and revert handling, supplied hashes, replacement and reorg classification, projection lag, stale-result suppression, nonce merging, and evidence preservation.          | Unit tests use controlled wallet and storage ports. Manual MetaMask remains unverified.                                |
| React component         | React Testing Library and JSDOM coverage passed for wallet rejection, transaction notices, timeline rendering, and API error surfaces.                                                                                                                                                        | Component tests do not inject a browser wallet.                                                                        |
| Contract and Foundry    | 12 unit and fuzz tests plus 1 stateful liability invariant test passed.                                                                                                                                                                                                                       | Local Foundry EVM only; no public network or external audit claim.                                                     |
| Real temporary SQLite   | Migration, database boundary, seed, recovery, replay, rebuild source preflight, one-snapshot reads, deployment-bound restore, and child-process `SIGKILL` cases passed within the 168-test unit/component/database gate and 36-test integration gate.                                         | Hardware power loss and full host-filesystem exhaustion were not exercised.                                            |
| Schema upgrade          | The 11-test migration lane includes a real `0000` to `0001` fixture that preserves an existing `chain_events` row while adding source-record integrity evidence.                                                                                                                              | This proves the repository's current migration path, not compatibility with unknown future schemas.                    |
| API contract            | 12 HTTP and OpenAPI consumer tests passed, including funding selectors and deployment mismatch behavior.                                                                                                                                                                                      | Authentication and pagination are outside the defined scope.                                                           |
| Real Anvil integration  | Integration coverage passed one-submit convergence, lifecycle actions, bootstrap reuse, replacement and reorg handling, same-history recanonicalization, rebuild and reindex, reconciliation, backup/restore catch-up, deployment reset rejection, replay, rollback, and process termination. | Local deterministic Anvil only; no public-network archive or finality claim.                                           |
| Browser E2E             | 6 Playwright scenarios passed. Four exercise local marketplace and wallet recovery flows; two use real Chromium tabs to verify concurrent journal writes, stale same-operation evidence rejection, and writer-tab handoff.                                                                    | Wallet fault injection uses a controlled EIP-1193 adapter. Manual MetaMask and cross-device coordination were not run. |
| Parallel isolation      | Three real Anvil and SQLite integration files passed concurrently with separate roots, environment IDs, databases, locks, ports, and deployments.                                                                                                                                             | Same-host process isolation only.                                                                                      |
| Architecture            | 142 source files passed and 8 invalid dependency fixtures were rejected, including recovery-to-wallet-write and capability-to-adapter violations.                                                                                                                                             | Static imports only; runtime behavior is verified in other lanes.                                                      |
| Documentation           | 18 capabilities and 48 commands were generated; public reachability, evidence IDs, bilingual checks, and 8 invalid fixtures passed.                                                                                                                                                           | Mermaid rendering and independent contributor onboarding remain manual checks.                                         |

The full `pnpm verify` gate passed generation, database checks, formatting, documentation,
architecture, type checking, lint, 13 Foundry tests, 168 unit/component/database tests,
36 integration tests, and all 7 workspace builds. `pnpm test:e2e` separately passed all
6 Playwright scenarios. The exact source fingerprint and executed commands are in the
[machine-readable verification record](../evidence/verification.json); remote CI evidence is
recorded after the corresponding commit runs.

Branch rules, CODEOWNERS identities, manual wallet evidence, hardware power loss,
cross-device journal behavior, and public-network behavior remain unverified or intentionally
unexecuted.

See the [testing strategy](../testing/strategy.md),
[scenario catalog](../testing/scenario-catalog.md), and
[implementation status](../implementation-status.md).
