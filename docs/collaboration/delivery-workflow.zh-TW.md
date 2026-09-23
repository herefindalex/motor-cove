# 交付工作流程

[English](delivery-workflow.md) · [简体中文](delivery-workflow.zh-CN.md)

此頁面演示了提供者-消費者工作包和可重複使用的非同步切換。這是一個規劃模型，而不是聲稱真正的團隊執行了這個時間表。

## 範例工作包：SALE-002 基金銷售

| 舞台         | 提供者             | 消費者或平行工作                                  | 硬出口門                                   |
| ------------ | ------------------ | ------------------------------------------------- | ------------------------------------------ |
| 介面和行為   | 協定               | 前端可以使用 ABI 夾具來建構類型化狀態             | 準確的付款、賣家排除、事件欄位和商定的錯誤 |
| 消費者發展   | 前端+Indexer       | UI狀態和解碼器/投影器可以並行進行                 | 記錄提供者工件雜湊值；模擬標記             |
| 實際部署     | 協定/工具          | API 設定和瀏覽器部署驗證                          | 清單符合 getter、程式碼、ABI 和區塊        |
| 數據整合     | Indexer/資料庫     | API Presenter 和 Inspector 消耗固定的 Reader 合約 | 原子源/投影/檢查點行為已驗證               |
| 端對端驗證   | 品質保證           | 文件/證據可能已準備好但未標記為通過               | 真實Anvil + SQLite + API + 瀏覽器斷言透過  |
| 發布準備狀況 | 受影響合約的所有者 | 所有消費者都會審查相容性和恢復性                  | 產生的工件、遷移、操作手冊和當前證據       |

模擬ABI和API夾具可以獨立運作。它們不滿足部署或真實鏈門。

## 非同步切換模板

```text
Current state and source revision:
Changed contract or artifact:
Affected consumers:
Ready for independent work:
Blocked work and reason:
Evidence available:
Next owner action and acceptance gate:
Decision required:
```

## 攔截器處理

命名遺失的提供程式工件或權威來源、可以繼續的工作以及解鎖所需的證據。不要將模擬成功轉換為整合完成。將不相容的 ABI、API、DB、投影器或部署身分變更上報給所有提供者和消費者所有者。

## 規劃實例

使工作與現有的 P0–P5、D0–D5 和 DOC-P0–P5 里程碑保持一致。當介面明確時，切片可以並行包含協定測試、前端狀態、資料庫遷移和文件。沒有斷言速度、人員配備水準、歷史衝刺結果或指導事件。

請參閱[並行開發](parallel-development.zh-TW.md) 和[更改和發布](change-and-release.zh-TW.md)。
