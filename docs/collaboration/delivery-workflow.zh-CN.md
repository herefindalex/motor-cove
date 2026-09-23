# 交付工作流程

[English](delivery-workflow.md) · [繁體中文](delivery-workflow.zh-TW.md)

此页面演示了提供者-消费者工作包和可重用的异步切换。这是一个规划模型，而不是声称真正的团队执行了这个时间表。

## 示例工作包：SALE-002 基金销售

| 舞台         | 提供者             | 消费者或并行工作                                  | 硬出口门                                   |
| ------------ | ------------------ | ------------------------------------------------- | ------------------------------------------ |
| 界面和行为   | 协议               | 前端可以使用 ABI 夹具构建类型化状态               | 准确的付款、卖家排除、事件字段和商定的错误 |
| 消费者发展   | 前端+Indexer       | UI状态和解码器/投影器可以并行进行                 | 记录提供者工件哈希值；模拟标记             |
| 实际部署     | 协议/工具          | API 配置和浏览器部署验证                          | 清单匹配 getter、代码、ABI 和块            |
| 数据整合     | Indexer/数据库     | API Presenter 和 Inspector 消耗固定的 Reader 合约 | 原子源/投影/检查点行为已验证               |
| 端到端验证   | 质量保证           | 文件/证据可能已准备好但未标记为通过               | 真实Anvil + SQLite + API + 浏览器断言通过  |
| 发布准备情况 | 受影响合约的所有者 | 所有消费者都会审查兼容性和恢复性                  | 生成的工件、迁移、操作手册和当前证据       |

模拟ABI和API夹具可以独立工作。它们不满足部署或真实链门。

## 异步切换模板

```text
Current state and source revision:
Changed contract or artifact:
Affected consumers:
Ready for independent work:
Blocked work and reason:
Evidence available:
Next owner action and acceptance gate:
Decision required:
```

## 拦截器处理

命名丢失的提供程序工件或权威来源、可以继续的工作以及解锁所需的证据。不要将模拟成功转换为集成完成。将不兼容的 ABI、API、DB、投影器或部署身份更改上报给所有提供商和消费者所有者。

## 规划实例

使工作与现有的 P0–P5、D0–D5 和 DOC-P0–P5 里程碑保持一致。当接口明确时，切片可以并行包含协议测试、前端状态、数据库迁移和文档。没有断言速度、人员配备水平、历史冲刺结果或指导事件。

请参阅[并行开发](parallel-development.zh-CN.md) 和[更改和发布](change-and-release.zh-CN.md)。
