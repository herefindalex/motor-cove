# ADR 0008：验证恢复源并序列化浏览器日志写入

[English](0008-recovery-source-and-browser-journal-integrity.md) · [繁體中文](0008-recovery-source-and-browser-journal-integrity.zh-TW.md)

- **状态：**已接受
- **范围：** 投影重建、数据库恢复、交易回执观察、浏览器日志

## 背景

恢复命令比普通的失败请求更具破坏性。重建替换来自存储事件日志的派生行，恢复替换活动数据库文件。在更改活动状态之前，这两个操作都需要证明其源的身份和完整性。

浏览器事务恢复也有类似的所有权问题。每个受支持的写入操作都会在打开钱包之前记录一个意图，但多个选项卡共享一个 `localStorage` 日志。全数组读写不是跨表事务。

## 决定

投影摄取记录绑定每个原始日志信封、标准化事件和解码器版本的摘要。重建在删除任何投影行之前会验证规范块连续性、扫描完成、检查点覆盖、每块事件计数和摘要、原始包络摘要、解码器版本和绑定源记录摘要。丢失或更改的源证据无法关闭，需要重新索引。

备份格式 2 记录部署 ID 以及部署、引导程序和种子 sidecar 的存在和 SHA-256 摘要。恢复会在隔离开始之前验证该证据并将备份部署与活动数据库和活动部署清单进行比较。恢复仍然是一个数据库操作；它不会重置链或重放链种子写入。

运行时投影存储保留严格的投影器和日志范围门。维护结构仅接受指定的先前投影器版本。日志范围更改仅适用于从部署扫描开始重新索引，其中旧的规范源实际上已被删除并重新获取。

已知哈希收据观察适用于每个支持的交易操作。资金保留其额外的 `SaleFunded` 事件和投影效果检查。其他操作在规范接收成功或恢复时停止，并且不声明 Sale、付款或投影状态已收敛。

浏览器日志写入使用 Web Locks API，每个部署有一把锁。应用程序在打开钱包之前等待预提交写入。本地 Promise 队列仅在没有 Web Locks 的环境中使用，例如单元测试。较新的相同操作证据不能被较旧的写入覆盖。

## 后果

- 没有绑定源证据的遗留事件行无法重建；操作员必须重新索引它。
- 在文件切换之前，丢失、更改或与部署不兼容的 sidecar 的备份将被拒绝。
- 非资金交易状态可以在重新加载后恢复，而无需制造业务状态成功。
- 同一浏览器配置文件中的选项卡保留不同的操作，并在编写者时释放所有权
  选项卡关闭。跨设备协调不在本地浏览器日志合约之外。

## 代码和测试

- `apps/indexer/src/adapters/sqlite/sqlite-projection-store.ts`
- `apps/indexer/src/application/reindex-target.ts`
- `packages/database/src/maintenance/backup.ts`
- `packages/database/src/maintenance/restore.ts`
- `apps/web/src/integrations/evm/inspect-transaction.ts`
- `apps/web/src/integrations/persistence/local-storage-journal.ts`
- `tests/integration/indexer-store.test.ts`
- `tests/recovery/backup-restore.test.ts`
- `tests/e2e/journal-multitab.spec.ts`
