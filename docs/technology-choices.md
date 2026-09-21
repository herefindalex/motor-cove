# Technology choices

This page answers which tools the inspected workspace uses, why each has a bounded role, and which
claims are not implied by installation. Exact versions come from manifests, the lockfile, Foundry
configuration, and local tool output in [toolchain](toolchain.md).

| Technology                            | Actual role and entry                                        | Why here                                                       | Boundary and trade-off                                                                    |
| ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| React 19 + Vite 8 + TypeScript 5.9    | Web runtime and build under `apps/web`                       | Small typed browser surface with fast local build              | Does not own wallet or server state; current browser support was not separately certified |
| Wagmi 3 + Viem 2                      | Injected connector and sole TypeScript EVM client            | Typed RPC, ABI reads/writes, receipts, and logs                | No hosted wallet kit, SIWE, or public-network finality claim                              |
| TanStack Query 5                      | API query cache in web composition                           | Keeps server snapshots outside wallet and form state           | A fresh query is not proof the Indexer reached chain head                                 |
| Fastify 5                             | Local readonly HTTP API                                      | Small explicit composition root and health routes              | Not a settlement engine and not an authentication service                                 |
| Zod 4 + generated OpenAPI             | Browser-safe wire and manifest validation                    | Runtime validation shared by producers and consumers           | Schema validity does not establish data freshness or chain truth                          |
| SQLite 3.53.4 + better-sqlite3 13     | Local mixed-authority database and synchronous transactions  | Good fit for one-host demo and short atomic writes             | Same-host WAL and one writer; no network filesystem support                               |
| Drizzle ORM 0.45.2 + Kit 0.31.10      | Schema and native migration artifacts in `packages/database` | Ordered SQL history and typed schema source                    | Kit does not replace project ownership, lock, or verification guards                      |
| Solidity 0.8.24 + Foundry/Anvil 1.8.3 | Contracts, fuzz/invariant tests, local chain                 | Deterministic local EVM loop with controlled time              | Anvil is not evidence for public-network operations                                       |
| OpenZeppelin 5.6.1                    | ERC-721, ownership, and reentrancy primitives                | Avoids custom token/security primitives                        | Integration still needs MotorCove-specific invariants and tests                           |
| Vitest 5 + React Testing Library 16   | Unit and JSDOM component tests                               | Keeps pure rules separate from rendered component-state checks | JSDOM is not injected-wallet or layout-engine evidence                                    |
| Playwright 1.63                       | Browser E2E against the isolated local stack                 | Covers visible transaction and recovery flows                  | Automated EIP-1193 adapter is not a manual wallet test                                    |
| Storybook 10                          | Isolated UI-state development                                | Shows controlled component states                              | Fixtures are illustrative and are not chain evidence                                      |
| pnpm 12.5.1                           | Pinned workspace package manager                             | Deterministic workspace and lockfile                           | Root scripts remain project commands, not pnpm built-ins                                  |
| GitHub Actions                        | Declared remote CI workflow                                  | Mirrors local verify and E2E gates                             | File presence does not prove a remote run passed                                          |
| TypeScript architecture checker       | Import graph and negative fixtures                           | Enforces selected dependency directions without a framework    | Static imports are checked; runtime isolation still depends on composition                |

Proposed or excluded tools such as Postgres, The Graph, SIWE, Kubernetes, ethers, and RainbowKit are
not part of the implemented stack.
