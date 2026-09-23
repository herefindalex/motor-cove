# 為 MotorCove 做出貢獻

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING.zh-CN.md)

MotorCove 接受保留其僅限本地的安全邊界和明確的提供者-消費者合約的變更。該儲存庫已根據 Apache License 2.0 獲得許可；在提交外部作品之前查看 [許可證](LICENSE)。

## 先決條件

- Linux 或 WSL2
- 透過 `.nvmrc` 選擇 Node 24.21.0
- pnpm 12.5.1 至 Corepack
- Foundry/Anvil 1.8.3 用於合約或實鏈測試

使用 `pnpm install --frozen-lockfile` 安裝相依性。切勿使用公開的 RPC、真實的錢包秘密、真實的 ETH 或有價值的資產。

## 選擇改變路徑

閱讀[角色入門](docs/onboarding/README.zh-TW.md) 和匹配的[更改配方](docs/onboarding/change-recipes.zh-TW.md)。共享提供者合約包括 ABI/事件、HTTP/OpenAPI 架構、資料庫架構和匯出、投影器和範圍版本以及部署清單。

使用最新上游預設分支中的焦點分支。使用 `feature/<behavior>` 或 `fix/<root-cause>`，切勿使用 `codex/` 字首。保留不相關的工作樹編輯。

## 本地檢查

首先執行窄測試，然後執行受影響的門：

```bash
pnpm docs:check
pnpm check:architecture
pnpm verify
pnpm test:e2e
```

資料庫變更還在臨時環境中執行 `test:migrations`、`test:db`、`test:seeds` 和 `test:recovery`。跳過的、來源檢查的、模擬的或未運行的檢查永遠不會被報告為已通過。

## 程式碼邊界

- Web 功能使用功能公共 API 和連接埠； SDK 適配器位於 `integrations` 下。
- API 只能使用資料庫讀取器/類型匯出並保持唯讀。
- Indexer 域/投影器不匯入 Viem、SQLite、React 或掛鐘時間。
- 運行時進程不會遷移、播種、復原或重設。
- 不要深度導入包源、發明SQL鏈狀態或繞過專案遷移指令。
- 該儲存庫具有資料庫包、架構、遷移運行器、種子路徑和受保護的重設。
  不要建立並行資料庫管理路徑。

## 拉取請求清單

- 命名受影響的場景和功能 ID。
- 描述提供者工件的變更和每個受影響的消費者。
- 狀態遷移、重建、資料保留、回滾/復原和部署相容性影響。
- 包括實際執行的命令、環境、結果和限制。
- 當 ABI/API/DB/CLI/投影器行為時更新參考、配方、狀態和證據元數據
  變化。
- 編輯秘密、錢包材料、本地追蹤、資料庫、備份和特定於環境的路徑。

ABI 變更需要協議和受影響的消費者審查。 API 變更需要 API 和前端審核。資料庫變更需要資料庫、API、Indexer 和 QA 審核。這些是專案政策；本地 CI 無法證明遠端所需審核設定。在提供真實的 GitHub 身份之前，`.github/CODEOWNERS` 保持為空。
