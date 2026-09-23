# ADR 0003：生成的合约、固定工具和仅限本地的机密

[English](0003-compatibility-and-tools.md) · [繁體中文](0003-compatibility-and-tools.zh-TW.md)

- **状态：**已接受并实施
- **范围：** ABI/API/部署兼容性、工具链再现性、秘密边界

## 背景

前端和 Indexer 消费者可以针对过时的 ABI 或 HTTP 合约进行编译，即使他们自己的源代码没有更改。本地部署还需要证明它属于哪个字节码、收据块、ABI和数据库投影。 Unpinned Node、pnpm 和 Foundry 版本之前会产生不同的依赖关系和工件行为。

## 决定

从 Forge 输出生成 TypeScript ABI，从 Zod 支持的 API 合约生成 OpenAPI。将每个部署清单绑定到协议版本、ABI 哈希值、部署的运行时代码、收据块、扫描范围和随机部署标识。漂移检查将生成的工件与其提供者进行比较，消费者根据这些生成的合约进行编译和运行。

在存储库配置和 CI 中固定 Node 24.21.0、pnpm 12.5.1、Solidity 0.8.24 和 Foundry/Anvil 1.8.3。仅支持环回Anvil、合成账户、测试ETH、测试资产。不要在部署清单、前端配置、文档或证据中保留私钥或助记符。

## 为什么

生成的合约减少了手工复制的界面漂移。部署身份可防止具有相同链 ID 或重复使用地址的两个链共享投影或浏览器日志。精确的本地工具使故障可以在贡献者和 CI 环境中重现。

## 权衡

- 提供程序更改会重新生成可审查的文件，并可能创建更大的差异。
- 确切的版本需要刻意升级，而不是接受广泛的 semver 范围。
- 本地 Anvil 证据不能确定公共网络的最终性或托管提供商的兼容性。
- 兼容性检查涵盖存储库使用者，而不是未发布的第三方客户端。

## 后果

ABI、OpenAPI、模式和清单更改触发生成、消费者类型检查/构建、集成测试和文档/证据审查。远程 CI 配置在存储库中声明，发布的恢复修订版通过了它。通过运行与分支保护、所需审查和公共网络证据保持独立。

## 代码和测试

- `tooling/scripts/generate.ts` 和 `packages/chain-artifacts`
- `packages/api-contracts` 和 `tests/integration/api-contract.test.ts`
- `packages/chain-artifacts/src/manifest.ts` 和 `tests/integration/real-stack.test.ts`
- `.nvmrc`、`package.json`、`pnpm-lock.yaml`、`chain/foundry.toml` 和 `.github/workflows/ci.yml`
- [技术选择](../technology-choices.zh-CN.md) 和[工具链证据](../toolchain.zh-CN.md)
