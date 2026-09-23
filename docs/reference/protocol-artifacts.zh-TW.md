# 協議工件參考

[English](protocol-artifacts.md) · [简体中文](protocol-artifacts.zh-CN.md)

該頁面指向生成的、人類可讀的合約接口，而無需複製 ABI。

| 神器     | 規範來源                                    | 生成的消費者表面                                              |
| -------- | ------------------------------------------- | ------------------------------------------------------------- |
| 車輛NFT  | `chain/src/VehicleNFT.sol`                  | `packages/chain-artifacts/src/generated/vehicle-nft.ts`       |
| 託管介面 | `chain/src/interfaces/IMotorCoveEscrow.sol` | `packages/chain-artifacts/src/generated/motor-cove-escrow.ts` |
| 託管行為 | `chain/src/MotorCoveEscrow.sol`             | `@motorcove/chain-artifacts` 匯出的 ABI 陣列                  |
| 部署身份 | 鏈上`deploymentId()`及程式碼                | `packages/chain-artifacts/src/manifest.ts`                    |

## 公共營運

`createSale`、`fundSale`、`completeSale`、`cancelSale`、`expireSale`、`withdrawPayment` 和 `reclaimToken` 是寫入操作。 `getSale`和`getPaymentClaim`提供直接鏈讀取。車輛鑄造僅限於開發所有者，屬於本地設置，而不是公共市場 API。

## 活動合約

Indexer 消耗 ERC-721 `Transfer` 以及託管銷售、索賠、提款和回收事件。僅 ABI 相容性並不能建立不變的行為。提供者變更需要合約測試、重新產生工件、解碼器/投影器審查、消費者測試和部署相容性。

運行 `pnpm generate:check` 將確定性 ABI/OpenAPI 工件與來源進行比較。目前的 Drizzle 遷移生成器是一個單獨的專案命令。

請參閱[託管語意](../protocol/escrow.zh-TW.md) 和[交付工作流程](../collaboration/delivery-workflow.zh-TW.md)。
