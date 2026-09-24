# 如何將對帳變成投影

[English](reconciliation.md) · [简体中文](reconciliation.zh-CN.md)

對帳比較相同部署下的鍊和投影、區塊編號和區塊雜湊。它分別報告比較、新鮮度、範圍、完整性假設和錨定。

## 操作

`MOTORCOVE_ENV=<id> pnpm ops:reconcile` 讀取銷售、索賠和所有權投影以及錨定合約 getter 並儲存報告。它與 `CURRENT` 或滯後分開報告 `MATCH`、`MISMATCH` 或 `UNVERIFIABLE`。它不修復數據。

## 程式

1. 停止正常的Indexer和API進行維護。
2. 取得獨佔服務和寫入鎖。
3. 從檢查點修復 H 並在讀取前後驗證其規範雜湊。
4. 枚舉聲明的範圍；不要只比較資料庫中已經存在的行。
5. 保留一份包含部署、H/雜湊、投影器/建置/範圍、比較、新鮮度、差異的報告，
   時間戳和完整性限制。
6. 對於不匹配或無法驗證的結果返回非零；單獨選擇恢復。

RPC 的歷史狀態可能無法使用。在這種情況下報告 `UNVERIFIABLE`；永遠不會回傳錯誤的匹配。 H 處的投影可以有效地為 `MATCH` 和 `PROJECTION_LAGGING`，而頭為 H+k。 Freshness 使用錨定比較之後、報告發布之前的第二個最新頭部觀察結果。錨定比較保持在 H；後面的樣本僅限定該結果是否仍是最新的。發佈時頭讀取失敗仍然存在 `UNVERIFIABLE / HEAD_UNKNOWN` 及其傳輸原因。目前的實作讀取錨定的 `saleCount` 並檢查每個 Sale ID，讀取該規範範圍內的每個聲明 getter，並獨立列舉每個預期的聲明行。因此，缺失、更改、額外或孤兒聲明會產生 `MISMATCH`。然後，它讀取錨定的 `nextTokenId` 並使用完整的 `(deployment, collection, token)` 身分檢查每個鑄造的代幣所有者。只有清單NFT集合才能滿足`ownerOf`；即使預期行也存在，另一個集合也會報告為 `UNEXPECTED_COLLECTION`。來自另一個部署的行不會進入比較。不可用的歷史讀取仍然會產生 `UNVERIFIABLE`。

儲存的報告擁有其歷史`logScopeHash`。在`GET /v1/system/reconciliation`中，該值在`data.logScopeHash`中傳回；回應信封的 `provenance.logScopeHash` 描述了目前讀取的快照。範圍轉換可能會使它們有所不同，而無需重寫報告。

## 不可用的最新頭部觀察

如果在檢查點可用後最新磁頭讀取失敗，則該指令仍將目前嘗試保留為 `UNVERIFIABLE` 和 `HEAD_UNKNOWN`，記錄 RPC 原因，並以非零值退出。它不會重複使用先前的報告或標題作為新運行的證據。開啟或寫入資料庫失敗仍然是外部命令失敗，因為在這種情況下不能保證持久的報告。

## 獨立 finalized 來源稽核

`pnpm ops:audit-source -- --from <block> --to <block> --secondary-rpc-url <url>` 唯讀比對本地保留的區塊／log 證據與獨立設定的次要 RPC。範圍必須符合所選鏈 profile 的 finalized 邊界。命令回傳 `MATCH`、`MISMATCH` 或 `UNVERIFIABLE`；非相符結果會以非零碼退出。將次要來源視為獨立證據前，須核對 chain ID、部署與執行時合約程式碼身分。稽核不修復投影，也不送交易。本專案驗證只使用 loopback 或模擬供應商；未宣稱執行公網 RPC 稽核。
