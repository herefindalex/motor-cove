# Change recipes

This page gives six repeatable paths for common changes. Each recipe names provider and consumer
effects, verification, and current gaps.

## How to add a frontend behavior

1. Put pure rules in the feature model/application and expose them from the feature public index.
2. Add required I/O as a port; implement SDK calls under `apps/web/src/integrations`.
3. Compose in a page or `composition.tsx`; do not import another feature's private file.
4. Add a focused unit or Storybook state and, for wallet effects, a browser scenario.
5. Run `pnpm check:architecture`, web typecheck, and the selected test.

Verify that the transaction journal retains immutable account/chain/contract intent across unmount.

## How to change a contract event or function

1. Update the interface and behavior with unit and invariant assertions.
2. Run `pnpm test:contracts` and `pnpm generate`.
3. Review ABI diff, decoder, projector, frontend gateway, manifest compatibility, and protocol docs.
4. Add real Anvil integration coverage before claiming end-to-end completion.

An ABI fixture can unblock consumer compilation; deployment identity and real E2E remain blocked
until a real local deployment exists.

## How to change an API field

1. Update the Zod contract and OpenAPI generator.
2. Update the reader/presenter and all browser parse points.
3. Add provider and consumer contract tests, then run `pnpm generate:check`.
4. Update API reference and capability limitations.

Changes to `projectorVersion`, `projectionBuildId`, or `logScopeHash` must be coordinated across
database, API, Web, tests, and generated OpenAPI.

## How to change a projector

1. State the old/new event-to-row rule and whether `projectorVersion` changes.
2. Add pure event-order tests and an atomic persistence/replay test.
3. If history must be recomputed, require rebuild before incremental ingestion resumes.
4. Update reconciliation scope, status, runbook, and evidence.

Projectors may not import Viem, SQLite, React, or wall-clock time.

## How to change the database schema

1. Edit `packages/database/src/schema` and run `pnpm db:generate --name <descriptive-name>`.
2. Review SQL, Drizzle metadata, and `schema-contract.json`; never rewrite a shared migration.
3. Run `pnpm db:check`, migration, database, seed, and recovery suites.
4. Record API/Indexer consumer impact, data preservation, rebuild need, and restore path.

Do not use `drizzle-kit push`, hand-edit native history, or point tests at an existing environment.

## How to add or change a recovery command

1. Define when the command applies, which processes stop, and which identity is protected.
2. Acquire service gate, writer lock, then DB connection; write the external marker before changes.
3. Add a controlled crash-window test with a specific oracle.
4. Update command metadata, runbook, DB matrix, and verification record.

Exception rollback, process kill, file-switch interruption, and hardware power loss are different
claims. Record only the level actually exercised.
