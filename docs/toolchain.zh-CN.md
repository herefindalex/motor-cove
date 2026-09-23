# 工具链

[English](toolchain.md) · [繁體中文](toolchain.zh-TW.md)

于 2026 年 9 月 21 日在 Linux x86_64 上进行检查。版本来源为`package.json`、`pnpm-lock.yaml`、`.nvmrc`、`chain/foundry.toml`，以及直接本地工具输出。正在安装的版本并不意味着每个产品路径都已使用它重新运行。

| 工具              | 版本    | 来源和作用                           |
| ----------------- | ------- | ------------------------------------ |
| Node.js           | 24.21.0 | `.nvmrc` 和本地运行时                |
| pnpm              | 12.5.1  | 根`packageManager`；工作区和锁定文件 |
| TypeScript        | 5.9.3   | 根发育依赖；严格的配置               |
| React             | 19.3.0  | Web UI 运行时                        |
| Vite              | 8.3.0   | 网络构建/开发服务器                  |
| Wagmi             | 3.7.7   | 注入钱包集成加上显式环回演示连接器   |
| Viem              | 2.56.8  | Web 中的 EVM 客户端、Indexer 和工具  |
| TanStack Query    | 5.103.1 | 浏览器API查询缓存                    |
| Fastify           | 5.12.5  | 查询API运行时                        |
| Zod               | 4.6.5   | 传输数据与部署结构定义               |
| better-sqlite3    | 13.0.3  | 本机同步 SQLite 驱动程序             |
| SQLite 引擎       | 3.53.4  | 该环境下通过better-sqlite3上报       |
| Drizzle ORM       | 0.45.2  | 数据库架构和适配器依赖性             |
| Drizzle Kit       | 0.31.10 | 固定迁移工件生成器                   |
| Solidity          | 0.8.24  | Foundry 配置中的精确编译器           |
| Foundry / Anvil   | 1.8.3   | 本地合约/测试工具链                  |
| OpenZeppelin 合约 | 5.6.1   | ERC-721、所有权和可重入原语          |
| Vitest            | 5.0.1   | 单元和集成运行器                     |
| Playwright        | 1.63.0  | 浏览器E2E运行器                      |
| Storybook         | 10.6.0  | 隔离的 UI 开发                       |

在 pnpm 策略下，工作区将 `react-docgen` 覆盖为 8.0.2。在固定之前，从 npm 注册表检查了 Drizzle 软件包版本。没有记录本机 Windows、macOS、网络文件系统 SQLite 或公共链兼容性运行。

请参阅[技术选择](technology-choices.zh-CN.md) 了解责任和权衡。
