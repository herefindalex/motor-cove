# 改變食譜

[English](change-recipes.md) · [简体中文](change-recipes.zh-CN.md)

此頁面提供了常見變更的六個可重複路徑。每個配方都列出了提供者和消費者的影響、驗證和當前差距。

## 如何加入前端行為

1. 將純規則放入功能模型/應用程式中，並從功能公共索引中公開它們。
2. 新增所需的 I/O 作為連接埠；實現`apps/web/src/integrations`下的SDK呼叫。
3. 在頁面或`composition.tsx`中撰寫；不要匯入其他功能的私有檔案。
4. 新增一個焦點單位或 Storybook 狀態，以及一個瀏覽器場景（為了實現錢包效果）。
5. 執行 `pnpm check:architecture`、Web 類型檢查和選定的測試。

驗證交易日誌在卸載過程中是否保留不可變的帳戶/鏈/合約意圖。

## 如何更改合約事件或函數

1. 使用單元和不變斷言更新介面和行為。
2. 運行 `pnpm test:contracts` 和 `pnpm generate`。
3. 檢視 ABI diff、解碼器、投影器、前端閘道、清單相容性和協定文件。
4. 在聲稱端到端完成之前添加真正的 Anvil 整合覆蓋範圍。

ABI 夾具可以解鎖消費者編譯；部署身分和真正的 E2E 保持阻塞狀態，直到存在真正的本地部署。

## 如何更改 API 字段

1. 更新 Zod 合約和 OpenAPI 產生器。
2. 更新閱讀器/演示器和所有瀏覽器解析點。
3. 新增提供者和消費者合約測試，然後執行 `pnpm generate:check`。
4. 更新 API 參考和功能限制。

對 `projectorVersion`、`projectionBuildId` 或 `logScopeHash` 的變更必須跨資料庫、API、Web、測試和產生的 OpenAPI 進行協調。

## 如何更換投影器

1. 說明舊/新的事件到行規則以及 `projectorVersion` 是否更改。
2. 新增純事件順序測試和原子持久性/重播測試。
3. 如果必須重新計算歷史記錄，則需要在恢復增量攝取之前進行重建。
4. 更新對帳範圍、狀態、運作手冊和證據。

投影器不能匯入 Viem、SQLite、React 或掛鐘時間。

## 如何更改資料庫結構定義

1. 編輯`packages/database/src/schema`並執行`pnpm db:generate --name <descriptive-name>`。
2. 查看 SQL、Drizzle 元資料和 `schema-contract.json`；永遠不要重寫共享遷移。
3. 運行 `pnpm db:check`、遷移、資料庫、種子和復原套件。
4. 記錄API/Indexer消費者影響、資料保存、重建需求和復原路徑。

請勿使用 `drizzle-kit push`、手動編輯本機歷史記錄或在現有環境中進行點測試。

## 如何新增或更改恢復命令

1. 定義命令何時應用、哪些進程停止、哪些身分受到保護。
2. 取得服務門，寫入鎖，然後DB連接；在更改之前寫入外部標記。
3. 使用特定的預言機新增受控崩潰視窗測試。
4. 更新命令元資料、操作手冊、資料庫矩陣和驗證記錄。

異常回滾、進程終止、檔案切換中斷和硬體斷電是不同的說法。僅記錄實際運動的程度。
