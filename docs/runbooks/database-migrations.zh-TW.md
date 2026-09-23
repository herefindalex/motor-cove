# 如何遷移自有資料庫

[English](database-migrations.md) · [简体中文](database-migrations.zh-CN.md)

使用此 Runbook 在一次性或明確選擇的本機環境中進行架構變更。

## 先決條件

- API 和 Indexer 已針對目標環境停止。
- `.motorcove/environments/` 下的安全環境蛞蝓。
- 審查了 Drizzle 架構並產生了 SQL。切勿將此流程指向預先存在的 `data/` DB。

## 產生並檢查儲存庫工件

```bash
pnpm db:generate --name add_descriptive_name
pnpm db:check
```

查看 SQL、Drizzle 元資料、有序雜湊、聚合摘要、標準化模式指紋、模式來源摘要和投影器相容性。 `db:check` 將排序後的 `packages/database/src/schema/*.ts` 內容綁定到 `schema-contract.json`，因此在沒有重新產生和審核的遷移合約的情況下進行模式編輯會導致儲存庫門失敗。請勿使用 `drizzle-kit push` 或編輯已套用的遷移。

## 檢查和遷移

```bash
pnpm db:status --env docs-smoke
pnpm db:plan --env docs-smoke
pnpm db:migrate --env docs-smoke
pnpm db:verify --env docs-smoke
```

狀態和計劃是唯讀的，不會建立遺失的環境。 Migrate 採用獨佔服務和寫入器鎖，寫入持久性標記，應用官方 SQLite 遷移器，驗證歷史記錄/架構/FK/完整性，寫入 `db_contract`，然後清除標記。

此標記將中斷的遷移綁定到環境、資料庫路徑、模式契約和遷移包摘要。重新運行 `db:migrate` 僅繼續該確切的捆綁包。在掛起的遷移運行之前會驗證已知的舊前綴。如果 SQL 已達到目前模式，則復原將在清除標記之前完成並重新驗證 `db_contract`。

具有掛起遷移的現有資料庫必須在套用任何 SQL 之前發布經過驗證的遷移前備份。僅在快照發布並驗證後，標記才會記錄備份 ID。匹配的重新運行會重新開啟該備份，並將其環境、部署、本機歷史記錄、來源包摘要和架構指紋與即時來源資料庫進行比較。如果備份建立失敗，則重新執行將重試備份建立；它不能將失敗的標記視為快照存在的證據。如果 SQL 備份後失敗，則重複使用相同的已驗證快照。

所有權初始化僅限於真正空的環境目錄。資料庫、WAL 或 SHM 檔案、部署/引導/種子/維護/節點 sidecar、符號連結或任何其他不帶 `owner.json` 的現有檔案將被保留並被拒絕為 `DB_NOT_OWNED`。採用或匯入需要單獨的明確工作流程； `db:migrate` 從不圍繞現有狀態建立所有權元資料。

## 驗證

真正的 `0000` 到 `0001` 裝置保留現有的鏈事件，同時加入來源記錄完整性儲存。由於遷移的行無法追溯證明不存在的摘要，因此重建會拒絕它們，並且部署掃描開始的重新索引會在發布當前投影元資料之前重新獲取經過驗證的來源。

## 故障排除

- `RESOURCE_BUSY`：停止API/Indexer或其他維護指令；不要殺死未知的進程。
- `DB_HISTORY_DIVERGED`：保留DB和標記。不要重寫帳本。
- `DB_SCHEMA_DRIFT`：與新遷移的臨時資料庫進行比較並新增向前遷移。
- `MAINTENANCE_INCOMPLETE`：使用 `pnpm ops:recover --env <id>` 檢查，然後執行
  `--complete`。 `RERUN_MATCHING_MIGRATION` 表示使用相同的已檢查來源和遷移包重新執行 `pnpm db:migrate --env <id>`。當前模式恢復最終確定元資料。已更改的捆綁包、未知的歷史記錄或架構漂移仍然被阻止。沒有捆綁標識的舊標記會報告 `USE_ORIGINAL_RELEASE_MIGRATION_TOOL` 的背後模式。不要刪除標記。
- `MIGRATION_BACKUP_INVALID`：保留標記並備份。記錄的快照不再
  匹配遷移所需的來源身分；請勿更換證明或繞過檢查。
- `DB_NOT_OWNED: existing environment state`：環境包含狀態但沒有擁有者記錄。
  不要手動新增 `owner.json` 或針對該目錄重新執行。

檢查的`data/motorcove.sqlite`沒有被修改，不會自動採用。
