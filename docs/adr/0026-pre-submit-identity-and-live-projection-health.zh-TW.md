# ADR 0026：預先提交部署證明和即時投影運作狀況

[English](0026-pre-submit-identity-and-live-projection-health.md) · [简体中文](0026-pre-submit-identity-and-live-projection-health.zh-CN.md)

- 狀態：已接受
- 日期：2026-09-23

## 背景

當錢包提供者將預期的託管位址解析為不同的部署代時，瀏覽器帳戶、鍊和組態檢查都可以通過。透過公開 RPC 進行的成功模擬並不能證明錢包提供者將執行什麼。另外，投影可以完成落後於目前合格鏈頭的固定追趕目標。在這種情況下，從 SQLite 提交發布 `CURRENT` 誇大了即時收斂。

API 之前預設接受 `localhost` 和 `127.0.0.1` 作為前端來源，儘管記錄的本機 UI 有一個規範來源。

## 決定

儲存 `AWAITING_WALLET` 後，在開啟錢包請求之前，交易網關會檢查公共 RPC 鏈 ID 和託管 `deploymentId()`、錢包客戶端的鏈 ID 以及該託管 `deploymentId()` 的錢包提供商自己的 `eth_call` 結果。結果必須與不可變的日誌意圖相符。失敗或不可用的證明記錄 `FAILED_BEFORE_SUBMIT / OPERATION_ENVIRONMENT_MISMATCH` 並返回而不寫入錢包。非同步證明後，網關再次檢查即時瀏覽器上下文。這適用於令牌批准以及託管操作。一旦錢包請求開始，現有的未知結果和哈希恢復規則將繼續適用。

SQLite 投影提交記錄來源和檢查點進度，但不發布 `CURRENT`。僅在達到即時深度調整的合格目標並驗證其錨點後，攝取才會發布 `CURRENT`。完成舊的固定維護目標是進步，而不是即時融合的證明。 `RECOVERY_REQUIRED` 仍然是一個單獨的恢復障礙。

API 允許 `http://127.0.0.1:5173` 作為其預設瀏覽器來源。從另一個來源提供 UI 的運營商設定了一個精確的 `MOTORCOVE_WEB_ORIGIN`； API 不會默默地允許第二個本地主機名稱。

## 驗證

R24 回歸測試涵蓋公共和錢包部署分歧、沒有錢包寫入的預提交失敗、成功匹配證明、低於合格頭的固定目標追趕以及預設和配置的 CORS 來源。驗證記錄顯示執行了哪些全門。
