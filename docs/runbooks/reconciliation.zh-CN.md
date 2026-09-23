# 如何将对账变为投影

[English](reconciliation.md) · [繁體中文](reconciliation.zh-TW.md)

对账比较相同部署下的链和投影、区块编号和区块哈希。它分别报告比较、新鲜度、范围、完整性假设和锚定。

## 操作

`MOTORCOVE_ENV=<id> pnpm ops:reconcile` 读取销售、索赔和所有权投影以及锚定合约 getter 并存储报告。它与 `CURRENT` 或滞后分开报告 `MATCH`、`MISMATCH` 或 `UNVERIFIABLE`。它不修复数据。

## 程序

1. 停止正常的Indexer和API进行维护。
2. 获取独占服务和写入锁。
3. 从检查点修复 H 并在读取前后验证其规范哈希。
4. 枚举声明的范围；不要只比较数据库中已经存在的行。
5. 保留一份包含部署、H/散列、投影器/构建/范围、比较、新鲜度、差异的报告，
   时间戳和完整性限制。
6. 对于不匹配或无法验证的结果返回非零；单独选择恢复。

RPC 的历史状态可能不可用。在这种情况下报告 `UNVERIFIABLE`；永远不会返回错误的匹配。 H 处的投影可以有效地为 `MATCH` 和 `PROJECTION_LAGGING`，而头为 H+k。 Freshness 使用锚定比较之后、报告发布之前的第二个最新头部观察结果。锚定比较保持在 H；后面的样本仅限定该结果是否仍然是最新的。发布时头读取失败仍然存在 `UNVERIFIABLE / HEAD_UNKNOWN` 及其传输原因。当前的实现读取锚定的 `saleCount` 并检查每个 Sale ID，读取该规范范围内的每个声明 getter，并独立枚举每个预计的声明行。因此，缺失、更改、额外或孤儿声明会产生 `MISMATCH`。然后，它读取锚定的 `nextTokenId` 并使用完整的 `(deployment, collection, token)` 身份检查每个铸造的代币所有者。只有清单NFT集合才能满足`ownerOf`；即使预期行也存在，另一个集合也会报告为 `UNEXPECTED_COLLECTION`。来自另一个部署的行不会进入比较。不可用的历史读取仍然会产生 `UNVERIFIABLE`。

存储的报告拥有其历史`logScopeHash`。在`GET /v1/system/reconciliation`中，该值在`data.logScopeHash`中返回；响应信封的 `provenance.logScopeHash` 描述了当前读取的快照。范围转换可能会使它们有所不同，而无需重写报告。

## 不可用的最新头部观察

如果在检查点可用后最新磁头读取失败，该命令仍将当前尝试保留为 `UNVERIFIABLE` 和 `HEAD_UNKNOWN`，记录 RPC 原因，并以非零值退出。它不会重复使用以前的报告或标题作为新运行的证据。打开或写入数据库失败仍然是外部命令失败，因为在这种情况下不能保证持久的报告。

## 独立 finalized 来源审计

`pnpm ops:audit-source -- --from <block> --to <block> --secondary-rpc-url <url>` 只读比对本地保留的区块／log 证据与独立配置的次要 RPC。范围必须符合所选链 profile 的 finalized 边界。命令返回 `MATCH`、`MISMATCH` 或 `UNVERIFIABLE`；非匹配结果以非零码退出。将次要来源视为独立证据前，须核对 chain ID、部署与运行时合约代码身份。审计不修复投影，也不发送交易。本项目验证只使用 loopback 或模拟服务商；未宣称执行公网 RPC 审计。
