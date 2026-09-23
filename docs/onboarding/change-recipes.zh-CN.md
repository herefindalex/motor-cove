# 改变食谱

[English](change-recipes.md) · [繁體中文](change-recipes.zh-TW.md)

此页面提供了常见更改的六个可重复路径。每个配方都列出了提供者和消费者的影响、验证和当前差距。

## 如何添加前端行为

1. 将纯规则放入功能模型/应用程序中，并从功能公共索引中公开它们。
2. 添加所需的 I/O 作为端口；实现`apps/web/src/integrations`下的SDK调用。
3. 在页面或`composition.tsx`中撰写；不要导入其他功能的私有文件。
4. 添加一个焦点单位或 Storybook 状态，以及一个浏览器场景（为了实现钱包效果）。
5. 运行 `pnpm check:architecture`、Web 类型检查和选定的测试。

验证交易日志在卸载过程中是否保留不可变的帐户/链/合约意图。

## 如何更改合约事件或函数

1. 使用单元和不变断言更新接口和行为。
2. 运行 `pnpm test:contracts` 和 `pnpm generate`。
3. 查看 ABI diff、解码器、投影器、前端网关、清单兼容性和协议文档。
4. 在声称端到端完成之前添加真正的 Anvil 集成覆盖范围。

ABI 夹具可以解锁消费者编译；部署身份和真正的 E2E 保持阻塞状态，直到存在真正的本地部署。

## 如何更改 API 字段

1. 更新 Zod 合约和 OpenAPI 生成器。
2. 更新阅读器/演示器和所有浏览器解析点。
3. 添加提供者和消费者合约测试，然后运行 `pnpm generate:check`。
4. 更新 API 参考和功能限制。

对 `projectorVersion`、`projectionBuildId` 或 `logScopeHash` 的更改必须跨数据库、API、Web、测试和生成的 OpenAPI 进行协调。

## 如何更换投影器

1. 说明旧/新的事件到行规则以及 `projectorVersion` 是否更改。
2. 添加纯事件顺序测试和原子持久性/重放测试。
3. 如果必须重新计算历史记录，则需要在恢复增量摄取之前进行重建。
4. 更新对账范围、状态、运行手册和证据。

投影器不能导入 Viem、SQLite、React 或挂钟时间。

## 如何更改数据库架构

1. 编辑`packages/database/src/schema`并运行`pnpm db:generate --name <descriptive-name>`。
2. 查看 SQL、Drizzle 元数据和 `schema-contract.json`；永远不要重写共享迁移。
3. 运行 `pnpm db:check`、迁移、数据库、种子和恢复套件。
4. 记录API/Indexer消费者影响、数据保存、重建需求和恢复路径。

不要使用 `drizzle-kit push`、手动编辑本机历史记录或在现有环境中进行点测试。

## 如何添加或更改恢复命令

1. 定义命令何时应用、哪些进程停止以及哪些身份受到保护。
2. 获取服务门，写入锁，然后DB连接；在更改之前写入外部标记。
3. 使用特定的预言机添加受控崩溃窗口测试。
4. 更新命令元数据、操作手册、数据库矩阵和验证记录。

异常回滚、进程终止、文件切换中断和硬件断电是不同的说法。仅记录实际锻炼的水平。
