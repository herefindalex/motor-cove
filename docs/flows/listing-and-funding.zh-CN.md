# 上市及资金流程

[English](listing-and-funding.md) · [繁體中文](listing-and-funding.zh-TW.md)

本页面从 UI 意图追踪 `SALE-001` 和 `SALE-002` 到独立链和投影证据。

## 批准并列出

批准和上市是两笔交易。 `approve` 授权托管一个代币，并且不移动它。 `createSale` 验证调用者是否拥有该代币，通过安全接收者防护将其转入托管，记录 `LISTED`，并发出 `SaleCreated`。

## 基金

1. 销售页面读取 API 快照和当前钱包/网络状态。
2. EVM 网关用精确的 `priceWei` 模拟 `fundSale(saleId)`。
3. 交易日志持久记录固定意图和钱包请求边界，然后
   钱包只提交一次。
4. 合约拒绝卖方自行购买或不准确的价值。成功记录买家和到期时间。
5. 前端验证发送者、托管、呼叫数据、值、收据、规范块和确切的信息
   `SaleFunded` 日志。独立地，Indexer 拉动该事件，应用销售投影器，并推进检查点。
6. 选择器范围的 API 读取返回覆盖范围、事件查找、投影效果、新鲜度和
   出处来自一张 SQLite 快照。 `NOT_REACHED`意味着链式支付已为人所知，而市场投影仍在追赶中。
7. `MATCHED` 加上 `CONSISTENT` 证明此快照反映了资金情况。当前的Sale可能是
   `FUNDED`、`COMPLETED` 或 `EXPIRED`；后来的进展并没有消除历史资金效应。

资助永远不会产生付款要求。完成后会产生卖方收益索赔，而到期则会产生买方退款索赔。因此，反映的资金操作并不意味着结算或提款已完成。

## 未知且陈旧的结果

如果提交可能已到达 RPC，请不要仅仅因为客户端超时而重新发送。搜索已知的哈希/收据证据。在没有哈希的情况下，从钱包活动中复制候选者并运行相同的只读意图检查。不相关的候选人将被拒绝，而不更改原始条目。如果接收成功，但 API 仍然是 `LISTED`，请检查选择器观察、检查点、请求高度块哈希和部署身份；不要再付款。

代码： `apps/web/src/integrations/evm/use-escrow-gateway.ts`, `chain/src/MotorCoveEscrow.sol`, `apps/indexer/src/domain/projectors/sale-projector.ts`。验证单独记录在 [证据](../evidence/verification.json).

## 录取和重复提交不变量

在创建演示资产之前，Bootstrap 将 `VehicleNFT` 绑定到部署的托管。 NFT 拒绝任何直接安全或不安全的转移到该地址，除非托管人是执行 `createSale` 的授权操作员。这可以防止在没有跟踪的 Sale 的情况下存在托管拥有的代币。

在资金钱包请求返回哈希后，持久的日志继续拥有完整的资金意图，而包含和投影尚未解决。连续点击或重新加载无法打开对相同呼叫数据和值的第二个钱包请求。不同的 Sale 或另一个不可变的意图保持独立。
