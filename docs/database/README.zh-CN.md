# 数据库文档

[English](README.md) · [繁體中文](README.zh-TW.md)

MotorCove 使用单个受管理的 SQLite 数据库，保存部署身份、链外目录的权威数据、保留的链上证据、派生投影、运行时观察状态和对账报告。这些记录各有不同的负责人和恢复规则，因此不能把整个数据库一概视为权威事实或可丢弃的缓存。

## 真理的来源

数据库合约有两个互补的来源：

1. `packages/database/drizzle` 下的可执行迁移定义了物理模式。
2. [`databaseModel`](../../packages/database/src/model.ts) 定义语义所有权和生命周期
   SQLite无法表达的事实。

`packages/database/schema-contract.json` 绑定已审核的迁移包、模式指纹、模式源、工具链和所需的投影器版本。生成的引用是通过针对隔离的内存数据库运行这些迁移来生成的；它不检查或修改托管环境。

## 按问题阅读

- [物理架构参考](schema-reference.generated.zh-CN.md)：列、键、索引、约束、
  以及根据执行的迁移历史生成的合约摘要。
- [数据库模型](database-model.zh-CN.md)：状态类、表关系以及之间的边界
  权威来源、证据、投影、运行时观察和审计历史记录。
- [权威来源和生命周期](authority-and-lifecycle.zh-CN.md)：生成的逐表所有权，
  写入器、恢复源、备份和重组矩阵以及解释规则。
- [恢复语义](recovery-semantics.zh-CN.md)：迁移、重建、重新索引、备份的效果，
  恢复并重置。
- [时间语义](temporal-semantics.zh-CN.md)：业务、链、观察、验证、
  过程活性、局部突变时间以及每个现有字段所证明的内容。
- [数据库架构](../architecture/database.zh-CN.md)：进程和包边界。
- [数据库接受矩阵](../testing/database-acceptance-matrix.zh-CN.md)：已实施并执行
  验证证据。

## 生成和漂移检查

```bash
pnpm docs:generate
pnpm docs:generate:check
pnpm docs:check
```

`docs:generate`拥有完整的物理模式参考和权威来源页面中标记的矩阵区域。生成区域之外的文本仍然是人工策划的。当迁移的表缺少语义模型条目时，检查模式会失败，并出现 `DATABASE_MODEL_TABLE_DRIFT`；当提交的生成的 Markdown 与当前输入不同时，检查模式会失败，出现 `GENERATED_DOC_DRIFT`。

## 变更规则

物理架构更改从新的迁移和审查的架构合约开始。语义所有权或恢复更改会更新同一交付中的 `databaseModel` 和人类生命周期页面。切勿编辑已应用的迁移或生成的参考以使文档与未经审核的数据库一致。
