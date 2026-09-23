# 命令參考

[English](commands.md) · [简体中文](commands.zh-CN.md)

本頁回答了存在哪些根命令、它們的副作用以及它們的先決條件。 `_meta/commands.json` 中的元資料擁有該表。

<!-- GENERATED:COMMANDS:START -->

| 命令                                                         | 狀態   | 效果                                                                    | 先決條件                                      |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| `pnpm doctor`                                                | 已實施 | 唯讀診斷                                                                | 安裝工作區相依性                              |
| `pnpm dev:chain`                                             | 已實施 | 開始環回 Anvil                                                          | 8545埠空閒                                    |
| `pnpm dev:bootstrap`                                         | 已實施 | 部署合約、註冊部署、播種目錄資料並趕上投影                              | 環回 Anvil 和選定的擁有環境                   |
| `pnpm dev:full`                                              | 已實施 | 啟動 API、Indexer 和 Web                                                | 所選環境的引導完成                            |
| `pnpm dev:ui`                                                | 已實施 | 僅啟動 Vite Web 進程                                                    | 所選環境的引導完成                            |
| `pnpm dev:api`                                               | 已實施 | 僅啟動唯讀 API 進程                                                     | 初始化擁有的環境                              |
| `pnpm dev:indexer`                                           | 已實施 | 僅啟動普通的 Indexer 編寫器                                             | 引導完成；無需維護操作                        |
| `pnpm storybook`                                             | 已實施 | 啟動隔離的 UI 開發伺服器                                                | 安裝工作區相依性                              |
| `pnpm generate`                                              | 已實施 | 更新 ABI、OpenAPI 和產生的工件                                          | 審查提供者來源變更                            |
| `pnpm generate:check`                                        | 已實施 | 只讀產生的工件漂移檢查                                                  | Solidity 更改時編譯的合約                     |
| `pnpm check:architecture`                                    | 已實施 | 檢查依賴圖和負固定裝置                                                  | 安裝工作區相依性                              |
| `pnpm check`                                                 | 已實施 | 運行格式、文件、架構、型別檢查和 lint 門                                | 安裝工作區相依性                              |
| `pnpm lint`                                                  | 已實施 | 運行 ESLint 並允許零警告                                                | 安裝工作區相依性                              |
| `pnpm format:check`                                          | 已實施 | 只讀 Prettier 一致性檢查                                                | 安裝工作區相依性                              |
| `pnpm test:unit`                                             | 已實施 | 運行 TypeScript 單元、組件、資料庫、種子和恢復套件（整合/E2E 除外）     | 安裝工作區相依性                              |
| `pnpm test:components`                                       | 已實施 | 使用 Vitest 和 JSDOM 執行 React 元件測試                                | 安裝工作區相依性                              |
| `pnpm test:contracts`                                        | 已實施 | 運行 Foundry 單元、模糊和不變測試                                       | Foundry已安裝                                 |
| `pnpm test:integration`                                      | 已實施 | 運行 SQLite 和隔離的真實 Anvil 整合套件                                 | 安裝了 Foundry 和工作區相依性；測試連接埠空閒 |
| `pnpm test:e2e`                                              | 已實施 | 啟動隔離的本機 Anvil 和應用程式進程                                     | 可用連接埠並已安裝 Foundry                    |
| `pnpm build`                                                 | 已實施 | 建立所有工作區包和應用程式                                              | 安裝工作區相依性                              |
| `pnpm release:metadata`                                      | 已實施 | 寫入本地發布準備元資料而不發布                                          | 驗證命令已完成                                |
| `pnpm verify`                                                | 已實施 | 本機生成、文件、架構、測試和建置門                                      | Foundry 和 Node 工具鏈                        |
| `pnpm ops:reconcile`                                         | 已實施 | 撰寫錨鏈/投影比較報告                                                   | MOTORCOVE_ENV 設定； Indexer 停止             |
| `pnpm ops:rebuild`                                           | 已實施 | 根據已驗證的本地證據自動重建投影                                        | MOTORCOVE_ENV 設定； API 和 Indexer 停止      |
| `pnpm demo:advance-time --seconds <n>`                       | 已實施 | 在經過驗證的環回 Anvil 上推進並挖掘時間                                 | 本地 Anvil 運行在鏈 ID 31337 上               |
| `pnpm demo:reset -- --yes`                                   | 已實施 | 重置環回 Anvil 並從所選擁有的環境中刪除已產生的狀態                     | MOTORCOVE_ENV 設定；停止服務；僅限一次性環境  |
| `pnpm db:generate --name <name>`                             | 已實施 | 更改遷移工件和架構契約                                                  | 審查架構變更                                  |
| `pnpm db:check`                                              | 已實施 | 僅臨時資料庫                                                            | 已安裝相依性                                  |
| `pnpm db:status --env <id>`                                  | 已實施 | 只讀；不創造環境                                                        | 安全環境蛞蝓                                  |
| `pnpm db:plan --env <id>`                                    | 已實施 | 只讀遷移計劃                                                            | 安全環境蛞蝓                                  |
| `pnpm db:migrate --env <id>`                                 | 已實施 | 維護寫入；缺席時創造自己的環境                                          | API 和 Indexer 停止                           |
| `pnpm db:verify --env <id>`                                  | 已實施 | 協調唯讀驗證                                                            | 擁有的初始化環境                              |
| `pnpm db:backup --env <id>`                                  | 已實施 | 使用現成的原始程式碼和投影證據編寫經過驗證的標準快照                    | API和Indexer停止；無不完整的維護標記          |
| `pnpm db:restore --env <id> --backup <id> --yes`             | 已實施 | 帶隔離的破壞性維護；僅接受標準現成來源快照                              | 驗證標準備份、匹配部署並停止服務              |
| `pnpm seed:catalog --env <id> --set motorcove-local-catalog` | 已實施 | 維護寫入；無鍊式交易                                                    | 註冊的部署清單                                |
| `pnpm seed:dev`                                              | 已實施 | 運行本機引導程式設定檔                                                  | MOTORCOVE_ENV 設定；環回Anvil；擁有的環境     |
| `pnpm seed:demo`                                             | 已實施 | 運行本機演示引導設定檔                                                  | MOTORCOVE_ENV 設定；環回Anvil；擁有的環境     |
| `pnpm seed:test`                                             | 已實施 | 運行隔離的測試引導配置文件                                              | 測試工具環境和環回 Anvil                      |
| `pnpm ops:recover --env <id> [--complete]`                   | 已實施 | 檢查標記；完成驗證的遷移/復原復原並保留未完成的投影工作作業所需的內容。 | 擁有的環境                                    |
| `pnpm ops:reindex -- --yes`                                  | 已實施 | 倒回來源證據，重新取得規範歷史，並重建投影                              | MOTORCOVE_ENV 設定；停止服務；驗證環回部署    |
| `pnpm test:migrations`                                       | 已實施 | 在臨時 SQLite 環境中執行本機遷移歷史記錄和漂移測試                      | 安裝本機 SQLite 驅動程式                      |
| `pnpm test:db`                                               | 已實施 | 運行資料庫所有權、鎖定、約束和重置邊界測試                              | 安裝本機 SQLite 驅動程式                      |
| `pnpm test:seeds`                                            | 已實施 | 運行目錄種子身份和冪等性測試                                            | 安裝本機 SQLite 驅動程式                      |
| `pnpm test:recovery`                                         | 已實施 | 運行備份準備、恢復拒絕和維護標記恢復測試                                | 安裝本機 SQLite 驅動程式                      |
| `pnpm docs:generate`                                         | 已實施 | 更新元資料擁有的 Markdown 區域和遷移衍生的資料庫架構參考                | 文檔元資料、資料庫模型和遷移歷史記錄有效      |
| `pnpm docs:generate:check`                                   | 已實施 | 只讀產生的 Markdown、資料庫表模型覆蓋率和物理模式偏差檢查               | 文檔元資料、資料庫模型和遷移歷史記錄有效      |
| `pnpm docs:check`                                            | 已實施 | 只讀文檔一致性檢查                                                      | 已安裝相依性                                  |
| `pnpm docs:smoke`                                            | 已實施 | 僅臨時 SQLite 測試環境                                                  | 已安裝本機驅動程式                            |

<!-- GENERATED:COMMANDS:END -->

## 狀態詞彙

- `implemented`：根腳本和被呼叫條目存在。驗證是單獨的記錄。
- `gap`：腳本不在下游或不符合其記錄的合約。

`db:restore` 和 `demo:reset` 是破壞性指令。記錄的 `--yes` 標誌僅是操作員確認；它絕不能繞過本地鏈、所有權、身分或路徑保護。快速入門不應在現有環境中使用它們。

`dev:full`獨立監理API、Indexer和Web。致命的 Indexer 完整性錯誤不會終止唯讀 API 或 Web 程序；檢查系統狀態，停止剩餘服務，然後執行記錄的復原指令。 `ops:rebuild` 和 `ops:reindex` 需要獨佔維護存取權限，並在中斷時留下失敗標記。

項目指令包裝工具行為。 `db:check` 並不是聲稱 Drizzle Kit 單獨驗證即時模式、約束、資料和歷史校驗和。
