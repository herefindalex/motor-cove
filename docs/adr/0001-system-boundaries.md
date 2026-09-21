# ADR 0001: Modular system and authority boundaries

- **Status:** accepted and implemented
- **Scope:** runtime processes, frontend modules, and state authority

## Context

MotorCove needs realistic frontend, backend, chain, and recovery boundaries without turning a local
sandbox into a distributed platform. Wallet observations, contract state, and query projections can
temporarily disagree, so one shared application state would hide failure modes.

## Decision

Use a modular monorepo with three runtime processes: Web, readonly API, and Indexer. Solidity
contracts execute on local Anvil. SQLite is shared by the API and Indexer on one host through narrow
`@motorcove/database` exports.

The Web uses feature, capability, port, and integration layers with manual composition. The wallet
owns user authorization; contracts own custody, sale transitions, and claims; transaction receipts
are observations; the Indexer owns projection writes; the API owns readonly presentation.

## Why

This structure exposes the interfaces a real team would coordinate around while keeping deployment
and operations small enough for a deterministic local demo. Separate state families prevent a
successful receipt from being presented as an up-to-date API result or a completed sale as a paid
seller.

## Trade-offs

- Separate processes and provider contracts add setup and compatibility work to a small product.
- Manual dependency injection is explicit but more verbose than importing adapters in feature code.
- Local files and locks keep operations inspectable but prevent arbitrary cross-host deployment.

## Consequences

Static architecture checks reject cross-layer imports and deep package access. Provider changes to
ABI, HTTP schemas, database exports, projector identity, or deployment manifests require consumer
review and targeted tests. Wallet connection is not backend authentication or key custody.

## Code and tests

- `apps/web/src/app/composition.tsx`, `apps/api/src`, and `apps/indexer/src`
- `packages/api-contracts`, `packages/chain-artifacts`, and `packages/database`
- `tooling/architecture/check.mjs` and its negative fixtures
- [Runtime architecture](../architecture/overview.md) and
  [dependency rules](../architecture/dependency-rules.md)
