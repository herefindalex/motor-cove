# ADR 0010：API 值與觀察新鮮度

[English](0010-api-values-and-observation-freshness.md) · [简体中文](0010-api-values-and-observation-freshness.zh-CN.md)

## 狀態

已接受。

## 背景

資料庫保留了對帳報告的來源範圍，但讀者從歷史記錄中忽略了該欄位。銷售路由驗證了十進位語法，而不強制執行 EVM `uint256` 限制。市場將精確的 wei 減少為整數毫以太以供顯示，同時保留錢包請求中的全部價值。最後，在工作進程心跳停止後，持久的 `CURRENT` 投影狀態在視覺上仍保持目前狀態。

這些是邊界和表達失敗。儲存的鏈值、協議金額和投影狀態機仍然具有權威性，不需要新的儲存或恢復系統。

## 決定

- 歷史對帳資料帶有自己的`logScopeHash`。回應信封保留
  目前讀取快照的來源分別；兩個範圍都不能取代另一個範圍。
- 公開銷售 ID 是規範的十進位 `uint256` 字串。 API 拒絕畸形和溢出
  呼叫資料庫讀取器之前的值。收據塊選擇器仍然受到應用程式的安全整數儲存合約的限制。
- 交易功能使用 bigint 商數和餘數運算來格式化 wei。初次銷售
  價格顯示精確的 ETH 價值，包括亞毫以太幣數量，並且永遠不會通過 JavaScript `Number`。
- `projectionStatus` 明確是最後一個持久保存的投影結果。閱讀簡報得出
  來自具有可注入時鐘的工作人員心跳的 `observationFreshness` 和 `observationAgeSeconds`。預設的過時閾值是 30 秒，API 進程可以為測量的本地環境設定 `MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS`。
- 陳舊或未知的觀察報告 `lagBlocks: null`；它沒有發明目前的鏈頭。
  `RECOVERY_REQUIRED` 仍然可見，並且永遠不會因新鮮度呈現而被清除。

## 後果

格式錯誤或溢位的銷售 ID 會產生 `400 INVALID_SALE_ID`；有效的遺失 ID 仍然會產生 `404 SALE_NOT_FOUND`，且意外的讀卡機故障仍然是內部錯誤。

用戶看到的金額與資助行動收到的金額完全相同。這僅更改顯示文字；它不會改變合約值、解析器、種子資料或交易請求。

停止 Indexer 會使 API 可讀，而其觀察結果最終會變得陳舊。工人心跳可以恢復新鮮的呈現，而無需重寫投影歷史。新鮮度計算是唯讀的，不會建立恢復標記。
