# ADR 0002：託管保管、本機儲存和明確恢復

[English](0002-custody-storage-recovery.md) · [简体中文](0002-custody-storage-recovery.zh-CN.md)

- **狀態：** 在記錄的當地限制內接受並實施
- **範圍：**資產託管、債權、SQLite所有權、Indexer追償

## 背景

NFT 或付款簽訂合約後，銷售可能會失敗。接收者可以拒絕 ETH 或 NFT。事件投影可以在儲存來源證據之後但在讀取模型為目前之前停止。該資料庫還包含無法從鏈日誌重新建立的目錄資料。

## 決定

僅在建立銷售時才將 NFT 轉入託管。完成、取消、到期設定結算結果；賣方收益或買方退款使用拉取索賠； NFT 交付或回收是單獨的可重試操作。

將同一台主機 SQLite WAL 與一個投影編寫器和維護排除一起使用。將目錄行視為鏈外權威來源，將事件派生行視為可重建的投影。檢測檢查點或規範歷史不符並停止。對故障進行分類後，操作員可以選擇追趕、重建、重新索引、復原或新部署。 對帳在一個區塊/哈希上進行比較，並且從不自動修復狀態。

## 為什麼

拉取索賠和單獨的 NFT 傳輸可以讓失敗的接收者重試，而無需回滾記錄的銷售結果。混合權威來源在投影重建期間保持目錄編輯的安全。偵測並停止可以避免在本地鏈重置期間默默地選擇規範分支或銷毀證據。

## 權衡

- 結算需要額外的用戶交易進行提現、退款和代幣回收。
- SQLite WAL 和諮詢檔案鎖定僅限於一台主機和受信任的本機進程。
- 恢復需要操作人員分類和停機；不存在自動通用重組修復。
- 對帳透過錨定合約計數器列舉銷售和鑄造的代幣；它仍然
  取決於該區塊的歷史 RPC 讀取。

## 後果

Sale 狀態、聲明狀態、代幣回收、交易觀察和投影新鮮度在 UI、API 和測試中保持獨立。重建保留目錄資料。重置、遷移、復原、重建和重新索引仍然是不同的受保護命令。重建和重新索引使用專有的維護門和耐用的操作標記。當所選鏈歷史具有相同的區塊雜湊時，重新索引恢復規範成員資格並重新應用已儲存的事件；來源證據仍然只是附加的。

## 程式碼和測試

- `chain/src/MotorCoveEscrow.sol` 和 `chain/test`
- `packages/database/src` 和 `apps/indexer/src`
- `tests/integration/indexer-store.test.ts`、`tests/integration/real-stack.test.ts` 和
  `tests/integration/reindex-canonical.test.ts`
- `tests/recovery/backup-restore.test.ts` 和 `tests/database/projection-maintenance.test.ts`
- [託管協定](../protocol/escrow.zh-TW.md)、[資料庫架構](../architecture/database.zh-TW.md)、
  和[索引恢復](../flows/indexing-and-recovery.zh-TW.md)
