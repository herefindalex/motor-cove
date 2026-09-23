# 数据库所有权和依赖关系

[English](database-ownership-and-dependencies.md) · [繁體中文](database-ownership-and-dependencies.zh-TW.md)

此页面回答哪个团队角色拥有每个数据库表面以及哪些使用者可以导入它。

| 表面                                    | 业主           | 允许消费者            | 禁止的责任                     |
| --------------------------------------- | -------------- | --------------------- | ------------------------------ |
| `@motorcove/database/reader`            | 数据库维护员   | API 查询适配器        | 迁移、种子、通用 SQL 写入      |
| `@motorcove/database/projection-writer` | 数据库+Indexer | Indexer SQLite 适配器 | 目录突变、迁移、恢复           |
| `@motorcove/database/maintenance`       | 数据库+工具    | 根部维护组合物        | 正常 API 或 Indexer 运行时     |
| `@motorcove/database/types`             | 数据库维护员   | 服务器消费者          | 浏览器运行时或原始驱动程序暴露 |
| Drizzle 架构和 SQL 历史                 | 数据库维护员   | 迁移生成器/检查器     | 运行时自动迁移                 |
| 投影器                                  | Indexer        | 摄取和重建应用程序    | RPC、SQLite或进口挂钟          |

架构更改需要数据库、API、Indexer 和 QA 影响审查。提供商可以在消费者切换之前发布模式和迁移；端到端的完成仍然等待消费者集成和兼容的数据。当前的schema、reader、writer、API、Indexer消费者是集成的；未来的模式更改必须保留相同的提供者-消费者门。

请参阅[依赖规则](dependency-rules.zh-CN.md) 和[更改配方](../onboarding/change-recipes.zh-CN.md)。

## 对账诊断数据库访问

`@motorcove/database/maintenance` 仅针对 Indexer 对账 CLI 公开 `openReconciliationDatabase`。当投影状态为`RECOVERY_REQUIRED`时，它采用独占维护门，检查拥有的环境和模式，并允许诊断报告。它不能通过正常摄取或只读 API 使用。维护标记仍然阻止该报告编写者；普通 `projection-writer` 端口保持关闭状态，直到恢复完成。
