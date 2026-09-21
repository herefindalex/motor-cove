# Contributor onboarding

This page helps each engineering role find a safe first task, the contract it may change, and the
smallest meaningful verification. Start with [CONTRIBUTING](../../CONTRIBUTING.md) and the
[project scope](../project-scope.md).

## Frontend

1. Trace the marketplace route from `apps/web/src/app/App.tsx` into a feature public index.
2. Add an isolated UI state to a Storybook story without importing an SDK into feature/model code.
3. Run web typecheck, Storybook build, architecture checks, and the relevant browser scenario.

Shared contracts: API Zod schemas, chain ABI, deployment config, transaction journal schema.

## Protocol

1. Read `IMotorCoveEscrow.sol`, implementation, unit tests, and invariant handler together.
2. Add an error-path test before changing a transition or asset transfer.
3. Regenerate ABI artifacts and list affected frontend, decoder, projector, and docs consumers.

Shared contracts: ABI, events, custom errors, manifest protocol version.

## API and backend

1. Trace `/v1/sales/{saleId}` through route, use case, reader port, presenter, and Zod schema.
2. Add a response-field test before changing a wire schema.
3. Keep the API reader-only and never import projection writer or maintenance exports.

Shared contracts: API schemas/OpenAPI and database reader DTOs.

## Indexer

1. Follow one event from Viem decode through a pure projector into the SQLite adapter.
2. Add a pure projector test for invalid ordering or an ingestion test with a controlled boundary.
3. Preserve ordering, source identity, atomic checkpoint behavior, and detect-and-stop semantics.

Shared contracts: ABI events, projector version, log scope, database projection writer.

## Database and operations

1. Run the four temporary database suites; do not point exercises at the existing workspace DB.
2. Change the Drizzle schema and generate one reviewed forward migration plus schema contract.
3. Test fresh install, history tampering, constraints, locks, marker, and restore boundaries.

Shared contracts: SQL history, schema contract, package exports, environment layout, root commands.

## QA and delivery

1. Map a scenario ID to its source, test selector, environment level, and limitation.
2. Add a negative fixture that proves a new checker rule can fail.
3. Keep local, real SQLite, real Anvil, browser automation, and manual wallet evidence separate.

Continue with [change recipes](change-recipes.md), [scenario catalog](../testing/scenario-catalog.md),
and [ownership](../collaboration/ownership-and-contracts.md).
