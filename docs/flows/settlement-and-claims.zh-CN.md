# 结算和索赔流程

[English](settlement-and-claims.md) · [繁體中文](settlement-and-claims.zh-TW.md)

此页面跟踪完成、取消、到期、付款索赔和 NFT 恢复。

## 完成并退出

到期前，只有记录的买家才能完成融资销售。完成后将 NFT 转移给买方并创建 `SELLER_PROCEEDS` 索赔。然后卖方在单独的交易中调用 `withdrawPayment`。受益人授权提款；收件人可能是另一个安全地址。

## 取消并收回

只有卖家可以取消列出的销售。取消会改变销售状态，但 NFT 仍处于托管状态。卖方单独调用`reclaimToken`，如果收款人拒绝NFT且未回滚之前的取消，则可以重试转账。

## 过期、退款和回收

在链上截止日期之后，任何人都可以执行到期。这将创建 `BUYER_REFUND`；它不会自动发送 ETH。买家退款提现和卖家NFT回收是独立操作。失败的接收方调用仅回滚尝试的提款或回收交易。

## 不变量

每项资助的本金至多成为一项债权。 Claim 金额和受益人仍归属于出售。 `totalLiability`只有在转账成功后才会减少。历史买家不会成为永久所有权来源； ERC-721 `Transfer` 事件驱动当前所有权。

请参阅[托管协议](../protocol/escrow.zh-CN.md) 和 `chain/test` 下的合约测试。
