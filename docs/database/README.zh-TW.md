# 資料庫文件

[English](README.md) · [简体中文](README.zh-CN.md)

MotorCove 使用單一受管理的 SQLite 資料庫，保存部署身分、鏈外目錄的權威資料、保留的鏈上證據、衍生投影、執行時觀察狀態與對帳報告。這些記錄各有不同的負責者與復原規則，因此不能把整個資料庫一概視為權威事實或可丟棄的快取。

## 真理的來源

資料庫合約有兩個互補的來源：

1. `packages/database/drizzle` 下的可執行遷移定義了物理模式。
2. [`databaseModel`](../../packages/database/src/model.ts) 定義語意所有權和生命週期
   SQLite無法表達的事實。

`packages/database/schema-contract.json` 綁定已審核的遷移包、模式指紋、模式來源、工具鏈和所需的投影器版本。產生的引用是透過針對隔離的記憶體資料庫執行這些遷移來產生的；它不檢查或修改託管環境。

## 按問題閱讀

- [實體架構參考](schema-reference.generated.zh-TW.md)：列、鍵、索引、限制、
  以及根據執行的遷移歷史產生的合約摘要。
- [資料庫模型](database-model.zh-TW.md)：狀態類別、表格關係以及之間的邊界
  權威來源、證據、投影、運行時觀察和審計歷史記錄。
- [權威來源與生命週期](authority-and-lifecycle.zh-TW.md)：產生的逐表所有權，
  寫入器、復原來源、備份和重組矩陣以及解釋規則。
- [恢復語意](recovery-semantics.zh-TW.md)：遷移、重建、重新索引、備份的效果，
  恢復並重置。
- [時間語意](temporal-semantics.zh-TW.md)：業務、鏈、觀察、驗證、
  過程活性、局部突變時間以及每個現有欄位所證明的內容。
- [資料庫架構](../architecture/database.zh-TW.md)：進程和套件邊界。
- [資料庫接受矩陣](../testing/database-acceptance-matrix.zh-TW.md)：已實施並執行
  驗證證據。

## 產生和漂移檢查

```bash
pnpm docs:generate
pnpm docs:generate:check
pnpm docs:check
```

`docs:generate`擁有完整的實體模式參考和權威來源頁面中標記的矩陣區域。生成區域之外的文字仍然是人工策劃的。當遷移的表缺少語意模型條目時，檢查模式會失敗，並出現 `DATABASE_MODEL_TABLE_DRIFT`；當提交的生成的 Markdown 與當前輸入不同時，檢查模式會失敗，出現 `GENERATED_DOC_DRIFT`。

## 變更規則

物理架構變更從新的遷移和審查的架構合約開始。語意所有權或復原變更會更新相同交付中的 `databaseModel` 和人類生命週期頁面。切勿編輯已套用的遷移或產生的參考以使文件與未經審核的資料庫一致。
