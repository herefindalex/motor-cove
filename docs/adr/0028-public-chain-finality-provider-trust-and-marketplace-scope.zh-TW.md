[English](0028-public-chain-finality-provider-trust-and-marketplace-scope.md) · [简体中文](0028-public-chain-finality-provider-trust-and-marketplace-scope.zh-CN.md)

# ADR 0028：公鏈最終性、供應商信任與市集範圍

- 狀態：已接受
- 日期：2026-09-23

## 背景

MotorCove 起初是在 loopback Anvil 上運作的本地工程研究專案。先前的決策已明確處理交易結果不確定性、部署身分、原始鏈上證據、投影恢復、瀏覽器 journal 的持久性與 escrow 保管。若同一套架構要延伸至公用 EVM 網路，就需要先界定最終性、RPC 供應商信任，以及市集交易的範圍。

Seaport、LooksRare 一類通用市集需要簽章、nonce、counter、取消、部分成交，以及賣家仍持有資產時持續驗證餘額和授權。MotorCove 目前的 listing 會把 NFT 轉入 `MotorCoveEscrow`，沒有這種離鏈訂單模型。另一方面，接近鏈頭的區塊未必已達最終性；不同鏈的相同確認區塊數不代表相同時間或安全語意；RPC 可能缺少歷史與 finalized 查詢能力；本地資料即使自洽，仍可能漏掉來源。以下決策先界定這些風險。

## 決策

### 1. 投影只處理已達最終性的資料

在公鏈 profile 下，區塊須符合該 profile 的最終性政策，才能進入應用投影。收據已包含與鏈上最終性是兩個不同主張。瀏覽器可能先看到已包含交易，而市集投影仍等待最終性；這是預期行為。Anvil 是開發與測試用的明確例外，可把最新本地區塊視為立即達最終性。

### 2. 支援鏈明確限定為 Anvil、Ethereum、Polygon

- Anvil：chain ID `31337`，只供 loopback 開發與測試。
- Ethereum：chain ID `1`。
- Polygon：chain ID `137`。

這不表示支援任意 EVM 鏈。Ethereum 與 Polygon 的 RPC 必須提供 profile 要求的 finalized 鏈上證據；能力不足時不得暗中改用 latest 或猜測確認深度。不支援的 chain ID 直接拒絕。鏈別政策集中在 `ChainProfile` 契約中。

### 3. 正常運作使用一個主要來源，重要稽核使用第二個來源

正常讀取與索引沿用單一主要 RPC，不在每個即時請求上要求多供應商共識。重要的 finalized 來源稽核另用獨立設定的次要來源，比對 MotorCove 保留的區塊與 log 證據。來源不一致只形成診斷證據；稽核不會自動改寫 DB，也不會觸發錢包操作。本地內部一致與獨立來源一致是不同主張。

### 4. Sale 預留給賣家選定的買家

建立 Sale 時，賣家指定一位 `allowedBuyer`。Escrow 合約保存此授權，只接受該地址呼叫 `fundSale` 付款。投影和 API 必須分別呈現預留買家 `allowedBuyer` 與實際已付款買家 `buyer`；成功 funding 後兩者相同。這符合車輛交易先達成商業協議、再鏈上交割的模型，並取消公開 mempool 中任意錢包搶先付款的競賽。

### 5. 索引繼續使用輪詢

保留單一 polling ingestion 路徑。現階段不增加 WebSocket 訂閱、斷線重訂、訂閱停滯偵測，以及歷史與即時流之間的去重與交接。若產品確實需要比輪詢週期更快的反應，再作架構決策。

### 6. Listing 繼續由 escrow 保管資產

建立 listing 仍會把 NFT 轉入 MotorCove escrow。本階段不加入賣家繼續持有 NFT 的離鏈簽名 listing，因此 EIP-712 市集訂單、maker counter／nonce、批次取消、部分成交、transfer conduit 及任意 execution zone 都不在範圍內。`VehicleNFT` 的 escrow 綁定、直接存入拒絕、`custodySaleId` 不變條件、取回流程與 pull-payment claim 繼續保留。

## 後果

### 接受最終性延遲

Finalized-only 投影會比鏈頭投影慢。對高價車輛交易，這比維護可回滾的推測性應用狀態更合適。收據已包含但投影尚未顯示成交，不等於投影失敗。

### 供應商能力是設定正確性的一部分

RPC URL 語法正確不足以證明可用。啟動與操作工具須確認目前 profile 所需的 finalized 查詢、block-hash logs 與對帳用歷史狀態；缺少必要能力時明確拒絕。

### 獨立驗證有成本，但不在熱路徑

關鍵稽核需要另一個獨立來源，會增加操作成本；正常讀取與索引仍只依賴主要來源。

### 預留買家交易較不開放

任意錢包不能搶先 fund 已刊登車輛。若未來要支援公開 listing、競價或拍賣，須另作協定決策，不能只切換 UI。

### 輪詢保留單一正確性模型

接受輪詢延遲，以避免在現階段引入歷史與即時來源交接的第二套正確性邊界。

### Escrow 保管避免離鏈訂單失效複雜度

Listing 時轉入 NFT，避免賣家之後轉走資產或撤銷授權，使已簽署訂單無法履行。代價是刊登需要保管轉移，取消後也需明確取回。

## 供應商最終性模型

```text
Anvil     → 本地立即最終性
Ethereum  → 必須有 finalized RPC 證據
Polygon   → 必須有 finalized RPC 證據
```

公鏈投影目標取自 finalized 證據，而不是任意設定的確認區塊數。若供應商不能建立所需 finalized 狀態，MotorCove 不會退回 latest。未來若某個網路確有必要使用替代政策，需另以 ADR 明確說明。

## 交易生命週期

包含與最終性依序為 `SUBMITTED → INCLUDED → FINALIZED`；執行結果則是 `SUCCESS` 或 `REVERTED`。已包含但尚未 finalized 的收據仍可能成為 orphan。已 finalized 的證據若發生矛盾，視為完整性事件並進入恢復，而不是當作一般淺層 reorg。

## 來源稽核

操作員可對 finalized 範圍執行唯讀稽核，至少比對區塊號碼、區塊與父區塊 hash、MotorCove log scope、範圍內 log 數量與 digest，以及本地保留的原始 event identity。結果為 `MATCH`、`MISMATCH` 或 `UNVERIFIABLE`；後者絕不視為 `MATCH`。稽核不送交易、不清除恢復證據，也不自動改寫投影。

## 預留買家的 Sale 模型

建立 Sale 綁定 `seller`、`tokenId`、`priceWei`、`allowedBuyer`，並把 NFT 轉入 escrow。付款要求 `msg.sender == allowedBuyer` 且 `msg.value == priceWei`。成功付款後，實際 `buyer` 等於 `allowedBuyer`。取消、完成、到期、退款、賣家取回與 pull-payment 語意維持既有規則，僅因欄位與事件契約所需而作機械性更新。

## 安全驗證邊界

既有安全政策不變。自動化與貢獻者驗證只用 loopback 基礎設施；Ethereum 與 Polygon profile 以確定性的本地或模擬供應商測試。本 ADR 不授權 mainnet／public testnet 部署、公網 RPC、真實錢包秘密或真實資產操作。

## 曾考慮的替代方案

### 投影鏈頭並回滾淺層 reorg

暫不採用。雖可縮短延遲，但需要可逆投影、崩潰安全的 undo 狀態、熱區塊 journal、回滾順序與更複雜的恢復。現有產品需求不足以支持此成本。

### 對每條 EVM 鏈使用固定確認深度

不採用。區塊節奏與最終性行為不同，固定區塊數不能跨鏈提供可攜的時間或安全保證。

### 每個執行時操作都查多個供應商

不採用。熱路徑會增加延遲與複雜度。獨立來源的價值集中在重要稽核與恢復證據。

### 公開先到先得付款

不符合目前車輛市集模型，會形成公開 mempool 付款競賽。當前模型以賣家核准的交易對手進行鏈上交割。

### WebSocket 即時索引

目前沒有足以支持訂閱生命週期與歷史／即時交接成本的延遲需求，因此不採用。

### 非託管簽名 listing

目前不採用。它需要訂單簽名、重播防護、到期與取消、即時餘額／授權檢查，以及 nonce／counter 語意。Escrow 保管刻意避免這些表面。

## 重新評估條件

若產品需要接近鏈頭的狀態、finalized 延遲無法接受，且具備可逆投影設計與維運資源，重新評估 finalized-only。新增鏈有具體需求時，先文件化其最終性及供應商語意，再新增 profile。供應商分歧頻繁，或安全關鍵流程需要多方讀取共識時，重新評估單一主要來源。若產品加入公開刊登、拍賣或競價，重新評估預留買家。若實測延遲要求即時鏈頭，重新評估輪詢。若產品要求非託管的離鏈刊登，重新評估 escrow 保管。

## 驗證

測試須覆蓋：不支援鏈拒絕、finalized-only 目標、供應商能力不足時拒絕、已包含與已 finalized 的不同狀態、finalized anchor 矛盾進入恢復、次要來源 `MATCH`／`MISMATCH`／身份矛盾／不可用、合約強制預留買家與 outsider 拒絕、投影／API／UI／E2E 預留買家流程、escrow 保管不變條件、沒有新 WebSocket 路徑，以及歷史回歸。

最終交付須執行 `pnpm verify` 與 `pnpm test:e2e`。若只用 loopback 或模擬 fixture 驗證公鏈 profile，必須明確記錄，不能聲稱已做公鏈驗證。
