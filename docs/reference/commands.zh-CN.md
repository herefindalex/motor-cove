# 命令参考

[English](commands.md) · [繁體中文](commands.zh-TW.md)

本页回答了存在哪些根命令、它们的副作用以及它们的先决条件。 `_meta/commands.json` 中的元数据拥有该表。

<!-- GENERATED:COMMANDS:START -->

| 命令                                                         | 状态   | 效果                                                                    | 先决条件                                    |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm doctor`                                                | 已实施 | 只读诊断                                                                | 安装工作区依赖项                            |
| `pnpm dev:chain`                                             | 已实施 | 开始环回 Anvil                                                          | 8545端口空闲                                |
| `pnpm dev:bootstrap`                                         | 已实施 | 部署合约、注册部署、播种目录数据并赶上投影                              | 环回 Anvil 和选定的拥有环境                 |
| `pnpm dev:full`                                              | 已实施 | 启动 API、Indexer 和 Web                                                | 所选环境的引导完成；Web 设置见下文          |
| `pnpm dev:ui`                                                | 已实施 | 仅启动 Vite Web 进程                                                    | 所选环境的引导完成；Web 设置见下文          |
| `pnpm dev:api`                                               | 已实施 | 仅启动只读 API 进程                                                     | 初始化拥有的环境                            |
| `pnpm dev:indexer`                                           | 已实施 | 仅启动普通的 Indexer 编写器                                             | 引导完成；无需维护操作                      |
| `pnpm storybook`                                             | 已实施 | 启动隔离的 UI 开发服务器                                                | 安装工作区依赖项                            |
| `pnpm generate`                                              | 已实施 | 更新 ABI、OpenAPI 和生成的工件                                          | 审查提供商来源变更                          |
| `pnpm generate:check`                                        | 已实施 | 只读生成的工件漂移检查                                                  | Solidity 更改时编译的合约                   |
| `pnpm check:architecture`                                    | 已实施 | 检查依赖图和负固定装置                                                  | 安装工作区依赖项                            |
| `pnpm check`                                                 | 已实施 | 运行格式、文档、架构、类型检查和 lint 门                                | 安装工作区依赖项                            |
| `pnpm lint`                                                  | 已实施 | 运行 ESLint 并允许零警告                                                | 安装工作区依赖项                            |
| `pnpm format:check`                                          | 已实施 | 只读 Prettier 一致性检查                                                | 安装工作区依赖项                            |
| `pnpm test:unit`                                             | 已实施 | 运行 TypeScript 单元、组件、数据库、种子和恢复套件（集成/E2E 除外）     | 安装工作区依赖项                            |
| `pnpm test:components`                                       | 已实施 | 使用 Vitest 和 JSDOM 运行 React 组件测试                                | 安装工作区依赖项                            |
| `pnpm test:contracts`                                        | 已实施 | 运行 Foundry 单元、模糊和不变测试                                       | Foundry已安装                               |
| `pnpm test:integration`                                      | 已实施 | 运行 SQLite 和隔离的真实 Anvil 集成套件                                 | 安装了 Foundry 和工作区依赖项；测试端口空闲 |
| `pnpm test:e2e`                                              | 已实施 | 启动隔离的本地 Anvil 和应用程序进程                                     | 可用端口并已安装 Foundry                    |
| `pnpm build`                                                 | 已实施 | 构建所有工作区包和应用程序                                              | 安装工作区依赖项                            |
| `pnpm release:metadata`                                      | 已实施 | 写入本地发布准备元数据而不发布                                          | 验证命令已完成                              |
| `pnpm verify`                                                | 已实施 | 本地生成、文档、架构、测试和构建门                                      | Foundry 和 Node 工具链                      |
| `pnpm ops:reconcile`                                         | 已实施 | 撰写锚链/投影对比报告                                                   | MOTORCOVE_ENV 设置； Indexer 停止           |
| `pnpm ops:rebuild`                                           | 已实施 | 根据已验证的本地证据自动重建投影                                        | MOTORCOVE_ENV 设置； API 和 Indexer 停止    |
| `pnpm demo:advance-time --seconds <n>`                       | 已实施 | 在经过验证的环回 Anvil 上推进并挖掘时间                                 | 本地 Anvil 运行在链 ID 31337 上             |
| `pnpm demo:reset -- --yes`                                   | 已实施 | 重置环回 Anvil 并从所选拥有的环境中删除生成的状态                       | MOTORCOVE_ENV 设置；停止服务；仅一次性环境  |
| `pnpm db:generate --name <name>`                             | 已实施 | 更改迁移工件和架构契约                                                  | 审查架构变更                                |
| `pnpm db:check`                                              | 已实施 | 仅临时数据库                                                            | 已安装依赖项                                |
| `pnpm db:status --env <id>`                                  | 已实施 | 只读；不创造环境                                                        | 安全环境蛞蝓                                |
| `pnpm db:plan --env <id>`                                    | 已实施 | 只读迁移计划                                                            | 安全环境蛞蝓                                |
| `pnpm db:migrate --env <id>`                                 | 已实施 | 维护写入；缺席时创造自己的环境                                          | API 和 Indexer 停止                         |
| `pnpm db:verify --env <id>`                                  | 已实施 | 协调只读验证                                                            | 拥有的初始化环境                            |
| `pnpm db:backup --env <id>`                                  | 已实施 | 使用现成的源代码和投影证据编写经过验证的标准快照                        | API和Indexer停止；无不完整的维护标记        |
| `pnpm db:restore --env <id> --backup <id> --yes`             | 已实施 | 带隔离的破坏性维护；仅接受标准现成源快照                                | 验证标准备份、匹配部署并停止服务            |
| `pnpm seed:catalog --env <id> --set motorcove-local-catalog` | 已实施 | 维护写入；无链式交易                                                    | 注册的部署清单                              |
| `pnpm seed:dev`                                              | 已实施 | 运行本地引导程序配置文件                                                | MOTORCOVE_ENV 设置；环回Anvil；拥有的环境   |
| `pnpm seed:demo`                                             | 已实施 | 运行本地演示引导配置文件                                                | MOTORCOVE_ENV 设置；环回Anvil；拥有的环境   |
| `pnpm seed:test`                                             | 已实施 | 运行隔离的测试引导配置文件                                              | 测试工具环境和环回 Anvil                    |
| `pnpm ops:recover --env <id> [--complete]`                   | 已实施 | 检查标记；完成验证的迁移/恢复恢复并保留未完成的投影工作操作所需的内容。 | 拥有的环境                                  |
| `pnpm ops:reindex -- --yes`                                  | 已实施 | 倒回源证据，重新获取规范历史，并重建投影                                | MOTORCOVE_ENV 设置；停止服务；验证环回部署  |
| `pnpm test:migrations`                                       | 已实施 | 在临时 SQLite 环境中运行本机迁移历史记录和漂移测试                      | 安装本机 SQLite 驱动程序                    |
| `pnpm test:db`                                               | 已实施 | 运行数据库所有权、锁定、约束和重置边界测试                              | 安装本机 SQLite 驱动程序                    |
| `pnpm test:seeds`                                            | 已实施 | 运行目录种子身份和幂等性测试                                            | 安装本机 SQLite 驱动程序                    |
| `pnpm test:recovery`                                         | 已实施 | 运行备份准备、恢复拒绝和维护标记恢复测试                                | 安装本机 SQLite 驱动程序                    |
| `pnpm docs:generate`                                         | 已实施 | 更新元数据拥有的 Markdown 区域和迁移衍生的数据库架构参考                | 文档元数据、数据库模型和迁移历史记录有效    |
| `pnpm docs:generate:check`                                   | 已实施 | 只读生成的 Markdown、数据库表模型覆盖率和物理模式偏差检查               | 文档元数据、数据库模型和迁移历史记录有效    |
| `pnpm docs:check`                                            | 已实施 | 只读文档一致性检查                                                      | 已安装依赖项                                |
| `pnpm docs:smoke`                                            | 已实施 | 仅临时 SQLite 测试环境                                                  | 已安装本机驱动程序                          |

<!-- GENERATED:COMMANDS:END -->

## 状态词汇

- `implemented`：根脚本和被调用条目存在。验证是单独的记录。
- `gap`：脚本不在下游或不符合其记录的合约。

`db:restore` 和 `demo:reset` 是破坏性命令。记录的 `--yes` 标志仅是操作员确认；它绝不能绕过本地链、所有权、身份或路径保护。快速入门不应在现有环境中使用它们。

运行 `dev:full` 或 `dev:ui` 前，请明确设置 `VITE_MOTORCOVE_CHAIN_ID=31337` 和 `VITE_MOTORCOVE_RPC_URL=http://127.0.0.1:8545`。

`dev:full`独立监管API、Indexer和Web。致命的 Indexer 完整性错误不会终止只读 API 或 Web 进程；检查系统状态，停止剩余服务，然后运行记录的恢复命令。 `ops:rebuild` 和 `ops:reindex` 需要独占维护访问权限，并在中断时留下失败标记。

项目命令包装工具行为。 `db:check` 并不是声称 Drizzle Kit 单独验证实时模式、约束、数据和历史校验和。
