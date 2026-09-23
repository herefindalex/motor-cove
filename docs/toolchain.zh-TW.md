# 工具鏈

[English](toolchain.md) · [简体中文](toolchain.zh-CN.md)

於 2026 年 9 月 21 日在 Linux x86_64 上進行檢查。版本來源為`package.json`、`pnpm-lock.yaml`、`.nvmrc`、`chain/foundry.toml`，以及直接本地工具輸出。正在安裝的版本並不意味著每個產品路徑都已使用它重新運行。

| 工具              | 版本    | 來源和作用                           |
| ----------------- | ------- | ------------------------------------ |
| Node.js           | 24.21.0 | `.nvmrc` 和本地運行時                |
| pnpm              | 12.5.1  | 根`packageManager`；工作區和鎖定文件 |
| TypeScript        | 5.9.3   | 根發育依賴；嚴格的配置               |
| React             | 19.3.0  | Web UI 運行時                        |
| Vite              | 8.3.0   | 網路建置/開發伺服器                  |
| Wagmi             | 3.7.7   | 注入錢包整合加上明確環回演示連接器   |
| Viem              | 2.56.8  | Web 中的 EVM 用戶端、Indexer 和工具  |
| TanStack Query    | 5.103.1 | 瀏覽器API查詢快取                    |
| Fastify           | 5.12.5  | 查詢API運行時                        |
| Zod               | 4.6.5   | 傳輸資料與部署結構定義               |
| better-sqlite3    | 13.0.3  | 本機同步 SQLite 驅動程式             |
| SQLite 引擎       | 3.53.4  | 此環境下透過better-sqlite3上報       |
| Drizzle ORM       | 0.45.2  | 資料庫架構和適配器依賴性             |
| Drizzle Kit       | 0.31.10 | 固定遷移工件產生器                   |
| Solidity          | 0.8.24  | Foundry 配置中的精確編譯器           |
| Foundry / Anvil   | 1.8.3   | 本地合約/測試工具鏈                  |
| OpenZeppelin 合約 | 5.6.1   | ERC-721、所有權和可重入原語          |
| Vitest            | 5.0.1   | 單元和整合運行器                     |
| Playwright        | 1.63.0  | 瀏覽器E2E運行器                      |
| Storybook         | 10.6.0  | 隔離的 UI 開發                       |

在 pnpm 策略下，工作區將 `react-docgen` 覆蓋為 8.0.2。在固定之前，從 npm 註冊表檢查了 Drizzle 軟體包版本。沒有記錄本機 Windows、macOS、網路檔案系統 SQLite 或公共鏈相容性運作。

請參閱[技術選擇](technology-choices.zh-TW.md) 以了解責任和權衡。
