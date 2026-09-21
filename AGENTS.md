# MotorCove agent guide

This file is the operational entry point for contributors and coding agents. Project files and
public documentation use English. Preserve unrelated working-tree changes and never delete, reset,
or adopt an existing local database to make a check pass.

## Read first

1. Read this file and the nearest applicable `AGENTS.md` before editing.
2. Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the relevant page in
   [docs/README.md](docs/README.md).
3. For implementation requirements, use the specifications under `docs/internal/`. Database,
   migration, seed, bootstrap, and recovery conflicts are resolved by the database handoff. The
   transaction convergence addendum governs transaction and projection recovery. Product and
   module architecture otherwise follow the implementation prompt.
4. Inspect `git status`, the affected source, tests, generated artifacts, and package scripts before
   changing files. Do not overwrite user changes.

## Safety boundary

- Use loopback Anvil, chain ID `31337`, synthetic accounts, test ETH, and test assets only.
- Never deploy to a mainnet or public testnet, use a public RPC, or handle a real wallet secret.
- Managed state belongs under `.motorcove/environments/<id>`. Never adopt or reset
  `data/motorcove.sqlite`.
- Do not commit `.motorcove/`, `data/`, local deployment manifests, databases, backups, wallet
  journals, traces, secrets, or environment-specific paths.
- Stop API and Indexer before migration, restore, rebuild, reindex, reconciliation, recovery, or
  reset. Destructive commands require the documented owned-environment and loopback guards.

## Repository boundaries

- `apps/web`: React UI. Features own use cases, capabilities own long-lived wallet and transaction
  state, and `integrations/` owns Wagmi, Viem, HTTP, and persistence adapters.
- `apps/api`: readonly Fastify query API. It may import database reader, environment, and type
  surfaces only.
- `apps/indexer`: chain ingestion and projections. Domain projectors stay pure and do not import
  Viem, SQLite, React, or wall-clock time.
- `packages/api-contracts`: Zod and generated OpenAPI provider contract.
- `packages/chain-artifacts`: generated ABI and deployment-manifest contracts.
- `packages/database`: the only database package and migration history. Consumers use only
  `reader`, `projection-writer`, `maintenance`, `environment`, and `types` public exports.
- `chain`: Solidity contracts, deployment scripts, and Foundry tests.
- `tooling`: project-owned generation, architecture, documentation, database, and seed commands.
- `tests`: cross-package integration, E2E, migration, database, seed, and recovery evidence.

Do not add a second database package, migration runner, seed path, reset path, or projection writer.
Do not deep-import package source or make one application import another application's source.
Run `pnpm check:architecture` after changing imports or public surfaces; add a failing negative
fixture when introducing a new dependency rule.

## State and recovery rules

- Keep transaction, receipt, sale, payment claim, and projection states separate.
- A successful receipt does not prove projection convergence. A stale projection is not a reason to
  resubmit a transaction.
- Browser recovery is read-only. It must not reach a wallet-write port.
- Preserve historical receipt and event evidence when a transaction becomes noncanonical; derive
  current success from current transaction, receipt, and projection evidence together.
- Temporary RPC transport failures keep the checkpoint, mark the read model stale, and retry with
  bounded backoff. Confirmed hash discontinuity or a provider-confirmed missing checkpoint block
  requires recovery.
- Rebuild uses verified local raw evidence. Reindex revalidates canonical chain evidence. Both use
  the exclusive maintenance gate and durable operation marker and preserve catalog authority.
- Migration, seed, bootstrap, restore, reset, rebuild, reindex, and reconciliation are distinct
  operations. Never rewrite an applied migration or clear `maintenance.json` by hand.

## Provider changes

Treat ABI/events, OpenAPI schemas, database schema and exports, projector/scope versions, deployment
manifest semantics, commands, and scenario/evidence metadata as provider contracts. A provider
change includes every affected consumer, generated artifact, compatibility test, runbook, and
status/evidence update in the same delivery.

Run `pnpm generate` after Solidity, API schema, or generated metadata changes. Commit deterministic
generated artifacts and use `pnpm generate:check` to detect drift.

## Toolchain and commands

Use the pinned versions from `.nvmrc`, `package.json`, `pnpm-lock.yaml`, and
`chain/foundry.toml`: Node 24.21.0, pnpm 12.5.1, and Foundry/Anvil 1.8.3.

```bash
nvm use
pnpm install --frozen-lockfile
pnpm doctor
```

Start with the narrowest affected check, then run the relevant gate:

```bash
pnpm test:contracts
pnpm test:components
pnpm test:migrations
pnpm test:db
pnpm test:seeds
pnpm test:recovery
pnpm test:integration
pnpm docs:check
pnpm check:architecture
```

Before delivery, run:

```bash
pnpm verify
pnpm test:e2e
```

`pnpm docs:smoke` is a temporary SQLite-only contributor smoke test. Full browser evidence uses a
fresh harness-owned Anvil, managed environment, Indexer, API, and Web through `pnpm test:e2e`.

## Documentation and evidence

- Public documentation is English except files whose names explicitly mark another language, such
  as `README.zh-TW.md` and `walkthrough.zh-TW.md`.
- Keep bilingual entry points structurally aligned when changing shared claims or commands.
- Keep requirement, implementation, and executed verification status separate. A source file or
  test existing is not evidence that it passed.
- Update command metadata, capability metadata, scenarios, status, runbooks, and verification
  records when their source behavior changes.
- Run `pnpm docs:generate` after changing `docs/_meta/*.json`, then run `pnpm docs:check`.
- Record the exact command, environment, result, source revision or fingerprint, and limitations.
  Never report a skipped or not-run gate as passed.

## Git and review

- Follow the branch policy in [CONTRIBUTING.md](CONTRIBUTING.md). Never create a `codex/` branch.
- Do not commit or push unless the user authorizes it. Never force-push.
- Stage only intended files. Keep investigation logs, temporary reports, databases, and generated
  runtime state out of commits.
- A change is ready only when affected provider-consumer contracts, recovery impact, migration and
  data-retention impact, generated artifacts, focused tests, full required gates, and documentation
  evidence have been reviewed.
