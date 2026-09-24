# 如何在本地检查MotorCove

[English](local-development.md) · [繁體中文](local-development.zh-TW.md)

使用此 Runbook 来检查源代码、运行安全检查并启动新的隔离本地堆栈。

## 先决条件

在 Linux 或 WSL2 上使用 Node 24.21.0、pnpm 12.5.1、Foundry/Anvil 1.8.3 和 SQLite 3。此环境不得使用公共 RPC URL、真实密钥、真实 ETH 或有价值资产。

## 安全检查

```bash
nvm use
pnpm install --frozen-lockfile
pnpm doctor
pnpm docs:check
pnpm db:check
```

这些命令不会启动 Anvil 或打开现有的 MotorCove 数据环境。 `db:check` 使用临时 SQLite 数据库。

## 开始一个孤立的演示

选择一个新的环境 ID。运行时状态写在`.motorcove/environments/<id>`下；部署清单是生成的本地工件。不要采用或重置现有数据库。

1 号航站楼：

```bash
nvm use
export MOTORCOVE_ENV=demo-local
pnpm dev:chain
```

Anvil准备好后，终端2：

```bash
nvm use
export MOTORCOVE_ENV=demo-local
pnpm dev:bootstrap
VITE_MOTORCOVE_CHAIN_ID=31337 VITE_MOTORCOVE_RPC_URL=http://127.0.0.1:8545 VITE_MOTORCOVE_DEMO_WALLET=1 pnpm dev:full
```

打开<http://127.0.0.1:5173>。显式演示标志添加了 **使用本地卖家** 和 **使用本地买家** 连接器。他们使用解锁的Anvil账户，并通过Wagmi和Viem发送真实交易。仅 Vite 开发服务器遵循该标志，如果其 RPC 不是环回，则启动失败。捆绑包中仅存在公共测试地址；没有嵌入私钥。

API 默认接受这个确切的浏览器来源。如果故意从不同的源提供 UI，请在启动 API 之前将 `MOTORCOVE_WEB_ORIGIN` 设置为该源。 `localhost` 拼写是不同的来源，默认 CORS 策略不允许。

测试注入钱包时，将 `VITE_MOTORCOVE_DEMO_WALLET` 保持未设置状态。使用 RPC `http://127.0.0.1:8545`、链 ID `31337` 和 Anvil 测试帐户配置该钱包。

## 单击完成的销售路径

1. 选择**使用本地买家**。
2. 在 **Apex GT** 上，单击 **准确资金** 并等待 `FUNDED`。
3. 点击**完成销售**，等待`COMPLETED`。
4. 点击**断开连接**，然后点击**使用本地卖家**。
5. 点击**提现收益**并等待`WITHDRAWN`。

交易时间线将钱包请求、提交的哈希值、收据和投影证据显示为单独的状态。按照[演示演练](../demo/walkthrough.zh-CN.md) 了解其他销售结果。

## 停止条件

仅当引导程序记录了部署身份、目录绑定、目标块/哈希、一次性追赶及其在同一拥有环境中的接收后，完整的本地演示才准备就绪。在部署不匹配、维护标记、未知种子结果、架构/历史分歧或公共/非环回 RPC 时停止。请参阅[播种和引导](seeding-and-bootstrap.zh-CN.md)、[项目范围](../project-scope.zh-CN.md) 和[备份和恢复](backup-restore-and-recovery.zh-CN.md)。
