# MotorCove 文件索引

[English](README.md) · [简体中文](README.zh-CN.md)

這份索引提供約五分鐘的專案導覽，以及約三十分鐘的實作與驗證證據閱讀路線。
`internal/` 中的中文交接規格定義需求；公開文件分別說明已檢查的實作和實際執行的驗證。

## 認識專案

1. [專案範圍](project-scope.zh-TW.md)說明業務切面、工程範圍、不做的事、限制與尚未完成的項目。
2. [技術選型](technology-choices.zh-TW.md)說明各工具負責什麼、選用原因，以及安裝工具本身不能證明什麼。
3. [架構總覽](architecture/overview.zh-TW.md)區分執行流程與程式碼依賴。
4. [工程能力對照](engineering-capability-map.zh-TW.md)將能力聲明連到程式碼、情境、已執行證據與限制。

## 追蹤一筆交易

1. [錢包與網路](flows/wallet-and-network.zh-TW.md)說明注入式錢包的連線與失敗情況。
2. [上架與付款](flows/listing-and-funding.zh-TW.md)追蹤授權、託管上架與付款。
3. [交易生命週期](protocol/transaction-lifecycle.zh-TW.md)區分交易、Sale、付款請求權與投影狀態。
4. [後端與 Indexer](architecture/backend-indexer.zh-TW.md)追蹤事件日誌如何依序形成投影。
5. [資料權責](architecture/data-authority.zh-TW.md)指出每項查詢結果所依據的權威來源。
6. [結算與請求權](flows/settlement-and-claims.zh-TW.md)說明完成與提領、取消與取回、到期與退款。

## 執行與檢查

1. [本機開發](runbooks/local-development.zh-TW.md)從新的自有環境開始。
2. [Demo 操作指南](demo/walkthrough.zh-TW.md)涵蓋正常交易、故障恢復及團隊交付；
   [繁中版本](demo/walkthrough.zh-TW.md)提供相同的可執行步驟。
3. [測試策略](testing/strategy.zh-TW.md)對照工程問題、測試層級與證據。
4. [情境目錄](testing/scenario-catalog.zh-TW.md)與[驗收證據](demo/acceptance-evidence.zh-TW.md)列出實際執行情況。
5. [命令參考](reference/commands.zh-TW.md)從根目錄腳本說明命令效果與前置條件。

操作手冊：

- [資料庫 migration](runbooks/database-migrations.zh-TW.md)
- [Seed 與 bootstrap](runbooks/seeding-and-bootstrap.zh-TW.md)
- [Indexer 恢復](runbooks/indexer-recovery.zh-TW.md)
- [投影重建與重新索引](runbooks/projection-rebuild-and-reindex.zh-TW.md)
- [對帳](runbooks/reconciliation.zh-TW.md)
- [備份、還原與維護恢復](runbooks/backup-restore-and-recovery.zh-TW.md)
- [本機重設](runbooks/local-reset.zh-TW.md)
- [資料庫變更與重設界線](runbooks/reset-and-migrations.zh-TW.md)
- [資料庫文件與 schema 契約](database/README.zh-TW.md)

## 安全地貢獻

1. [貢獻指南](../CONTRIBUTING.zh-TW.md)
2. [角色入門](onboarding/README.zh-TW.md)
3. [變更範例](onboarding/change-recipes.zh-TW.md)
4. [權責與契約](collaboration/ownership-and-contracts.zh-TW.md)
5. [平行開發](collaboration/parallel-development.zh-TW.md)
6. [交付流程](collaboration/delivery-workflow.zh-TW.md)
7. [變更與發布](collaboration/change-and-release.zh-TW.md)
8. [依賴規則](architecture/dependency-rules.zh-TW.md)

架構決策保留當時的取捨及證據界線。先讀[系統邊界](adr/0001-system-boundaries.zh-TW.md)、
[託管、儲存與恢復](adr/0002-custody-storage-recovery.zh-TW.md)及
[相容性、工具與秘密](adr/0003-compatibility-and-tools.zh-TW.md)。其後的決策依序涵蓋：

- [鏈上 seed 的不確定結果](adr/0004-chain-seed-ambiguity.zh-TW.md)
- [交易收斂](adr/0005-transaction-convergence.zh-TW.md)
- [本機 demo 錢包界線](adr/0006-local-demo-wallet-boundary.zh-TW.md)
- [並行恢復證據](adr/0007-concurrent-recovery-evidence.zh-TW.md)
- [恢復來源與瀏覽器 journal 完整性](adr/0008-recovery-source-and-browser-journal-integrity.zh-TW.md)
- [Bootstrap 與投影完整性關卡](adr/0009-bootstrap-and-projection-integrity-gates.zh-TW.md)
- [API 數值與觀察新鮮度](adr/0010-api-values-and-observation-freshness.zh-TW.md)
- [Runtime 身份與診斷證據](adr/0011-runtime-identity-and-diagnostic-evidence.zh-TW.md)
- [可續跑維護與 journal revision](adr/0012-resumable-maintenance-and-journal-revisions.zh-TW.md)
- [還原生命週期與查詢身份](adr/0013-restore-lifecycle-and-query-identity.zh-TW.md)
- [Migration 續跑與觀察期限](adr/0014-migration-resume-and-observation-deadlines.zh-TW.md)
- [投影轉換與部署前證據](adr/0015-projection-transition-and-predeployment-evidence.zh-TW.md)

## 評估目前證據

- [實作狀態](implementation-status.zh-TW.md)與[實作計畫](implementation-plan.zh-TW.md)
- [文件驗收矩陣](testing/documentation-acceptance-matrix.zh-TW.md)
- [交易介面的瀏覽器測試涵蓋範圍](testing/transaction-ux-e2e-coverage.zh-TW.md)
- [資料庫驗收矩陣](testing/database-acceptance-matrix.zh-TW.md)
- [機器可讀驗證紀錄](evidence/verification.json)
- [實測工具鏈](toolchain.zh-TW.md)

## 延伸參考

- [前端架構](architecture/frontend.zh-TW.md)
- [資料庫架構](architecture/database.zh-TW.md)與[資料庫權責及依賴](architecture/database-ownership-and-dependencies.zh-TW.md)
- [資料庫模型、權責與恢復](database/README.zh-TW.md)
- [託管協定](protocol/escrow.zh-TW.md)
- [錢包結果與受管理節點權責](adr/0016-wallet-outcomes-and-managed-node-ownership.zh-TW.md)
- [可恢復證據與無法觀察的結果](adr/0017-recoverable-evidence-and-unavailable-observations.zh-TW.md)
- [進行中 intent 與來源身份](adr/0018-in-flight-intent-and-source-identity.zh-TW.md)
- [維護 marker 與 snapshot 就緒條件](adr/0019-maintenance-marker-and-snapshot-readiness.zh-TW.md)
- [跨分頁交易觀察權責](adr/0020-cross-tab-transaction-observation-ownership.zh-TW.md)
- [跨分頁提交與 volatile evidence rebase](adr/0021-cross-tab-submission-and-volatile-rebase.zh-TW.md)
- [Bootstrap snapshot 與對帳發布](adr/0022-bootstrap-snapshots-and-reconciliation-publication.zh-TW.md)
- [重設意圖與 indexing depth 收斂](adr/0023-reset-intent-and-indexing-depth-convergence.zh-TW.md)
- [持久 attempt 權責與託管接納](adr/0024-durable-attempt-ownership-and-escrow-admission.zh-TW.md)
- [檔案系統、交易與還原證據](adr/0025-filesystem-transaction-and-restore-evidence.zh-TW.md)
- [提交前身份與投影健康](adr/0026-pre-submit-identity-and-live-projection-health.zh-TW.md)
- [恢復屏障與 bootstrap 發布](adr/0027-recovery-barrier-and-bootstrap-publication.zh-TW.md)
- [Indexer 與恢復流程](flows/indexing-and-recovery.zh-TW.md)
- [API](reference/api.zh-TW.md)、[協定產物](reference/protocol-artifacts.zh-TW.md)與
  [資料庫 schema](reference/database-schema.zh-TW.md)

這份索引中的需求、程式碼及測試存在與否，都不能單獨當成驗證已通過的證據。
