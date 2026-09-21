# ADR 0003: Generated contracts, pinned tools, and local-only secrets

- **Status:** accepted and implemented
- **Scope:** ABI/API/deployment compatibility, toolchain reproducibility, secret boundaries

## Context

Frontend and Indexer consumers can compile against stale ABI or HTTP contracts even when their own
source has not changed. A local deployment also needs to prove which bytecode, receipt blocks, ABI,
and database projection it belongs to. Unpinned Node, pnpm, and Foundry versions previously produced
different dependency and artifact behavior.

## Decision

Generate TypeScript ABI from Forge output and OpenAPI from the Zod-backed API contract. Bind each
deployment manifest to protocol version, ABI hashes, deployed runtime code, receipt blocks, scan
scope, and a random deployment identity. Drift checks compare generated artifacts with their
providers, and consumers compile and run against those generated contracts.

Pin Node 24.21.0, pnpm 12.5.1, Solidity 0.8.24, and Foundry/Anvil 1.8.3 in repository configuration
and CI. Support loopback Anvil, synthetic accounts, test ETH, and test assets only. Do not persist a
private key or mnemonic in deployment manifests, frontend configuration, documentation, or evidence.

## Why

Generated contracts reduce hand-copied interface drift. Deployment identity prevents two chains
with the same chain ID or reused addresses from sharing projections or browser journals. Exact local
tools make failures reproducible across contributor and CI environments.

## Trade-offs

- Provider changes regenerate reviewable files and can create larger diffs.
- Exact versions require deliberate upgrades instead of accepting broad semver ranges.
- Local Anvil evidence does not establish public-network finality or hosted-provider compatibility.
- Compatibility checks cover repository consumers, not an unreleased third-party client.

## Consequences

ABI, OpenAPI, schema, and manifest changes trigger generation, consumer typecheck/build, integration
tests, and documentation/evidence review. Remote CI configuration is declared in the repository,
but a workflow file alone is not evidence that GitHub executed it.

## Code and tests

- `tooling/scripts/generate.ts` and `packages/chain-artifacts`
- `packages/api-contracts` and `tests/integration/api-contract.test.ts`
- `packages/chain-artifacts/src/manifest.ts` and `tests/integration/real-stack.test.ts`
- `.nvmrc`, `package.json`, `pnpm-lock.yaml`, `chain/foundry.toml`, and `.github/workflows/ci.yml`
- [Technology choices](../technology-choices.md) and [toolchain evidence](../toolchain.md)
