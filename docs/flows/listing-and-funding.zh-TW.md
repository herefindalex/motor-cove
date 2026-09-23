# 上市及資金流程

[English](listing-and-funding.md) · [简体中文](listing-and-funding.zh-CN.md)

本頁面從 UI 意圖追蹤 `SALE-001` 和 `SALE-002` 到獨立鍊和投影證據。

## 批准並列出

批准和上市是兩筆交易。 `approve` 授權託管一個代幣，並且不移動它。 `createSale` 驗證呼叫者是否擁有該代幣，透過安全接收者防護將其轉入託管，記錄 `LISTED`，並發出 `SaleCreated`。

## 基金

1. 銷售頁面讀取 API 快照和目前錢包/網路狀態。
2. EVM 閘道用精確的 `priceWei` 模擬 `fundSale(saleId)`。
3. 交易日誌持久記錄固定意圖和錢包請求邊界，然後
   錢包只提交一次。
4. 合約拒絕賣方自行購買或不準確的價值。成功記錄買家和到期時間。
5. 前端驗證發送者、託管、呼叫資料、值、收據、規格區塊和確切的訊息
   `SaleFunded` 日誌。獨立地，Indexer 拉動該事件，應用銷售投影器，並推進檢查點。
6. 選擇器範圍的 API 讀取返回覆蓋範圍、事件查找、投影效果、新鮮度和
   出處來自一張 SQLite 快照。 `NOT_REACHED`意味著鍊式支付已為人所知，而市場投影仍在追趕中。
7. `MATCHED` 加上 `CONSISTENT` 證明此快照反映了資金狀況。目前的Sale可能是
   `FUNDED`、`COMPLETED` 或 `EXPIRED`；後來的進展並沒有消除歷史資金效應。

資助永遠不會產生付款要求。完成後會產生賣方收益索賠，而到期則會產生買方退款索賠。因此，反映的資金操作並不意味著結算或提款已完成。

## 未知且陳舊的結果

如果提交可能已到達 RPC，請不要僅因為客戶端逾時而重新發送。搜尋已知的哈希/收據證據。在沒有哈希的情況下，從錢包活動中複製候選人並運行相同的只讀意圖檢查。不相關的候選人將被拒絕，而不會更改原始條目。如果接收成功，但 API 仍然是 `LISTED`，請檢查選擇器觀察、檢查點、請求高度區塊雜湊和部署身分；不要再付款。

代碼： `apps/web/src/integrations/evm/use-escrow-gateway.ts`, `chain/src/MotorCoveEscrow.sol`, `apps/indexer/src/domain/projectors/sale-projector.ts`。驗證單獨記錄在 [證據](../evidence/verification.json).

## 錄取和重複提交不變量

在建立示範資產之前，Bootstrap 將 `VehicleNFT` 綁定到部署的託管。 NFT 拒絕任何直接安全或不安全的轉移到該位址，除非託管人是執行 `createSale` 的授權操作員。這可以防止在沒有追蹤的 Sale 的情況下存在託管擁有的代幣。

在資金錢包請求返回哈希後，持久的日誌繼續擁有完整的資金意圖，而包含和投影尚未解決。連續點擊或重新載入無法開啟對相同呼叫資料和值的第二個錢包請求。不同的 Sale 或另一個不可變的意圖保持獨立。
