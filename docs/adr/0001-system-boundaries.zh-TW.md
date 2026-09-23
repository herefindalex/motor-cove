# ADR 0001：模組化系統和權威來源邊界

[English](0001-system-boundaries.md) · [简体中文](0001-system-boundaries.zh-CN.md)

- **狀態：**已接受並實施
- **範圍：**運行時進程、前端模組和狀態權威來源

## 背景

MotorCove 需要現實的前端、後端、鏈和恢復邊界，而無需將本地沙箱變組裝層散式平台。錢包觀察、合約狀態和查詢投影可能暫時不一致，因此共享的應用程式狀態將隱藏故障模式。

## 決定

使用具有三個運行時進程的模組化 monorepo：Web、只讀 API 和 Indexer。 Solidity 合約在本地 Anvil 上執行。 SQLite 由 API 和 Indexer 在一台主機上透過窄 `@motorcove/database` 匯出共享。

Web 使用手動組合的特性、功能、連接埠和整合層。錢包擁有使用者授權；合約擁有託管權、銷售轉讓和索賠；交易收據是觀察結果； Indexer 擁有投影寫入；API 擁有唯讀簡報。

## 為什麼

這種結構公開了真正的團隊可以協調的接口，同時保持部署和操作足夠小，以進行確定性的本地演示。單獨的狀態系列會阻止成功收據顯示為最新的 API 結果或作為付費賣家完成的銷售。

## 權衡

- 單獨的流程和提供者合約為小型產品添加了設定和相容性工作。
- 手動依賴注入是明確的，但比在功能程式碼中導入適配器更詳細。
- 本機檔案和鎖定可使操作保持可檢查性，但防止任意跨主機部署。

## 後果

靜態架構檢查拒絕跨層導入和深度包存取。提供者對 ABI、HTTP 架構、資料庫匯出、投影器身分或部署清單的變更需要消費者審查和有針對性的測試。錢包連線不是後端認證或金鑰保管。

## 程式碼和測試

- `apps/web/src/app/composition.tsx`、`apps/api/src` 和 `apps/indexer/src`
- `packages/api-contracts`、`packages/chain-artifacts` 和 `packages/database`
- `tooling/architecture/check.mjs`及其負極夾具
- [運行時架構](../architecture/overview.zh-TW.md) 和
  [依賴規則](../architecture/dependency-rules.zh-TW.md)
