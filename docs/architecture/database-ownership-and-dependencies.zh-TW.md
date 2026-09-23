# 資料庫所有權和依賴關係

[English](database-ownership-and-dependencies.md) · [简体中文](database-ownership-and-dependencies.zh-CN.md)

此頁面回答哪個團隊角色擁有每個資料庫表面以及哪些使用者可以匯入它。

| 表面                                    | 業主           | 允許消費者            | 禁止的責任                     |
| --------------------------------------- | -------------- | --------------------- | ------------------------------ |
| `@motorcove/database/reader`            | 資料庫維護員   | API 查詢適配器        | 遷移、種子、通用 SQL 寫入      |
| `@motorcove/database/projection-writer` | 資料庫+Indexer | Indexer SQLite 轉接器 | 目錄突變、遷移、恢復           |
| `@motorcove/database/maintenance`       | 資料庫+工具    | 根部維護組合物        | 正常 API 或 Indexer 運作時     |
| `@motorcove/database/types`             | 資料庫維護員   | 伺服器消費者          | 瀏覽器運行時或原始驅動程式暴露 |
| Drizzle 架構與 SQL 歷史                 | 資料庫維護員   | 遷移生成器/檢查器     | 運行時自動遷移                 |
| 投影器                                  | Indexer        | 攝取和重建應用程式    | RPC、SQLite或進口掛鐘          |

架構變更需要資料庫、API、Indexer 和 QA 影響審查。提供者可以在消費者切換之前發布模式和遷移；端到端的完成仍然等待消費者整合和相容的資料。目前的schema、reader、writer、API、Indexer消費者是整合的；未來的模式變更必須保留相同的提供者-消費者閘。

請參閱[依賴規則](dependency-rules.zh-TW.md) 和[更改配方](../onboarding/change-recipes.zh-TW.md)。

## 對帳診斷資料庫訪問

`@motorcove/database/maintenance` 僅針對 Indexer 對帳 CLI 公開 `openReconciliationDatabase`。當投影狀態為`RECOVERY_REQUIRED`時，它採用獨佔維護門，檢查擁有的環境和模式，並允許診斷報告。它不能透過正常攝取或只讀 API 使用。維護標記仍然阻止該報告編寫者；普通 `projection-writer` 連接埠保持關閉狀態，直到恢復完成。
