# Toolchain

Inspected 2026-09-21 on Linux x86_64. Version sources are `package.json`, `pnpm-lock.yaml`,
`.nvmrc`, `chain/foundry.toml`, and direct local tool output. A version being installed does not mean
every product path has been rerun with it.

| Tool                   | Version | Source and role                                     |
| ---------------------- | ------- | --------------------------------------------------- |
| Node.js                | 24.21.0 | `.nvmrc` and local runtime                          |
| pnpm                   | 12.5.1  | Root `packageManager`; workspace and lockfile       |
| TypeScript             | 5.9.3   | Root development dependency; strict configs         |
| React                  | 19.3.0  | Web UI runtime                                      |
| Vite                   | 8.3.0   | Web build/dev server                                |
| Wagmi                  | 3.7.7   | Injected connector and React wallet integration     |
| Viem                   | 2.56.8  | EVM client in web, Indexer, and tooling             |
| TanStack Query         | 5.103.1 | Browser API query cache                             |
| Fastify                | 5.12.5  | Query API runtime                                   |
| Zod                    | 4.6.5   | Wire and deployment schemas                         |
| better-sqlite3         | 13.0.3  | Native synchronous SQLite driver                    |
| SQLite engine          | 3.53.4  | Reported through better-sqlite3 in this environment |
| Drizzle ORM            | 0.45.2  | Database schema and adapter dependency              |
| Drizzle Kit            | 0.31.10 | Pinned migration artifact generator                 |
| Solidity               | 0.8.24  | Exact compiler in Foundry config                    |
| Foundry / Anvil        | 1.8.3   | Local contract/test toolchain                       |
| OpenZeppelin Contracts | 5.6.1   | ERC-721, ownership, and reentrancy primitives       |
| Vitest                 | 5.0.1   | Unit and integration runner                         |
| Playwright             | 1.63.0  | Browser E2E runner                                  |
| Storybook              | 10.6.0  | Isolated UI development                             |

The workspace overrides `react-docgen` to 8.0.2 under pnpm policy. Drizzle package versions were
checked from the npm registry before pinning. No native Windows, macOS, network-filesystem SQLite,
or public-chain compatibility run is recorded.

See [technology choices](technology-choices.md) for responsibility and trade-offs.
