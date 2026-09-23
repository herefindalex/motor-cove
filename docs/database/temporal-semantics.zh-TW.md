# 資料庫時間語義

[English](temporal-semantics.md) · [简体中文](temporal-semantics.zh-CN.md)

資料庫時間戳回答不同的問題。較晚的時間戳不會使行變得更權威，證明區塊是規範的，或證明 Indexer 仍在運行。物理列列在[產生的架構參考](schema-reference.generated.zh-TW.md)中；每表的意義記錄在[資料庫模型](database-model.zh-TW.md)及其[`databaseModel`來源](../../packages/database/src/model.ts)中。

## 時間類別

| 類別                    | 問題已回答                          | 範例                                                                             |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `BUSINESS_TIME`         | 合約定義的狀態或截止日期何時生效？  | `sales.funded_at`, `sales.expires_at`                                            |
| `CHAIN_TIME`            | 哪個鏈位置或區塊時間戳錨定證據？    | `indexed_blocks.block_timestamp`、投影區塊/雜湊/日誌位置                         |
| `OBSERVATION_TIME`      | 這個過程什麼時候觀察到鍊或RPC證據？ | `chain_events.first_seen_at`，運行時 `last_observed_at` 和 `last_rpc_success_at` |
| `VERIFICATION_TIME`     | 當地合約或比較何時得到驗證或發布？  | `db_contract.verified_at`, `reconciliation_runs.created_at`                      |
| `PROCESS_LIVENESS_TIME` | 該工人上次報告其還活著是什麼時候？  | `indexer_runtime_status.worker_heartbeat_at`                                     |
| `LOCAL_MUTATION_TIME`   | 本地寫入何時發生？                  | 目錄時間戳記、`deployments.registered_at`、`indexer_checkpoint.updated_at`       |

這些類別描述了現有的欄位。不要求將 `created_at` 和 `updated_at` 新增到每個表。生成器檢查 TypeScript 時間模型中命名的每個欄位是否存在於其遷移的實體表中。

## 表和字段含義

| 表                       | 現有時間或位置字段                                               | 解讀                                                                                                       |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `__drizzle_migrations`   | `created_at`                                                     | 本地遷移分類帳寫入時間。有序遷移哈希和模式契約建立有效性。                                                 |
| `db_contract`            | `verified_at`                                                    | 遷移完成發布了經過驗證的架構合約。只讀驗證不推進；新的值無法彌補錯誤的指紋。                               |
| `deployments`            | `registered_at`;部署區塊/哈希字段                                | 本地註冊時間與綁定鏈身分的NFT和託管部署區塊不同。                                                          |
| `catalog_vehicles`       | `created_at`, `updated_at`                                       | 本地目錄寫入。目錄權威來源來自核准的種子/輸入，而不是時鐘。                                                |
| `catalog_asset_bindings` | 沒有掛鐘柱                                                       | 部署、集合、令牌和目錄身分定義了綁定。鏈重播無法重新建立目錄意圖。                                         |
| `indexed_blocks`         | `block_timestamp`;數字/哈希/父哈希                               | 標頭提供鏈時間和分支標識。 `is_canonical` 並掃描證據確定該行是否屬於目前分支。                             |
| `chain_events`           | `first_seen_at`;區塊/哈希/交易/日誌位置                          | 首次當地目擊事件為觀察時間；區塊和日誌身分錨定事件。保留下來的孤兒證據並不會僅僅隨著時間的推移而成為規範。 |
| `indexer_checkpoint`     | `updated_at`; `last_scanned_block`/`last_scanned_hash`           | 本地原子遊標更新及其鏈錨。時間戳記無法建立最新的live head。                                                |
| `sales`                  | `funded_at`、`expires_at`；建立/更新區塊和最後事件哈希           | 合約業務時間和規範事件來源。訂購銷售轉換不需要本地行更新時間戳記。                                         |
| `payment_claims`         | 創建/撤回區塊哈希和日誌索引                                      | 規範聲明事件對狀態進行排序；缺少本地時間戳並不意味著該聲明是永恆的。                                       |
| `token_ownership`        | `updated_block`，最後傳輸區塊雜湊/日誌索引                       | 最後反映的規範轉移，與歷史銷售買家身分分開。                                                               |
| `indexer_runtime_status` | `worker_heartbeat_at`, `last_rpc_success_at`, `last_observed_at` | 三個不同的主張：工人活躍度、RPC 成功以及觀察到的工作時間。當地重建不得更新它們。                           |
| `reconciliation_runs`    | `created_at`;比較區塊/雜湊和記錄頭                               | 歷史發佈時間和固定比較錨點。該報告永遠不會繼承後來的檢查點或範圍。                                         |

## 新鮮感和復原力

`CURRENT` 是經過驗證的即時觀察的投影狀態：檢查點已達到從觀察到的頭和 `indexingDepth` 得出的合格目標。成功的大量提交或本地維護操作本身並不能證明當前性。讀者呈現最新已知狀態以及工人/RPC 觀察新鮮度；過期的心跳標誌著觀察的陳舊，而沒有發明新的頭部或滯後。 `RECOVERY_REQUIRED` 仍然是持久的完整性屏障，不得透過較新的心跳、普通提交、重新啟動或陳舊轉換來清除。如果持久的工作進程心跳晚於讀者的時鐘，則無法確定其年齡；讀者報告 `UNKNOWN` 新鮮度並且沒有數字滯後，而不是將負年齡視為零。這不會重寫最後已知的投影狀態。

Rebuild 驗證保留的本地鏈證據並發布新的投影版本。它不會重新觀察實時鍊或刷新工作人員擁有的時間戳記。 Reindex 重新取得固定合格目標的來源證據，並使用實際的鏈觀察來確定以後的即時健康狀況。恢復驗證相容的快照，而不是其保存的時間戳記仍然描述即時工作人員或當前鏈頭。操作規則請參考[恢復語意](recovery-semantics.zh-TW.md)。

## 模式完整性

目前架構提供了記錄的資料庫生命週期所需的時間戳、排序和出處。根據當前要求，不需要額外的列或遷移。未來的工作人員心跳會以未知的新鮮度呈現，而無需更改儲存的模式。
