# 数据库时间语义

[English](temporal-semantics.md) · [繁體中文](temporal-semantics.zh-TW.md)

数据库时间戳回答不同的问题。较晚的时间戳不会使行变得更权威，证明块是规范的，或证明 Indexer 仍在运行。物理列列在[生成的架构参考](schema-reference.generated.zh-CN.md)中；每表的含义记录在[数据库模型](database-model.zh-CN.md)及其[`databaseModel`源](../../packages/database/src/model.ts)中。

## 时间类别

| 类别                    | 问题已回答                          | 示例                                                                             |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `BUSINESS_TIME`         | 合约定义的状态或截止日期何时生效？  | `sales.funded_at`, `sales.expires_at`                                            |
| `CHAIN_TIME`            | 哪个链位置或区块时间戳锚定证据？    | `indexed_blocks.block_timestamp`、投影块/哈希/日志位置                           |
| `OBSERVATION_TIME`      | 这个过程什么时候观察到链或RPC证据？ | `chain_events.first_seen_at`，运行时 `last_observed_at` 和 `last_rpc_success_at` |
| `VERIFICATION_TIME`     | 当地合约或比较何时得到验证或发布？  | `db_contract.verified_at`, `reconciliation_runs.created_at`                      |
| `PROCESS_LIVENESS_TIME` | 该工人上次报告其还活着是什么时候？  | `indexer_runtime_status.worker_heartbeat_at`                                     |
| `LOCAL_MUTATION_TIME`   | 本地写入何时发生？                  | 目录时间戳、`deployments.registered_at`、`indexer_checkpoint.updated_at`         |

这些类别描述了现有的字段。不要求将 `created_at` 和 `updated_at` 添加到每个表。生成器检查 TypeScript 时间模型中命名的每个字段是否存在于其迁移的物理表中。

## 表和字段含义

| 表                       | 现有时间或位置字段                                               | 解读                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `__drizzle_migrations`   | `created_at`                                                     | 本地迁移分类账写入时间。有序迁移哈希和模式契约建立有效性。                                                                 |
| `db_contract`            | `verified_at`                                                    | 迁移完成发布了经过验证的架构合约。只读验证不推进；新的值无法弥补错误的指纹。                                               |
| `deployments`            | `registered_at`;部署块/哈希字段                                  | 本地注册时间与绑定链身份的NFT和托管部署区块不同。                                                                          |
| `catalog_vehicles`       | `created_at`, `updated_at`                                       | 本地目录写入。目录权威来源来自批准的种子/输入，而不是时钟。                                                                |
| `catalog_asset_bindings` | 没有挂钟柱                                                       | 部署、集合、令牌和目录身份定义了绑定。链重播无法重新创建目录意图。                                                         |
| `indexed_blocks`         | `block_timestamp`;数字/哈希/父哈希                               | 标头提供链时间和分支标识。 `is_canonical` 并扫描证据确定该行是否属于当前分支。                                             |
| `chain_events`           | `first_seen_at`;区块/哈希/交易/日志位置                          | 首次当地目击事件为观察时间；块和日志身份锚定事件。保留下来的孤儿证据并不会仅仅随着时间的推移而成为规范。                   |
| `indexer_checkpoint`     | `updated_at`; `last_scanned_block`/`last_scanned_hash`           | 本地原子游标更新及其链锚。时间戳无法建立最新的live head。                                                                  |
| `sales`                  | `funded_at`、`expires_at`；创建/更新块和最后事件哈希             | 合约业务时间和规范事件来源。订购销售转换不需要本地行更新时间戳。                                                           |
| `payment_claims`         | 创建/撤回区块哈希和日志索引                                      | 规范声明事件对状态进行排序；缺少本地时间戳并不意味着该声明是永恒的。                                                       |
| `token_ownership`        | `updated_block`，最后传输块哈希/日志索引                         | 最后反映的规范转移，与历史销售买家身份分开。                                                                               |
| `indexer_runtime_status` | `worker_heartbeat_at`, `last_rpc_success_at`, `last_observed_at` | 三个不同的主张：工人活跃度、RPC 成功以及观察到的工作时间。当地重建不得更新它们。                                           |
| `reconciliation_runs`    | `created_at`；`run_sequence`；比对区块／哈希与记录的链头         | `run_sequence` 是同一部署内的发布顺序。`created_at` 只表示供人阅读的发布时间，不能用来选最新报告；锚点与范围仍属历史证据。 |

Migration `0002_reconciliation_sequence` 按同一部署内可取得的 SQLite 数据行顺序，为旧报告一次性补上序号。旧版 schema 没有独立记录发布顺序，先前的数据库重写也可能改变 rowid，因此这只是旧数据的最佳可得依据。新报告在对账 maintenance ownership 下以事务方式分配 `run_sequence`；reader 按序号选最新报告。

## 新鲜感和恢复力

`CURRENT` 是经过验证的实时观察的投影状态：检查点已达到从观察到的头和 `indexingDepth` 得出的合格目标。成功的批量提交或本地维护操作本身并不能证明当前性。读者呈现最新已知状态以及工人/RPC 观察新鲜度；过期的心跳标志着观察的陈旧，而没有发明新的头部或滞后。 `RECOVERY_REQUIRED` 仍然是持久的完整性屏障，不得通过较新的心跳、普通提交、重新启动或陈旧转换来清除。如果持久的工作进程心跳晚于读者的时钟，则无法确定其年龄；读者报告 `UNKNOWN` 新鲜度并且没有数字滞后，而不是将负年龄视为零。这不会重写最后已知的投影状态。

Rebuild 验证保留的本地链证据并发布新的投影版本。它不会重新观察实时链或刷新工作人员拥有的时间戳。 Reindex 重新获取针对固定合格目标的源证据，并使用实际的链观察来确定以后的实时健康状况。恢复验证兼容的快照，而不是其保存的时间戳仍然描述实时工作人员或当前链头。操作规则参见[恢复语义](recovery-semantics.zh-CN.md)。

## 模式完整性

当前架构提供了记录的数据库生命周期所需的时间戳、排序和出处。根据当前要求，不需要额外的列或迁移。未来的工作人员心跳会以未知的新鲜度呈现，而无需更改存储的模式。
