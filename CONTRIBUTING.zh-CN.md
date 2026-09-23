# 为 MotorCove 做出贡献

[English](CONTRIBUTING.md) · [繁體中文](CONTRIBUTING.zh-TW.md)

MotorCove 接受保留其仅限本地的安全边界和明确的提供商-消费者合约的更改。该存储库已根据 Apache License 2.0 获得许可；在提交外部作品之前查看 [许可证](LICENSE)。

## 先决条件

- Linux 或 WSL2
- 通过 `.nvmrc` 选择 Node 24.21.0
- pnpm 12.5.1 至 Corepack
- Foundry/Anvil 1.8.3 用于合约或实链测试

使用 `pnpm install --frozen-lockfile` 安装依赖项。切勿使用公开的 RPC、真实的钱包秘密、真实的 ETH 或有价值的资产。

## 选择改变路径

阅读[角色入门](docs/onboarding/README.zh-CN.md) 和匹配的[更改配方](docs/onboarding/change-recipes.zh-CN.md)。共享提供程序合约包括 ABI/事件、HTTP/OpenAPI 架构、数据库架构和导出、投影器和范围版本以及部署清单。

使用最新上游默认分支中的焦点分支。使用 `feature/<behavior>` 或 `fix/<root-cause>`，切勿使用 `codex/` 前缀。保留不相关的工作树编辑。

## 本地检查

首先运行窄测试，然后运行受影响的门：

```bash
pnpm docs:check
pnpm check:architecture
pnpm verify
pnpm test:e2e
```

数据库更改还在临时环境中运行 `test:migrations`、`test:db`、`test:seeds` 和 `test:recovery`。跳过的、源检查的、模拟的或未运行的检查永远不会被报告为已通过。

## 代码边界

- Web 功能使用功能公共 API 和端口； SDK 适配器位于 `integrations` 下。
- API 只能使用数据库读取器/类型导出并保持只读。
- Indexer 域/投影器不导入 Viem、SQLite、React 或挂钟时间。
- 运行时进程不会迁移、播种、恢复或重置。
- 不要深度导入包源、发明SQL链状态或绕过项目迁移命令。
- 该存储库具有一个数据库包、架构、迁移运行器、种子路径和受保护的重置。
  不要创建并行数据库管理路径。

## 拉取请求清单

- 命名受影响的场景和功能 ID。
- 描述提供者工件的更改和每个受影响的消费者。
- 状态迁移、重建、数据保留、回滚/恢复和部署兼容性影响。
- 包括实际执行的命令、环境、结果和限制。
- 当 ABI/API/DB/CLI/投影器行为时更新参考、配方、状态和证据元数据
  变化。
- 编辑秘密、钱包材料、本地跟踪、数据库、备份和特定于环境的路径。

ABI 变更需要协议和受影响的消费者审查。 API 更改需要 API 和前端审核。数据库变更需要数据库、API、Indexer 和 QA 审核。这些是项目政策；本地 CI 无法证明远程所需审核设置。在提供真实的 GitHub 身份之前，`.github/CODEOWNERS` 保持为空。
