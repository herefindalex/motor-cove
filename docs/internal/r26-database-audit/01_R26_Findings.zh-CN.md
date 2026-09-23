# R26 数据库时间语意与 Schema 完整性稽核

[繁體中文](01_R26_Findings.zh-TW.md) · [English matrix](02_Temporal_Semantics_Matrix.md)

## 范围与结论

本次以 DB-DOC-2 提交 `b18e9416894c924a04ebe550ad97eb22134a9899` 为基线，检查现行
Drizzle migrations 所产生的 13 个实体表、数据库模型、writer、reader、Indexer 投影及恢复路径。
稽核没有使用用户既有数据库、真钱包或公网链；实际运行的测试及限制记于
[验证纪录](../../evidence/verification.json)。

**结论：目前没有足以支持添加数据库字段或 migration 的具体需求。** 各投影现值可以通过现有
deployment、block hash、log index、source journal 与 build／scope 身份追溯。任意增加
`created_at` 或 `updated_at` 会混淆链上时间、第一次观察时间与本机重建时间。候选字段的逐项判定见
[schema 建议](03_Schema_Change_Recommendations.md)。

## 已处理的语意问题

1. **未来的 heartbeat 被误判为新鲜。** `readSystemRecord()` 原本将负的 heartbeat age 夹成
   0；在受控时钟与真 SQLite／Fastify reader 测试中，未来一分钟的 heartbeat 让
   `observationFreshness` 为 `FRESH`、`lagBlocks` 为 `0`。添加回归测试先失败，修正后此证据
   改为 `UNKNOWN`，lag 不再被推定。保留持久化 `projectionStatus`，不改 checkpoint 或
   recovery marker。
2. **`db_contract.verified_at` 的文本太宽。** 实际写入点是 migration finalization 发布
   已验证 schema contract；一般唯读 `verifyDatabase()` 不会刷新它。TypeScript 模型与时间
   语意文档已校正。它不是「任何最近一次读取检查」的时间。

## 各表稽核重点

- `catalog_vehicles` 由 seed 插入时设置 `created_at` 与 `updated_at`；同内容重跑不写入，
  冲突数据会拒绝。添加测试以较早的既有时间验证重跑后两栏不变。目前没有受支持的原位修改流程。`catalog_asset_bindings` 同样只插入或拒绝
  冲突，seed set 与版本提供逻辑来源，因此不因缺通用时间字段而添加字段。
- `chain_events.first_seen_at` 在新 event 插入时设置；同一 event 再被看到时先核对内容并
  保留原值。明确 source-refresh 删除来源再重新取得时，新 row 的 first-seen 是重新取得时间。
  `indexed_blocks.block_timestamp` 是 header 所给链上时间，不是本机观察时间。
- `sales`、`payment_claims`、`token_ownership` 的现值由 canonical event 决定。事件
  block hash 与 log index 可定位来源，相关 block 时间可由 `indexed_blocks` 取得；本机
  `Date.now()` 不应成为重建后投影字段。
- `indexer_checkpoint.updated_at` 是本机光标 mutation；它在一般提交与维护时可能更新，
  不代表新的 RPC 观察。`indexer_runtime_status` 分别持有 worker、RPC 与 observed-head
  时间，reader 必须限制这些证据的新鲜度。
- `reconciliation_runs.created_at` 是报告组装并写入时的 publication clock；报告仍绑定
  原来的 block、scope 与 projection build，不会因为新报告或 restore 继承新的来源身份。

逐表分类、来源定位及建议请见[时间语意矩阵](02_Temporal_Semantics_Matrix.md)。本次不修改实体
schema；未来若有新需求，须依[迁移风险评估](04_Migration_Risk_Assessment.md)与
[回归测试计划](05_Regression_Test_Plan.md)先证明添加字段的价值。
