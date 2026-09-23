# 如何在本地檢查MotorCove

[English](local-development.md) · [简体中文](local-development.zh-CN.md)

使用此 Runbook 來檢查原始程式碼、執行安全性檢查並啟動新的隔離本機堆疊。

## 先決條件

在 Linux 或 WSL2 使用 Node 24.21.0、pnpm 12.5.1、Foundry/Anvil 1.8.3 與 SQLite 3。此環境不得使用公用 RPC URL、真實金鑰、真實 ETH 或有價值資產。

## 安全檢查

```bash
nvm use
pnpm install --frozen-lockfile
pnpm doctor
pnpm docs:check
pnpm db:check
```

這些命令不會啟動 Anvil 或開啟現有的 MotorCove 資料環境。 `db:check` 使用臨時 SQLite 資料庫。

## 開始一個孤立的演示

選擇一個新的環境 ID。運行時狀態寫在`.motorcove/environments/<id>`下；部署清單是產生的本機工件。不要採用或重置現有資料庫。

1 號航廈：

```bash
nvm use
export MOTORCOVE_ENV=demo-local
pnpm dev:chain
```

Anvil準備好後，終端機2：

```bash
nvm use
export MOTORCOVE_ENV=demo-local
pnpm dev:bootstrap
VITE_MOTORCOVE_DEMO_WALLET=1 pnpm dev:full
```

開啟<http://127.0.0.1:5173>。明確示範標誌新增了 **使用本地賣家** 和 **使用本地買家** 連接器。他們使用解鎖的Anvil帳戶，並透過Wagmi和Viem發送真實交易。僅 Vite 開發伺服器遵循該標誌，如果其 RPC 不是環回，則啟動失敗。捆綁包中僅存在公共測試地址；沒有嵌入私鑰。

API 預設接受這個確切的瀏覽器來源。如果故意從不同的來源提供 UI，請在啟動 API 之前將 `MOTORCOVE_WEB_ORIGIN` 設定為該來源。 `localhost` 拼字是不同的來源，預設 CORS 策略不允許。

測試注入錢包時，將 `VITE_MOTORCOVE_DEMO_WALLET` 保持未設定狀態。使用 RPC `http://127.0.0.1:8545`、鏈 ID `31337` 和 Anvil 測試帳戶配置此錢包。

## 按一下完成的銷售路徑

1. 選擇**使用本地買家**。
2. 在 **Apex GT** 上，按一下 **準確資金** 並等待 `FUNDED`。
3. 點選**完成銷售**，等待`COMPLETED`。
4. 點擊**斷開連線**，然後點擊**使用本地賣家**。
5. 點擊**提現收益**並等待`WITHDRAWN`。

交易時間軸將錢包請求、提交的雜湊值、收據和投影證據顯示為單獨的狀態。請依照[示範演練](../demo/walkthrough.zh-TW.md) 了解其他銷售結果。

## 停止條件

只有當引導程式記錄了部署身分、目錄綁定、目標區塊/雜湊、一次性追趕及其在同一擁有環境中的接收後，完整的本地演示才準備就緒。在部署不匹配、維護標記、未知種子結果、架構/歷史分歧或公共/非環回 RPC 時停止。請參閱[播種和引導](seeding-and-bootstrap.zh-TW.md)、[項目範圍](../project-scope.zh-TW.md) 和[備份和還原](backup-restore-and-recovery.zh-TW.md)。
