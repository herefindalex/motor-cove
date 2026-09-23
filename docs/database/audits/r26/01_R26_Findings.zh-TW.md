# R26 資料庫時間語意與 Schema 完整性稽核

[简体中文](01_R26_Findings.zh-CN.md) · [English matrix](02_Temporal_Semantics_Matrix.md)

## 範圍與結論

本次以 DB-DOC-2 提交 `b18e9416894c924a04ebe550ad97eb22134a9899` 為基線，檢查現行
Drizzle migrations 所產生的 13 個實體表、資料庫模型、writer、reader、Indexer 投影及恢復路徑。
稽核沒有使用使用者既有資料庫、真錢包或公網鏈；實際執行的測試及限制記於
[驗證紀錄](../../../evidence/verification.json)。

**結論：目前沒有足以支持新增資料庫欄位或 migration 的具體需求。** 各投影現值可以透過現有
deployment、block hash、log index、source journal 與 build／scope 身份追溯。任意增加
`created_at` 或 `updated_at` 會混淆鏈上時間、第一次觀察時間與本機重建時間。候選欄位的逐項判定見
[schema 建議](03_Schema_Change_Recommendations.md)。

## 已處理的語意問題

1. **未來的 heartbeat 被誤判為新鮮。** `readSystemRecord()` 原本將負的 heartbeat age 夾成
   0；在受控時鐘與真 SQLite／Fastify reader 測試中，未來一分鐘的 heartbeat 讓
   `observationFreshness` 為 `FRESH`、`lagBlocks` 為 `0`。新增回歸測試先失敗，修正後此證據
   改為 `UNKNOWN`，lag 不再被推定。保留持久化 `projectionStatus`，不改 checkpoint 或
   recovery marker。
2. **`db_contract.verified_at` 的文字太寬。** 實際寫入點是 migration finalization 發布
   已驗證 schema contract；一般唯讀 `verifyDatabase()` 不會刷新它。TypeScript 模型與時間
   語意文件已校正。它不是「任何最近一次讀取檢查」的時間。

## 各表稽核重點

- `catalog_vehicles` 由 seed 插入時設定 `created_at` 與 `updated_at`；同內容重跑不寫入，
  衝突資料會拒絕。新增測試以較早的既有時間驗證重跑後兩欄不變。目前沒有受支援的原位修改流程。`catalog_asset_bindings` 同樣只插入或拒絕
  衝突，seed set 與版本提供邏輯來源，因此不因缺通用時間欄位而新增欄位。
- `chain_events.first_seen_at` 在新 event 插入時設定；同一 event 再被看到時先核對內容並
  保留原值。明確 source-refresh 刪除來源再重新取得時，新 row 的 first-seen 是重新取得時間。
  `indexed_blocks.block_timestamp` 是 header 所給鏈上時間，不是本機觀察時間。
- `sales`、`payment_claims`、`token_ownership` 的現值由 canonical event 決定。事件
  block hash 與 log index 可定位來源，相關 block 時間可由 `indexed_blocks` 取得；本機
  `Date.now()` 不應成為重建後投影欄位。
- `indexer_checkpoint.updated_at` 是本機游標 mutation；它在一般提交與維護時可能更新，
  不代表新的 RPC 觀察。`indexer_runtime_status` 分別持有 worker、RPC 與 observed-head
  時間，reader 必須限制這些證據的新鮮度。
- `reconciliation_runs.created_at` 是報告組裝並寫入時的 publication clock；報告仍綁定
  原來的 block、scope 與 projection build，不會因為新報告或 restore 繼承新的來源身份。

逐表分類、來源定位及建議請見[時間語意矩陣](02_Temporal_Semantics_Matrix.md)。本次不修改實體
schema；未來若有新需求，須依[遷移風險評估](04_Migration_Risk_Assessment.md)與
[回歸測試計畫](05_Regression_Test_Plan.md)先證明新增欄位的價值。
