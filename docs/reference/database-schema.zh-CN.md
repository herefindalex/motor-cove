# 数据库架构参考

[English](database-schema.md) · [繁體中文](database-schema.zh-TW.md)

`packages/database/drizzle` 下的可执行迁移定义物理 SQLite 架构。[生成的物理参考](../database/schema-reference.generated.zh-CN.md) 在隔离的数据库中执行该历史记录，并记录每个存储库管理的表、列、主键、外键、索引、约束定义和模式契约摘要。

SQL 无法在[机器可读数据库模型](../../packages/database/src/model.ts) 和策划的[权威来源和生命周期矩阵](../database/authority-and-lifecycle.zh-CN.md) 中实时表达的架构事实。恢复行为单独记录在[数据库恢复语义](../database/recovery-semantics.zh-CN.md)中。

将 `pnpm db:verify` 用于自有托管环境。文档生成和检查仅使用内存数据库，绝不采用或修改 `data/motorcove.sqlite` 或托管环境。

```bash
pnpm docs:generate
pnpm docs:generate:check
```

第一个命令更新生成的工件。当迁移派生的架构、语义表模型或提交的生成的 Markdown 发生偏差时，第二个失败。
