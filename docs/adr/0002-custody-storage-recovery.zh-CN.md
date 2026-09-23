# ADR 0002：托管保管、本地存储和显式恢复

[English](0002-custody-storage-recovery.md) · [繁體中文](0002-custody-storage-recovery.zh-TW.md)

- **状态：** 在记录的当地限制内接受并实施
- **范围：**资产托管、债权、SQLite所有权、Indexer追偿

## 背景

NFT 或付款签订合约后，销售可能会失败。接收者可以拒绝 ETH 或 NFT。事件投影可以在存储源证据之后但在读取模型为当前之前停止。该数据库还包含无法从链日志重新创建的目录数据。

## 决定

仅当创建销售时才将 NFT 转入托管。完成、取消、到期设定结算结果；卖方收益或买方退款使用拉取索赔； NFT 交付或回收是单独的可重试操作。

将同一主机 SQLite WAL 与一个投影编写器和维护排除一起使用。将目录行视为链外权威来源，将事件派生行视为可重建的投影。检测检查点或规范历史不匹配并停止。对故障进行分类后，操作员可以选择追赶、重建、重新索引、恢复或新部署。 对账在一个块/哈希上进行比较，并且从不自动修复状态。

## 为什么

拉取索赔和单独的 NFT 传输可以让失败的接收者重试，而无需回滚记录的销售结果。混合权威来源在投影重建期间保持目录编辑的安全。检测并停止可以避免在本地链重置期间默默地选择规范分支或销毁证据。

## 权衡

- 结算需要额外的用户交易进行提现、退款和代币回收。
- SQLite WAL 和咨询文件锁仅限于一台主机和受信任的本地进程。
- 恢复需要操作人员分类和停机；不存在自动通用重组修复。
- 对账通过锚定合约计数器枚举销售和铸造的代币；它仍然
  取决于该块的历史 RPC 读取。

## 后果

Sale 状态、声明状态、代币回收、交易观察和投影新鲜度在 UI、API 和测试中保持独立。重建保留目录数据。重置、迁移、恢复、重建和重新索引仍然是不同的受保护命令。重建和重新索引使用专有的维护门和耐用的操作标记。当所选链历史具有相同的块哈希时，重新索引恢复规范成员资格并重新应用已存储的事件；源证据仍然只是附加的。

## 代码和测试

- `chain/src/MotorCoveEscrow.sol` 和 `chain/test`
- `packages/database/src` 和 `apps/indexer/src`
- `tests/integration/indexer-store.test.ts`、`tests/integration/real-stack.test.ts` 和
  `tests/integration/reindex-canonical.test.ts`
- `tests/recovery/backup-restore.test.ts` 和 `tests/database/projection-maintenance.test.ts`
- [托管协议](../protocol/escrow.zh-CN.md)、[数据库架构](../architecture/database.zh-CN.md)、
  和[索引恢复](../flows/indexing-and-recovery.zh-CN.md)
