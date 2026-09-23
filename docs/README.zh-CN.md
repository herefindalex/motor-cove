# MotorCove 文档索引

[English](README.md) · [繁體中文](README.zh-TW.md)

这份索引提供约五分钟的项目导览，以及约三十分钟的实作与验证证据阅读路线。
`internal/` 中的中文交接规格定义需求；公开文档分别说明已检查的实作和实际运行的验证。

## 认识项目

1. [项目范围](project-scope.md)说明业务切面、工程范围、不做的事、限制与尚未完成的项目。
2. [技术选型](technology-choices.md)说明各工具负责什么、选用原因，以及安装工具本身不能证明什么。
3. [架构总览](architecture/overview.md)区分运行流程与代码依赖。
4. [工程能力对照](engineering-capability-map.md)将能力声明连到代码、情境、已运行证据与限制。

## 追踪一笔交易

1. [钱包与网络](flows/wallet-and-network.md)说明注入式钱包的连接与失败情况。
2. [上架与付款](flows/listing-and-funding.md)追踪授权、托管上架与付款。
3. [交易生命周期](protocol/transaction-lifecycle.md)区分交易、Sale、付款请求权与投影状态。
4. [后端与 Indexer](architecture/backend-indexer.md)追踪事件日志如何依序形成投影。
5. [数据权责](architecture/data-authority.md)指出每项查找结果所依据的权威来源。
6. [结算与请求权](flows/settlement-and-claims.md)说明完成与提领、取消与取回、到期与退款。

## 运行与检查

1. [本机开发](runbooks/local-development.md)从新的自有环境开始。
2. [Demo 操作指南](demo/walkthrough.md)涵盖正常交易、故障恢复及团队交付；
   [简中版本](demo/walkthrough.zh-CN.md)提供相同的可运行步骤。
3. [测试策略](testing/strategy.md)对照工程问题、测试层级与证据。
4. [情境目录](testing/scenario-catalog.md)与[验收证据](demo/acceptance-evidence.md)列出实际运行情况。
5. [命令参考](reference/commands.md)从根目录脚本说明命令效果与前置条件。

操作手册：

- [数据库 migration](runbooks/database-migrations.md)
- [Seed 与 bootstrap](runbooks/seeding-and-bootstrap.md)
- [Indexer 恢复](runbooks/indexer-recovery.md)
- [投影重建与重新索引](runbooks/projection-rebuild-and-reindex.md)
- [对帐](runbooks/reconciliation.md)
- [备份、还原与维护恢复](runbooks/backup-restore-and-recovery.md)
- [本机重设](runbooks/local-reset.md)
- [数据库变更与重设界线](runbooks/reset-and-migrations.md)
- [数据库文档与 schema 契约](database/README.md)

## 安全地贡献

1. [贡献指南](../CONTRIBUTING.md)
2. [角色入门](onboarding/README.md)
3. [变更范例](onboarding/change-recipes.md)
4. [权责与契约](collaboration/ownership-and-contracts.md)
5. [平行开发](collaboration/parallel-development.md)
6. [交付流程](collaboration/delivery-workflow.md)
7. [变更与发布](collaboration/change-and-release.md)
8. [依赖规则](architecture/dependency-rules.md)

架构决策保留当时的取舍及证据界线。先读[系统边界](adr/0001-system-boundaries.md)、
[托管、保存与恢复](adr/0002-custody-storage-recovery.md)及
[兼容性、工具与秘密](adr/0003-compatibility-and-tools.md)。其后的决策依序涵盖：

- [链上 seed 的不确定结果](adr/0004-chain-seed-ambiguity.md)
- [交易收敛](adr/0005-transaction-convergence.md)
- [本机 demo 钱包界线](adr/0006-local-demo-wallet-boundary.md)
- [并行恢复证据](adr/0007-concurrent-recovery-evidence.md)
- [恢复来源与浏览器 journal 完整性](adr/0008-recovery-source-and-browser-journal-integrity.md)
- [Bootstrap 与投影完整性关卡](adr/0009-bootstrap-and-projection-integrity-gates.md)
- [API 数值与观察新鲜度](adr/0010-api-values-and-observation-freshness.md)
- [Runtime 身份与诊断证据](adr/0011-runtime-identity-and-diagnostic-evidence.md)
- [可续跑维护与 journal revision](adr/0012-resumable-maintenance-and-journal-revisions.md)
- [还原生命周期与查找身份](adr/0013-restore-lifecycle-and-query-identity.md)
- [Migration 续跑与观察期限](adr/0014-migration-resume-and-observation-deadlines.md)
- [投影转换与部署前证据](adr/0015-projection-transition-and-predeployment-evidence.md)

## 评估目前证据

- [实作状态](implementation-status.md)与[实作计划](implementation-plan.md)
- [文档验收矩阵](testing/documentation-acceptance-matrix.md)
- [数据库验收矩阵](testing/database-acceptance-matrix.md)
- [机器可读验证纪录](evidence/verification.json)
- [实测工具链](toolchain.md)

## 延伸参考

- [前端架构](architecture/frontend.md)
- [数据库架构](architecture/database.md)与[数据库权责及依赖](architecture/database-ownership-and-dependencies.md)
- [数据库模型、权责与恢复](database/README.md)
- [托管协定](protocol/escrow.md)
- [钱包结果与受管理节点权责](adr/0016-wallet-outcomes-and-managed-node-ownership.md)
- [可恢复证据与无法观察的结果](adr/0017-recoverable-evidence-and-unavailable-observations.md)
- [进行中 intent 与来源身份](adr/0018-in-flight-intent-and-source-identity.md)
- [维护 marker 与 snapshot 就绪条件](adr/0019-maintenance-marker-and-snapshot-readiness.md)
- [跨分页交易观察权责](adr/0020-cross-tab-transaction-observation-ownership.md)
- [跨分页提交与 volatile evidence rebase](adr/0021-cross-tab-submission-and-volatile-rebase.md)
- [Bootstrap snapshot 与对帐发布](adr/0022-bootstrap-snapshots-and-reconciliation-publication.md)
- [重设意图与 indexing depth 收敛](adr/0023-reset-intent-and-indexing-depth-convergence.md)
- [持久 attempt 权责与托管接纳](adr/0024-durable-attempt-ownership-and-escrow-admission.md)
- [文件系统、交易与还原证据](adr/0025-filesystem-transaction-and-restore-evidence.md)
- [提交前身份与投影健康](adr/0026-pre-submit-identity-and-live-projection-health.md)
- [恢复屏障与 bootstrap 发布](adr/0027-recovery-barrier-and-bootstrap-publication.md)
- [Indexer 与恢复流程](flows/indexing-and-recovery.md)
- [API](reference/api.md)、[协定产物](reference/protocol-artifacts.md)与
  [数据库 schema](reference/database-schema.md)

这份索引中的需求、代码及测试存在与否，都不能单独当成验证已通过的证据。
