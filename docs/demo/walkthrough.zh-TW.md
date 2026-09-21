# Demo walkthrough

[English](walkthrough.md)

這份指南提供交易、故障恢復與團隊交付三條展示路徑。先依
[本機開發 runbook](../runbooks/local-development.md)建立新的 owned environment；不要 reset
既有環境，也不要把未實際執行的情境當成證據。錢包只匯入 Anvil 顯示的測試帳號。

## 1. 核心交易路徑

**狀態：**目前 contract、real-stack 與 Playwright 執行紀錄已涵蓋這條路徑；手動 MetaMask
仍未驗證。

1. `SALE-001`：Seller 對未上架 NFT 執行 approve，receipt 成功後再 create sale；兩者是
   兩筆交易，custody 只在 create sale 成功後開始。
2. `SALE-002`：Buyer 以精確價格 fund；transaction receipt、sale state 與 API projection
   provenance 必須分開顯示。
3. `SALE-003`：Buyer complete 後取得 NFT，Seller 之後再以獨立交易 withdraw proceeds。
4. `SALE-004`：Seller cancel LISTED sale，之後再以獨立交易 reclaim NFT。
5. `SALE-005`：Buyer fund 後執行 `pnpm demo:advance-time --seconds 301`；任一帳號送出
   expire，Buyer withdraw refund，Seller 另行 reclaim NFT。

畫面應能分別看到 transaction timeline、sale state、claim state 與 projection block。
Receipt success 不代表 Indexer 已追上，`COMPLETED` 也不代表 Seller 已提領。

## 2. 故障與恢復路徑

**狀態：**測試錢包拒絕、Indexer stale/catch-up、SQLite rebuild、reindex 與 reconciliation
已有目前工作樹的自動化證據；ambiguous post-broadcast 與較廣的故障注入仍是缺口。

1. 觸發測試錢包拒絕，確認 UI 顯示 `REJECTED`，而不是 `SUBMITTED` 或 `UNKNOWN`。
2. 只停止受管理的 Indexer；API 可繼續提供最後 snapshot，畫面顯示 lag／`STALE`。
3. 重啟 Indexer，確認 checkpoint catch-up，且不需要再次付款。
4. 停止 API 與 Indexer 後，依[恢復流程](../flows/indexing-and-recovery.md)選擇 catch-up、
   rebuild 或 reindex。
5. Indexer 停止時可執行 `pnpm ops:reconcile`；API 與 Indexer 都停止時才執行
   `pnpm ops:rebuild` 或其他 maintenance command。

Maintenance command 存在不代表每一種故障都已驗證。遇到 deployment、schema、history、
anchor 或 maintenance marker 不一致時應停止，不要自動修補。

## 3. 團隊交付路徑

**狀態：**這是可使用的 repository planning artifact，不是實際多人團隊經歷證據。

1. 從 [`SALE-002` work package](../collaboration/delivery-workflow.md)開始。
2. 沿 protocol ABI 追到 frontend gateway、Indexer decoder/projector 與 API consumer。
3. 檢查 negative architecture fixtures、consumer tests、generated artifacts 與 migration gate。
4. 使用 async handoff template 記錄 ready work、blocker、acceptance 與實際執行證據。

## 清理

只停止本次 demo 啟動的 processes。自動化測試會清理自己的 temporary roots；若環境是故障
證據則先保留。只有可丟棄的 owned environment 才能執行：

```bash
MOTORCOVE_ENV=demo-local pnpm demo:reset -- --yes
```

Reset 會驗證 loopback Anvil、chain ID 與 owned paths，呼叫 `anvil_reset`，再移除所選環境的
generated state；它不會接管 `data/motorcove.sqlite`。詳見[本機 reset](../runbooks/local-reset.md)
與[驗收證據](acceptance-evidence.md)。
