# Contributing to MotorCove

MotorCove accepts changes that preserve its local-only safety boundary and explicit
provider-consumer contracts. The repository is licensed under the Apache License 2.0; review
[LICENSE](LICENSE) before submitting external work.

## Prerequisites

- Linux or WSL2
- Node 24.21.0 selected through `.nvmrc`
- pnpm 12.5.1 through Corepack
- Foundry/Anvil 1.8.3 for contract or real-chain tests

Install dependencies with `pnpm install --frozen-lockfile`. Never use a public RPC, a real wallet
secret, real ETH, or a valuable asset.

## Choose a change path

Read the [role onboarding](docs/onboarding/README.md) and the matching
[change recipe](docs/onboarding/change-recipes.md). Shared provider contracts include ABI/events,
HTTP/OpenAPI schemas, database schema and exports, projector and scope versions, and the deployment
manifest.

Use a focused branch from the latest upstream default branch. Use `feature/<behavior>` or
`fix/<root-cause>` and never a `codex/` prefix. Preserve unrelated working-tree edits.

## Local checks

Run the narrow test first, then the affected gate:

```bash
pnpm docs:check
pnpm check:architecture
pnpm verify
pnpm test:e2e
```

Database changes also run `test:migrations`, `test:db`, `test:seeds`, and `test:recovery` in
temporary environments. A skipped, source-inspected, mocked, or not-run check is never reported as
passed.

## Code boundaries

- Web features use capability public APIs and ports; SDK adapters live under `integrations`.
- The API may use only database reader/types exports and remains readonly.
- Indexer domain/projectors do not import Viem, SQLite, React, or wall-clock time.
- Runtime processes do not migrate, seed, restore, or reset.
- Do not deep-import package source, invent SQL chain state, or bypass project migration commands.
- The repository has one database package, schema, migration runner, seed path, and guarded reset.
  Do not create a parallel database management path.

## Pull request checklist

- Name the affected scenario and capability IDs.
- Describe provider artifact changes and every affected consumer.
- State migration, rebuild, data retention, rollback/restore, and deployment compatibility impact.
- Include commands actually executed, environment, results, and limitations.
- Update references, recipes, status, and evidence metadata when ABI/API/DB/CLI/projector behavior
  changes.
- Redact secrets, wallet material, local traces, databases, backups, and environment-specific paths.

ABI changes need Protocol and affected-consumer review. API changes need API and Frontend review.
Database changes need Database, API, Indexer, and QA review. These are project policies; local CI
cannot prove remote required-review settings. `.github/CODEOWNERS` remains empty until real GitHub
identities are supplied.
