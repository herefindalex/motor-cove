# Engineering capability map

This map answers which observable engineering behaviors exist, where their implementation lives,
what has been executed, and which limits remain. Metadata in `_meta/capabilities.json` owns the
status fields; `docs:generate` owns the table below.

<!-- GENERATED:CAPABILITIES:START -->
| ID | Capability | Implementation | Evidence | Main limit |
| --- | --- | --- | --- | --- |
| CAP-01 | React, Vite, and TypeScript | implemented | RUN-WORKSPACE-VERIFY: executed/pass | The local gate applies to the recorded dirty source fingerprint; later source changes require a rerun. |
| CAP-02 | Frontend architecture | implemented | RUN-ARCHITECTURE: executed/pass | The checker covers parsed source imports; it is not a runtime isolation mechanism. |
| CAP-03 | Wallet connectivity | implemented | RUN-WEB-COMPONENT: executed/pass<br>RUN-E2E: executed/pass | Missing-provider and connector-selection component tests passed. Browser settlement uses the loopback demo connector; fault injection uses a controlled provider. Manual MetaMask smoke testing is not recorded. |
| CAP-04 | Network validation and switching | implemented | RUN-E2E: executed/pass | Only local chain ID 31337 is in scope. |
| CAP-05 | Smart-contract interaction | implemented | RUN-CONTRACTS: executed/pass<br>RUN-E2E: executed/pass | No public-chain deployment or external wallet-provider compatibility claim. |
| CAP-06 | Transaction lifecycle | implemented | RUN-TRANSACTION-RECOVERY: executed/pass<br>RUN-INTEGRATION: executed/pass<br>RUN-E2E: executed/pass | Automated recovery uses local Anvil or controlled ports; real MetaMask response loss and every replacement variant remain unverified. |
| CAP-07 | Frontend state and API integration | implemented | RUN-API-CONTRACT: executed/pass<br>RUN-E2E: executed/pass | Automated browser coverage separates the local demo connector from controlled provider faults; manual injected-wallet behavior remains unverified. |
| CAP-08 | Digital-asset escrow | implemented | RUN-CONTRACTS: executed/pass | Local test assets and test ETH only; contracts have not received an external security audit. |
| CAP-09 | EVM integration literacy | implemented | RUN-INTEGRATION: executed/pass | Anvil behavior does not establish public-network finality or archive-RPC support. |
| CAP-10 | Event-driven backend | implemented | RUN-INDEXER-UNIT: executed/pass<br>RUN-INDEXER-KILL: executed/pass<br>RUN-INTEGRATION: executed/pass | Automatic recovery across arbitrary canonical branch changes is outside the implemented scope. |
| CAP-11 | Database lifecycle | partial | RUN-DB-MIGRATIONS: executed/pass<br>RUN-DB-BOUNDARIES: executed/pass<br>RUN-DB-SEEDS: executed/pass<br>RUN-DB-RECOVERY: executed/pass<br>RUN-CHAIN-SEED-JOURNAL: executed/pass<br>RUN-INTEGRATION: executed/pass | A real process kill in the broadcast-to-hash persistence window and other listed database fault-injection cases remain incomplete. |
| CAP-12 | Cross-team interface contracts | implemented | RUN-GENERATE-CHECK: executed/pass<br>RUN-API-CONTRACT: executed/pass | Generated artifacts require a current drift check after provider changes. |
| CAP-13 | Failure diagnosis and recovery | partial | RUN-TRANSACTION-RECOVERY: executed/pass<br>RUN-INDEXER-KILL: executed/pass<br>RUN-INTEGRATION: executed/pass<br>RUN-DB-RECOVERY: executed/pass | Parallel and some process/filesystem fault cases remain unverified. |
| CAP-14 | Release management | partial | RUN-GENERATE-CHECK: executed/pass | No remote CI run or branch-protection setting was inspected. |
| CAP-15 | Code review and delivery quality | implemented | RUN-ARCHITECTURE: executed/pass | Repository artifacts describe a collaboration model; they do not prove a multi-person team used it or that remote settings are enabled. |
| CAP-16 | Roadmap and dependency management | implemented | source inspection only | Planning artifacts are examples and current-state records, not historical sprint evidence. |
| CAP-17 | Onboarding and mentoring support | implemented | RUN-DOCS-CHECK: executed/pass | These artifacts support onboarding; they do not prove mentoring sessions occurred. |
| CAP-18 | Remote cross-functional collaboration | implemented | RUN-DOCS-CHECK: executed/pass | No claim is made about an actual remote team, review event, or delivery history. |
<!-- GENERATED:CAPABILITIES:END -->

## Reading the map

`implemented` means a source path exists and was inspected. `partial` means a required provider or
consumer path is missing. Verification IDs link to `evidence/verification.json`; only
`executed/pass` records support a current pass claim. A mock, unit test, real SQLite test, real Anvil
test, browser automation, and manual wallet check prove different things.

CAP-15 through CAP-18 describe usable repository artifacts. They do not prove that a multi-person
team operated under these policies, that mentoring happened, or that remote repository controls are
enabled.

Related: [scenario catalog](testing/scenario-catalog.md),
[database matrix](testing/database-acceptance-matrix.md), and
[technology choices](technology-choices.md).
