# ADR 0003：產生的合約、固定工具和僅限本地的機密

[English](0003-compatibility-and-tools.md) · [简体中文](0003-compatibility-and-tools.zh-CN.md)

- **狀態：**已接受並實施
- **範圍：** ABI/API/部署相容性、工具鏈再現性、秘密邊界

## 背景

前端和 Indexer 消費者可以針對過時的 ABI 或 HTTP 合約進行編譯，即使他們自己的原始碼沒有更改。本地部署還需要證明它屬於哪個字節碼、收據區塊、ABI和資料庫投影。 Unpinned Node、pnpm 和 Foundry 版本之前會產生不同的依賴關係和工件行為。

## 決定

從 Forge 輸出產生 TypeScript ABI，從 Zod 支援的 API 合約產生 OpenAPI。將每個部署清單綁定到協定版本、ABI 雜湊值、部署的執行時間程式碼、收據區塊、掃描範圍和隨機部署標識。漂移檢查將產生的工件與其提供者進行比較，消費者根據這些產生的合約進行編譯和運行。

在儲存庫配置和 CI 中固定 Node 24.21.0、pnpm 12.5.1、Solidity 0.8.24 和 Foundry/Anvil 1.8.3。僅支援環回Anvil、合成帳戶、測試ETH、測試資產。不要在部署清單、前端配置、文件或證據中保留私鑰或助記符。

## 為什麼

產生的合約減少了手工複製的界面漂移。部署身分可防止具有相同鏈結 ID 或重複使用位址的兩個鏈結共用投影或瀏覽器日誌。精確的本地工具使故障可以在貢獻者和 CI 環境中重現。

## 權衡

- 提供程式變更會重新產生可審查的文件，並可能創建更大的差異。
- 確切的版本需要刻意升級，而不是接受廣泛的 semver 範圍。
- 本地 Anvil 證據不能確定公共網路的最終性或託管提供者的相容性。
- 相容性檢查涵蓋儲存庫使用者，而不是未發布的第三方客戶端。

## 後果

ABI、OpenAPI、模式和清單變更觸發產生、消費者類型檢查/建置、整合測試和文件/證據審查。遠端 CI 配置在儲存庫中聲明，發布的恢復修訂版通過了它。透過運作與分支保護、所需審查和公共網路證據保持獨立。

## 程式碼和測試

- `tooling/scripts/generate.ts` 和 `packages/chain-artifacts`
- `packages/api-contracts` 和 `tests/integration/api-contract.test.ts`
- `packages/chain-artifacts/src/manifest.ts` 和 `tests/integration/real-stack.test.ts`
- `.nvmrc`、`package.json`、`pnpm-lock.yaml`、`chain/foundry.toml` 和 `.github/workflows/ci.yml`
- [技術選擇](../technology-choices.zh-TW.md) 和[工具鏈證據](../toolchain.zh-TW.md)
