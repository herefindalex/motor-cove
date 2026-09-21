# Command reference

This page answers which root commands exist, their side effects, and their prerequisites. Metadata
in `_meta/commands.json` owns the table.

<!-- GENERATED:COMMANDS:START -->
| Command | Status | Effect | Prerequisite |
| --- | --- | --- | --- |
| `pnpm doctor` | implemented | read-only diagnostics | workspace dependencies installed |
| `pnpm dev:chain` | implemented | starts loopback Anvil | port 8545 free |
| `pnpm dev:bootstrap` | implemented | deploys contracts, registers the deployment, seeds catalog data, and catches up projections | loopback Anvil and a selected owned environment |
| `pnpm dev:full` | implemented | starts API, Indexer, and Web | bootstrap complete for the selected environment |
| `pnpm dev:ui` | implemented | starts only the Vite Web process | bootstrap complete for the selected environment |
| `pnpm dev:api` | implemented | starts only the readonly API process | initialized owned environment |
| `pnpm dev:indexer` | implemented | starts only the normal Indexer writer | bootstrap complete; no maintenance operation |
| `pnpm storybook` | implemented | starts isolated UI development server | workspace dependencies installed |
| `pnpm generate` | implemented | updates ABI, OpenAPI, and generated artifacts | provider source change reviewed |
| `pnpm generate:check` | implemented | read-only generated artifact drift check | contracts compiled when Solidity changed |
| `pnpm check:architecture` | implemented | checks dependency graph and negative fixtures | workspace dependencies installed |
| `pnpm check` | implemented | runs format, docs, architecture, typecheck, and lint gates | workspace dependencies installed |
| `pnpm lint` | implemented | runs ESLint with zero warnings allowed | workspace dependencies installed |
| `pnpm format:check` | implemented | read-only Prettier conformance check | workspace dependencies installed |
| `pnpm test:unit` | implemented | runs TypeScript unit, component, database, seed, and recovery suites except integration/E2E | workspace dependencies installed |
| `pnpm test:components` | implemented | runs React component tests with Vitest and JSDOM | workspace dependencies installed |
| `pnpm test:contracts` | implemented | runs Foundry unit, fuzz, and invariant tests | Foundry installed |
| `pnpm test:integration` | implemented | runs SQLite and isolated real-Anvil integration suites | Foundry and workspace dependencies installed; test ports free |
| `pnpm test:e2e` | implemented | starts isolated local Anvil and app processes | ports available and Foundry installed |
| `pnpm build` | implemented | builds all workspace packages and applications | workspace dependencies installed |
| `pnpm release:metadata` | implemented | writes local release-readiness metadata without publishing | verification commands completed |
| `pnpm verify` | implemented | local generated, docs, architecture, test, and build gate | Foundry and Node toolchain |
| `pnpm ops:reconcile` | implemented | writes an anchored chain/projection comparison report | MOTORCOVE_ENV set; Indexer stopped |
| `pnpm ops:rebuild` | implemented | atomically rebuilds projections from verified local evidence | MOTORCOVE_ENV set; API and Indexer stopped |
| `pnpm demo:advance-time --seconds <n>` | implemented | advances and mines time on verified loopback Anvil | local Anvil running on chain ID 31337 |
| `pnpm demo:reset -- --yes` | implemented | resets loopback Anvil and removes generated state from the selected owned environment | MOTORCOVE_ENV set; stopped services; disposable environment only |
| `pnpm db:generate --name <name>` | implemented | changes migration artifacts and schema contract | reviewed schema change |
| `pnpm db:check` | implemented | temporary DB only | dependencies installed |
| `pnpm db:status --env <id>` | implemented | read-only; does not create environment | safe environment slug |
| `pnpm db:plan --env <id>` | implemented | read-only migration plan | safe environment slug |
| `pnpm db:migrate --env <id>` | implemented | maintenance write; creates owned environment when absent | API and Indexer stopped |
| `pnpm db:verify --env <id>` | implemented | coordinated read-only verification | owned initialized environment |
| `pnpm db:backup --env <id>` | implemented | writes verified snapshot bundle | API and Indexer stopped |
| `pnpm db:restore --env <id> --backup <id> --yes` | implemented | destructive maintenance with quarantine | verified backup and stopped services |
| `pnpm seed:catalog --env <id> --set motorcove-local-catalog` | implemented | maintenance write; no chain transaction | registered deployment manifest |
| `pnpm seed:dev` | implemented | runs the local bootstrap profile | MOTORCOVE_ENV set; loopback Anvil; owned environment |
| `pnpm seed:demo` | implemented | runs the local demo bootstrap profile | MOTORCOVE_ENV set; loopback Anvil; owned environment |
| `pnpm seed:test` | implemented | runs the isolated test bootstrap profile | test harness environment and loopback Anvil |
| `pnpm ops:recover --env <id> [--complete]` | implemented | inspects or completes verified marker recovery | owned environment |
| `pnpm ops:reindex -- --yes` | implemented | rewinds source evidence, refetches canonical history, and rebuilds projections | MOTORCOVE_ENV set; stopped services; verified loopback deployment |
| `pnpm test:migrations` | implemented | runs native migration history and drift tests in temporary SQLite environments | native SQLite driver installed |
| `pnpm test:db` | implemented | runs database ownership, locking, constraints, and reset-boundary tests | native SQLite driver installed |
| `pnpm test:seeds` | implemented | runs catalog seed identity and idempotency tests | native SQLite driver installed |
| `pnpm test:recovery` | implemented | runs backup, restore, and maintenance marker recovery tests | native SQLite driver installed |
| `pnpm docs:generate` | implemented | updates generated Markdown regions | metadata valid |
| `pnpm docs:generate:check` | implemented | read-only generated Markdown drift check | metadata valid |
| `pnpm docs:check` | implemented | read-only docs consistency checks | dependencies installed |
| `pnpm docs:smoke` | implemented | temporary SQLite test environments only | native driver installed |
<!-- GENERATED:COMMANDS:END -->

## Status vocabulary

- `implemented`: the root script and called entry exist. Verification is a separate record.
- `implemented`: the root script and called entry exist. Verification is a separate record.
- `gap`: the script is absent downstream or does not meet its documented contract.

`db:restore` and `demo:reset` are destructive commands. The documented `--yes` flag is only an
operator confirmation; it must never bypass local-chain, ownership, identity, or path guards.
No quickstart should use them on an existing environment.

`dev:full` supervises API, Indexer, and Web independently. A fatal Indexer integrity error does not
terminate the readonly API or Web process; inspect system status, stop the remaining services, and
run the documented recovery command. `ops:rebuild` and `ops:reindex` require exclusive maintenance
access and leave a failed marker when interrupted.

Project commands wrap tool behavior. `db:check` is not a claim that Drizzle Kit alone verifies live
schema, constraints, data, and historical checksums.
