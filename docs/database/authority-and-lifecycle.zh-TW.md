# 資料庫權威來源和生命週期

[English](authority-and-lifecycle.md) · [简体中文](authority-and-lifecycle.zh-CN.md)

## 如何讀取矩陣

`CRITICAL`表示遺失無法僅透過普通鏈重播來修復。 `PREFER` 表示記錄是可複製的，但可以顯著改善局部恢復或保留歷史證據。 `CONVENIENCE` 表示經過驗證的來源可以複製它。 `NONE` 意味著新的運行時觀測是合法的恢復路徑。

`Rebuildable` 標識表是否可以透過其宣告的復原來源重建。它不授權暫時刪除。維護所有權、持久操作標記、部署身分檢查和來源驗證仍然適用。

## 表矩陣

<!-- GENERATED:DATABASE-AUTHORITY:START -->

| 表                       | 類別                  | 權威來源                                       | 作家                                       | 衍生 | 可重建 | 恢復來源                                                | 備份          | 重組語意                                                         |
| ------------------------ | --------------------- | ---------------------------------------------- | ------------------------------------------ | ---- | ------ | ------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| `__drizzle_migrations`   | `SCHEMA_CONTROL`      | 儲存庫 Drizzle 遷移捆綁包                      | Drizzle 遷移運行程序                       | 不   | 不     | 已驗證的資料庫備份或遷移重播到新的空資料庫              | `CRITICAL`    | 不依賴鏈。                                                       |
| `db_contract`            | `SCHEMA_CONTROL`      | 已驗證的架構合約、遷移包和架構指紋             | 遷移維護作業                               | 是的 | 是的   | 成功驗證儲存庫架構合約                                  | `CONVENIENCE` | 不依賴鏈。                                                       |
| `deployments`            | `DEPLOYMENT_IDENTITY` | 已驗證的部署清單和鏈上合約身份                 | 引導部署註冊                               | 不   | 不     | 相容的部署清單加上經過驗證的鏈上身份                    | `CRITICAL`    | 部署區塊哈希是身份證據，不得被悄悄取代。                         |
| `catalog_vehicles`       | `OFFCHAIN_AUTHORITY`  | MotorCove 目錄種子或明確本地目錄輸入           | 目錄種子維護命令                           | 不   | 不     | 經過驗證的資料庫備份或準確的權威目錄輸入                | `CRITICAL`    | 目錄行獨立於鏈規範性。                                           |
| `catalog_asset_bindings` | `OFFCHAIN_AUTHORITY`  | MotorCove 目錄權威來源受部署標識約束           | 目錄種子維護命令                           | 不   | 不     | 經過驗證的資料庫備份或確切的權威綁定輸入                | `CRITICAL`    | 綁定仍然是部署範圍內的；重組不會重寫目錄意圖。                   |
| `indexed_blocks`         | `RAW_CHAIN_EVIDENCE`  | 針對配置的部署和日誌範圍驗證了鏈觀察           | Indexer 攝取<br>重建索引維護               | 不   | 是的   | 從已驗證的部署掃描開始明確重新索引                      | `PREFER`      | 可以保留競爭的雜湊值；每個部署和高度可能只存在一個規範行。       |
| `chain_events`           | `RAW_CHAIN_EVIDENCE`  | 驗證鏈日誌觀察並記錄解碼器版本                 | Indexer 攝取<br>重建索引維護               | 不   | 是的   | 從規範塊頭和日誌中明確重新索引                          | `PREFER`      | 歷史非規範事件仍然可審計，並透過 indexed_blocks 規範性進行解釋。 |
| `indexer_checkpoint`     | `RUNTIME_OBSERVATION` | 最後一個原子提交的規範攝取單元                 | Indexer 攝取<br>投影重建<br>重新索引維護   | 是的 | 是的   | 已驗證的indexed_blocks和chain_events，或明確重新索引    | `CONVENIENCE` | 檢查點塊和哈希必須保持不可分割的規範錨。                         |
| `sales`                  | `DERIVED_PROJECTION`  | 已驗證的規範 MotorCoveEscrow 事件              | Indexer 投影器<br>投影重建<br>重新索引維護 | 是的 | 是的   | 已驗證規範的 chain_events；當來源證據可疑時明確重新索引 | `CONVENIENCE` | 行遵循規範的事件序列，並透過檢查點變更自動回滾。                 |
| `payment_claims`         | `DERIVED_PROJECTION`  | 經過驗證的規範託管索賠事件                     | Indexer 投影器<br>投影重建<br>重新索引維護 | 是的 | 是的   | 已驗證規範的 chain_events；當來源證據可疑時明確重新索引 | `CONVENIENCE` | Claim 狀態遵循規範的建立和撤回事件。                             |
| `token_ownership`        | `DERIVED_PROJECTION`  | 已驗證的規範 VehicleNFT 傳輸事件               | Indexer 投影器<br>投影重建<br>重新索引維護 | 是的 | 是的   | 經過驗證的規範 VehicleNFT chain_events 或明確重新索引   | `CONVENIENCE` | 所有權遵循檢查點的規範轉移順序。                                 |
| `indexer_runtime_status` | `RUNTIME_OBSERVATION` | Indexer運行時和即時RPC觀察                     | Indexer運行時<br>顯式投影維護              | 是的 | 是的   | 新的 Indexer 執行和明確恢復轉換                         | `NONE`        | 發現的衝突可以使健康走向恢復；維護不能創造新鮮感。               |
| `reconciliation_runs`    | `AUDIT_EVIDENCE`      | 對帳對其記錄的部署、範圍、檢查點和頭部進行觀察 | 對帳 CLI                                   | 是的 | 不     | 驗證資料庫備份；新的運作無法重現先前的觀察結果          | `PREFER`      | 報告仍然與其歷史錨點聯繫在一起，並且永遠不會繼承當前的規範性。   |

<!-- GENERATED:DATABASE-AUTHORITY:END -->

## 解釋界限

### 權威來源

部署註冊和目錄資料是權威的本地輸入。它們在投影重建和重新索引中倖存下來。模式控制行證明存在哪個資料庫契約；手動更改它們不會遷移資料庫。

### 證據

`indexed_blocks` 和 `chain_events` 保留本地驗證的觀測結果。只有在完成完整性、摘要、解碼器、範圍、檢查點和規格連續性檢查後，Rebuild 才會信任此來源。當這些檢查失敗時，重新索引會從已驗證的部署中重新取得它。

### 投影

`sales`、`payment_claims`、`token_ownership` 是查詢投影。它們的行透過檢查點原子地遵循規範事件序列。它們不會因為備份包含它們而成為獨立的復原來源。

### 運行時觀察

檢查點記錄最後提交的投影錨點。運行時狀態報告工作執行緒運行狀況、RPC 觀察和恢復狀態。未經最近觀察而儲存的 `CURRENT` 值是歷史陳述，而不是當前新鮮度的證明。

### 審核歷史

每個對帳報告都保留自己的部署、投影建置、日誌範圍、檢查點、頭部和建立時間。稍後的運行時狀態無法重寫舊報告的含義。
