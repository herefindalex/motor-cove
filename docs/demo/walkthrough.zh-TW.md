# Demo 操作指南

[English](walkthrough.md)

本指南涵蓋正常交易、故障恢復證據與團隊交付邊界。請先依
[本機開發 runbook](../runbooks/local-development.md)建立新的 owned environment。不要 reset
既有環境，也不要把未實際執行的情境當成驗證證據。

## 1. 使用本地 demo wallet 完成一筆交易

**狀態：**Playwright 已對真實本機 Anvil、Indexer、SQLite、API 與 Web 程序執行此路徑。
Connector 使用 Anvil 已解鎖的測試帳號；這不是 MetaMask 測試。

以 `VITE_MOTORCOVE_DEMO_WALLET=1` 啟動 `dev:full`，然後開啟
<http://127.0.0.1:5173>。

1. 選擇 **Use local buyer**。
2. 找到 `LISTED` 狀態的 **Apex GT**，按下 **Fund exactly**。
3. 觀察 transaction timeline 分別顯示 wallet request、transaction hash、receipt 與
   projection evidence，並等待卡片顯示 `FUNDED`。
4. 按下 **Complete sale** 並等待 `COMPLETED`。Complete 會轉移 NFT 並建立 seller proceeds
   claim，不會同時提領款項。
5. 按下 **Disconnect**，選擇 **Use local seller**，再按 **Withdraw proceeds**。
6. 確認 seller claim 顯示 `WITHDRAWN`。

畫面應分別呈現 transaction timeline、sale state、claim state 與 indexed block。Receipt
成功可能早於 Indexer projection 追上鏈頭。

## 2. 其他合約結果

- **Approve 與 listing：**以 seller 連線，先 approve 尚未進入 escrow 的資產；等待 inclusion
  後再 create sale。這是兩筆不同交易。
- **Cancel 與 reclaim：**seller cancel `LISTED` sale，之後再獨立 reclaim NFT。
- **Expire、refund 與 reclaim：**buyer fund 後，把本地 Anvil 時間推進到期限之後；任一帳號
  可 expire。Buyer withdraw refund，seller 再獨立 reclaim NFT。

以上路徑對應 [scenario catalog](../testing/scenario-catalog.md) 的 `SALE-001` 到 `SALE-005`。

## 3. 故障與恢復路徑

**狀態：**自動化證據涵蓋受控 wallet rejection、單次 broadcast 後遺失 response、唯讀 hash
recovery、projection stale/catch-up、SQLite rebuild/reindex、process-kill recovery 與
reconciliation。實際瀏覽器錢包的故障行為仍未人工驗證。

1. 執行 Playwright rejection 情境，確認拒絕顯示 `REJECTED`，不是 `SUBMITTED` 或 `UNKNOWN`。
2. 只停止受管理的 Indexer。API 可以繼續讀取最後 snapshot，但必須顯示 lag，不能宣稱 current。
3. 對本地 Anvil 送出交易並保留 hash。Receipt evidence 可以領先 projection state。
4. Reload journal 後使用 **Recheck evidence**。Recovery 必須驗證 account、contract、calldata、
   value、receipt、matching event 與 projection，而且不再次送交易。
5. 恢復同一個 Indexer，確認狀態收斂且沒有第二次付款。

以下聚焦測試會建立自己的暫存環境與 ports：

```bash
pnpm vitest run tests/integration/transaction-convergence.test.ts
pnpm vitest run tests/integration/indexer-kill-recovery.test.ts
```

## 4. 團隊交付路徑

從 `SALE-002` 等 scenario 開始，沿著 contract ABI、frontend gateway、Indexer
decoder/projector、API response 與文件證據追蹤。宣稱 ready 前應檢查 negative architecture
fixtures、consumer tests、generated artifacts 與 migration gates。交接欄位與證據格式見
[delivery workflow](../collaboration/delivery-workflow.md)。

## 清理

只停止本次 demo 啟動的程序。若失敗狀態仍需診斷，請保留該 environment。暫存測試會清除
自己的 roots。破壞性的 demo reset 只適用於可丟棄且由 MotorCove 管理的環境，並須依
[本機 reset runbook](../runbooks/local-reset.md)執行。
