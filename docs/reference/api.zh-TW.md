# HTTP API 参考

[English](api.md) · [简体中文](api.zh-CN.md)

本頁說明目前 Fastify 應用程式註冊的路由，以及 `@motorcove/api-contracts` 定義的請求與回應資料格式。產生的 OpenAPI 文件位於 `packages/api-contracts/generated/openapi.json`。

| 方法 | 路徑                        | 響應目的                             |
| ---- | --------------------------- | ------------------------------------ |
| 獲取 | `/health/live`              | 僅進程活躍度                         |
| 獲取 | `/health/ready`             | 讀者可以獲得系統狀態；不全鏈新鮮度   |
| 獲取 | `/v1/config`                | 部署、鏈、合約地址、融資期限         |
| 獲取 | `/v1/vehicles`              | 車輛目錄和預計當前車主               |
| 獲取 | `/v1/sales`                 | 包含聲明的部署範圍銷售清單           |
| 獲取 | `/v1/sales/{saleId}`        | 一次銷售或選擇範圍內的融資觀察       |
| 獲取 | `/v1/system/status`         | 最後投影狀態，觀察新鮮度、滯後、恢復 |
| 獲取 | `/v1/system/events`         | 最近索引的事件證據                   |
| 獲取 | `/v1/system/reconciliation` | 最新儲存的對帳報告                   |

## 數位和身分編碼

公共模式使用十进制字符串作为 ID、wei、链 ID、区块和时间戳，这些字符串源自 EVM 整数。位址和 bytes32 值使用十六進位字串。不要通过 JavaScript `Number` 转换 wei 或 uint256 ID。

`saleId` 是 `0..2^256-1` 中的規範十進位值：不接受符號、空格、指數、小數部分或前導零。格式錯誤或溢位的路由值在資料庫讀取器運作之前傳回 `400 INVALID_SALE_ID`。沒有投影 Sale 的有效 ID 將會傳回 `404 SALE_NOT_FOUND`。觀察塊選擇器也限於 JavaScript 的安全整數範圍，因為目前的 SQLite 區塊列和讀取器合約使用安全整數。

## 出處

回應公開 `deploymentId`、`indexedBlockNumber`、`indexedBlockHash`、`projectorVersion`、`projectionBuildId` 和 `logScopeHash`。資料和來源在一個 SQLite 事務中讀取。消費者必須使用這些欄位來區分部署、來源範圍和投影建置。

對帳端點包含兩個來源範圍。 `data.logScopeHash`屬於儲存的歷史報表。 `provenance.logScopeHash` 屬於用於讀取該報告的目前快照。它們在允許的範圍轉換後可能會有所不同，並且不得相互替換。

## 最近的事件證據

`GET /v1/system/events` 是原始審計來源。它有意保留來自移位區塊的來源事件以及當前的規範事件。每行包括：

| 領域                 | 意義                                       |
| -------------------- | ------------------------------------------ |
| `canonical`          | 該行的來源區塊是否位於目前選定的規範分支上 |
| `scanComplete`       | 該區塊的配置日誌範圍是否已完全掃描         |
| `sourceLogScopeHash` | 使用該來源區塊記錄的日誌範圍標識           |

消費者必須評估每個事件的這些欄位。回應信封描述了目前的投影快照，並且不能將較舊的行標記為規範的或已移位的。當保留事件的區塊再次變成規範時，重新索引可以更新其規範狀態；來源事件本身不會被刪除或重寫為業務結果投影。

## 投影狀態與觀察新鮮度

`projectionStatus` 是 Indexer 保留的最後狀態。 `observationFreshness` 描述了工人心跳是否仍然可以支持現在時健康聲明：

| 價值      | 意義                         |
| --------- | ---------------------------- |
| `FRESH`   | 心跳在配置的過時閾值內。     |
| `STALE`   | 存在有效的心跳，但早於閾值。 |
| `UNKNOWN` | 沒有有效的心跳時間。         |

`observationAgeSeconds` 報告測量的年齡（如果有）。當新鮮度不是 `FRESH` 時，`lagBlocks` 是 `null`：API 保留最後一個檢查點和觀察到的頭，但不發明目前的鏈高度。預設的過時閾值是 30 秒。本地 API 進程可以將 `MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS` 設定為從其輪詢和重試預算衍生的正安全整數。此讀取計算不會變更復原標記或持久的投影狀態。

## 資助觀察選擇器

`GET /v1/sales/{saleId}` 接受以下欄位作為一組「全有或全無」：

| 查詢字段             | 意義                     |
| -------------------- | ------------------------ |
| `deploymentId`       | 確切的部署範圍           |
| `observeTxHash`      | 資金交易哈希             |
| `observeBlockNumber` | 收據包含高度為十進位字串 |
| `observeBlockHash`   | 收據包含區塊哈希         |
| `observeLogIndex`    | RPC 事件日誌索引         |

如果沒有這個組，路由會保持正常的銷售和 404 行為。部分或畸形的組別返回 `400 INVALID_OBSERVATION_SELECTOR`；另一個部署返回 `409 DEPLOYMENT_MISMATCH`。當投影尚未到達接收區塊時，觀察模式可能會傳回`200`、`sale: null`和`coverage: NOT_REACHED`。

回應將四個問題分開：

- `coverage`：`NOT_REACHED`、`SCANNED` 或 `UNVERIFIABLE`；
- `eventLookup`：`NOT_FOUND`、`MATCHED`、`NONCANONICAL` 或 `SELECTOR_MISMATCH`；
- `projectionEffect`：`NOT_ASSESSED`、`CONSISTENT` 或 `INCONSISTENT`；
- `freshness`：觀察頭、觀察時間和工人可用性。

`matchedEvent` 是根據儲存的來源證據建構的。讀取器在收據高度處檢查規範標頭，因此區塊 105 處的收據不會直接與區塊 110 處的檢查點雜湊進行比較。所有行和出處都來自一個短 SQLite 讀取事務。選擇器輸入不受信任：遺失的發明雜湊永遠不會寫入恢復標記、停止 Indexer 或修復投影。

## 誤差邊界

無效或溢出的銷售 ID 在銷售路由中傳回穩定的用戶端錯誤。未初始化或不匹配的讀取模型對應到服務不可用。意外錯誤會傳回請求 ID，但不會暴露堆疊追蹤。未實現身份驗證和分頁。

參見`tests/integration/api-contract.test.ts`中的[後端架構](../architecture/backend-indexer.zh-TW.md)和API合約測試。
