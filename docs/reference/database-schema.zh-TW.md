# 資料庫結構定義參考

[English](database-schema.md) · [简体中文](database-schema.zh-CN.md)

`packages/database/drizzle` 下的可執行遷移定義實體 SQLite 架構。 [產生的實體引用](../database/schema-reference.generated.zh-TW.md) 在隔離的資料庫中執行該歷史記錄，並記錄每個儲存庫管理的表、列、主鍵、外鍵、索引、限制定義和模式契約摘要。

SQL 無法在[機器可讀資料庫模型](../../packages/database/src/model.ts) 和規劃的[權威來源和生命週期矩陣](../database/authority-and-lifecycle.zh-TW.md) 中即時表達的架構事實。恢復行為單獨記錄在[資料庫恢復語意](../database/recovery-semantics.zh-TW.md)中。

将 `pnpm db:verify` 用于自有托管环境。文件產生和檢查僅使用記憶體資料庫，絕不採用或修改 `data/motorcove.sqlite` 或託管環境。

```bash
pnpm docs:generate
pnpm docs:generate:check
```

第一个命令更新生成的工件。當遷移派生的架構、語意表模型或提交的生成的 Markdown 發生偏差時，第二個失敗。
