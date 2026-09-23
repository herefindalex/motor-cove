# ADR 0008：驗證復原來源並序列化瀏覽器日誌寫入

[English](0008-recovery-source-and-browser-journal-integrity.md) · [简体中文](0008-recovery-source-and-browser-journal-integrity.zh-CN.md)

- **狀態：**已接受
- **範圍：** 投影重建、資料庫復原、交易回執觀察、瀏覽器日誌

## 背景

恢復命令比普通的失敗請求更具破壞性。重建取代來自儲存事件日誌的衍生行，恢復取代活動資料庫檔案。在更改活動狀態之前，這兩個操作都需要證明其來源的身份和完整性。

瀏覽器事務恢復也有類似的所有權問題。每個受支援的寫入操作都會在打開錢包之前記錄一個意圖，但多個選項卡共用一個 `localStorage` 日誌。全數組讀寫不是跨表事務。

## 決定

投影攝取記錄綁定每個原始日誌信封、標準化事件和解碼器版本的摘要。重建在刪除任何投影行之前會驗證規範區塊連續性、掃描完成、檢查點覆蓋、每個事件計數和摘要、原始包絡摘要、解碼器版本和綁定來源記錄摘要。遺失或更改的來源證據無法關閉，需要重新索引。

備份格式 2 記錄部署 ID 以及部署、引導程式和種子 sidecar 的存在和 SHA-256 摘要。復原會在隔離開始之前驗證該證據並將備份部署與活動資料庫和活動部署清單進行比較。復原仍然是一個資料庫操作；它不會重置鍊或重播鏈種子寫入。

運行時投影儲存保留嚴格的投影器和日誌範圍閘。維護結構僅接受指定的先前投影器版本。日誌範圍變更僅適用於從部署掃描開始重新索引，其中舊的規範來源實際上已刪除並重新取得。

已知哈希收據觀察適用於每個支援的交易操作。資金保留其額外的 `SaleFunded` 事件和投影效果檢查。其他操作在規範接收成功或恢復時停止，且不聲明 Sale、付款或投影狀態已收斂。

瀏覽器日誌寫入使用 Web Locks API，每個部署都有一把鎖。應用程式在打開錢包之前等待預提交寫入。本機 Promise 佇列僅在沒有 Web Locks 的環境中使用，例如單元測試。較新的相同操作證據不能被較舊的寫入覆蓋。

## 後果

- 沒有綁定來源證據的遺留事件行無法重建；操作員必須重新索引它。
- 在檔案切換之前，遺失、變更或與部署不相容的 sidecar 的備份將被拒絕。
- 非資金交易狀態可以在重新加載後恢復，而無需製造業務狀態成功。
- 同一瀏覽器設定檔中的選項卡保留不同的操作，並在編寫者時釋放所有權
  選項卡關閉。跨裝置協調不在本機瀏覽器日誌合約之外。

## 程式碼和測試

- `apps/indexer/src/adapters/sqlite/sqlite-projection-store.ts`
- `apps/indexer/src/application/reindex-target.ts`
- `packages/database/src/maintenance/backup.ts`
- `packages/database/src/maintenance/restore.ts`
- `apps/web/src/integrations/evm/inspect-transaction.ts`
- `apps/web/src/integrations/persistence/local-storage-journal.ts`
- `tests/integration/indexer-store.test.ts`
- `tests/recovery/backup-restore.test.ts`
- `tests/e2e/journal-multitab.spec.ts`
