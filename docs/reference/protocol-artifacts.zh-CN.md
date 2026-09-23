# 协议工件参考

[English](protocol-artifacts.md) · [繁體中文](protocol-artifacts.zh-TW.md)

该页面指向生成的、人类可读的合约接口，而无需复制 ABI。

| 神器     | 规范来源                                    | 生成的消费者表面                                              |
| -------- | ------------------------------------------- | ------------------------------------------------------------- |
| 车辆NFT  | `chain/src/VehicleNFT.sol`                  | `packages/chain-artifacts/src/generated/vehicle-nft.ts`       |
| 托管接口 | `chain/src/interfaces/IMotorCoveEscrow.sol` | `packages/chain-artifacts/src/generated/motor-cove-escrow.ts` |
| 托管行为 | `chain/src/MotorCoveEscrow.sol`             | `@motorcove/chain-artifacts` 导出的 ABI 数组                  |
| 部署身份 | 链上`deploymentId()`及代码                  | `packages/chain-artifacts/src/manifest.ts`                    |

## 公共运营

`createSale`、`fundSale`、`completeSale`、`cancelSale`、`expireSale`、`withdrawPayment` 和 `reclaimToken` 是写操作。 `getSale`和`getPaymentClaim`提供直接链读取。车辆铸造仅限于开发所有者，属于本地设置，而不是公共市场 API。

## 活动合约

Indexer 消耗 ERC-721 `Transfer` 以及托管销售、索赔、提款和回收事件。仅 ABI 兼容性并不能建立不变的行为。提供商变更需要合约测试、重新生成工件、解码器/投影器审查、消费者测试和部署兼容性。

运行 `pnpm generate:check` 将确定性 ABI/OpenAPI 工件与源进行比较。当前的 Drizzle 迁移生成器是一个单独的项目命令。

请参阅[托管语义](../protocol/escrow.zh-CN.md) 和[交付工作流程](../collaboration/delivery-workflow.zh-CN.md)。
