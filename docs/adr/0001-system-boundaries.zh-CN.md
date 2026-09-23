# ADR 0001：模块化系统和权威来源边界

[English](0001-system-boundaries.md) · [繁體中文](0001-system-boundaries.zh-TW.md)

- **状态：**已接受并实施
- **范围：**运行时进程、前端模块和状态权威来源

## 背景

MotorCove 需要现实的前端、后端、链和恢复边界，而无需将本地沙箱变组合层布式平台。钱包观察、合约状态和查询投影可能暂时不一致，因此一种共享的应用程序状态将隐藏故障模式。

## 决定

使用具有三个运行时进程的模块化 monorepo：Web、只读 API 和 Indexer。 Solidity 合约在本地 Anvil 上执行。 SQLite 由 API 和 Indexer 在一台主机上通过窄 `@motorcove/database` 导出共享。

Web 使用手动组合的特性、功能、端口和集成层。钱包拥有用户授权；合约拥有托管权、销售转让和索赔；交易收据是观察结果； Indexer 拥有投影写入； API 拥有只读演示文稿。

## 为什么

这种结构公开了真正的团队可以协调的接口，同时保持部署和操作足够小，以进行确定性的本地演示。单独的状态系列会阻止成功收据显示为最新的 API 结果或作为付费卖家完成的销售。

## 权衡

- 单独的流程和提供商合约为小型产品添加了设置和兼容性工作。
- 手动依赖注入是明确的，但比在功能代码中导入适配器更详细。
- 本地文件和锁使操作保持可检查性，但防止任意跨主机部署。

## 后果

静态架构检查拒绝跨层导入和深度包访问。提供商对 ABI、HTTP 架构、数据库导出、投影器身份或部署清单的更改需要消费者审查和有针对性的测试。钱包连接不是后端认证或密钥保管。

## 代码和测试

- `apps/web/src/app/composition.tsx`、`apps/api/src` 和 `apps/indexer/src`
- `packages/api-contracts`、`packages/chain-artifacts` 和 `packages/database`
- `tooling/architecture/check.mjs`及其负极夹具
- [运行时架构](../architecture/overview.zh-CN.md) 和
  [依赖规则](../architecture/dependency-rules.zh-CN.md)
