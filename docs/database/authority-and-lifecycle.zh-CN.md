# 数据库权威来源和生命周期

[English](authority-and-lifecycle.md) · [繁體中文](authority-and-lifecycle.zh-TW.md)

## 如何读取矩阵

`CRITICAL`表示丢失无法仅通过普通链重放来修复。 `PREFER` 表示记录是可复制的，但可以显着改善局部恢复或保留历史证据。 `CONVENIENCE` 表示经过验证的来源可以复制它。 `NONE` 意味着新的运行时观察是合法的恢复路径。

`Rebuildable` 标识表是否可以通过其声明的恢复源重建。它不授权临时删除。维护所有权、持久操作标记、部署身份检查和来源验证仍然适用。

## 表矩阵

<!-- GENERATED:DATABASE-AUTHORITY:START -->

| 表                       | 类别                  | 权威来源                                       | 作家                                       | 派生 | 可重建 | 恢复来源                                              | 备份          | 重组语义                                                         |
| ------------------------ | --------------------- | ---------------------------------------------- | ------------------------------------------ | ---- | ------ | ----------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| `__drizzle_migrations`   | `SCHEMA_CONTROL`      | 存储库 Drizzle 迁移捆绑包                      | Drizzle 迁移运行程序                       | 不   | 不     | 已验证的数据库备份或迁移重播到新的空数据库            | `CRITICAL`    | 不依赖链。                                                       |
| `db_contract`            | `SCHEMA_CONTROL`      | 已验证的架构合约、迁移包和架构指纹             | 迁移维护操作                               | 是的 | 是的   | 成功验证存储库架构合约                                | `CONVENIENCE` | 不依赖链。                                                       |
| `deployments`            | `DEPLOYMENT_IDENTITY` | 已验证的部署清单和链上合约身份                 | 引导部署注册                               | 不   | 不     | 兼容的部署清单加上经过验证的链上身份                  | `CRITICAL`    | 部署块哈希是身份证据，不得被悄悄替换。                           |
| `catalog_vehicles`       | `OFFCHAIN_AUTHORITY`  | MotorCove 目录种子或显式本地目录输入           | 目录种子维护命令                           | 不   | 不     | 经过验证的数据库备份或准确的权威目录输入              | `CRITICAL`    | 目录行独立于链规范性。                                           |
| `catalog_asset_bindings` | `OFFCHAIN_AUTHORITY`  | MotorCove 目录权威来源受部署标识约束           | 目录种子维护命令                           | 不   | 不     | 经过验证的数据库备份或确切的权威绑定输入              | `CRITICAL`    | 绑定仍然是部署范围内的；重组不会重写目录意图。                   |
| `indexed_blocks`         | `RAW_CHAIN_EVIDENCE`  | 针对配置的部署和日志范围验证了链观察           | Indexer 摄取<br>重建索引维护               | 不   | 是的   | 从已验证的部署扫描开始显式重新索引                    | `PREFER`      | 可以保留竞争的哈希值；每个部署和高度可能只存在一个规范行。       |
| `chain_events`           | `RAW_CHAIN_EVIDENCE`  | 验证链日志观察并记录解码器版本                 | Indexer 摄取<br>重建索引维护               | 不   | 是的   | 从规范块头和日志中显式重新索引                        | `PREFER`      | 历史非规范事件仍然可审计，并通过 indexed_blocks 规范性进行解释。 |
| `indexer_checkpoint`     | `RUNTIME_OBSERVATION` | 最后一个原子提交的规范摄取单元                 | Indexer 摄取<br>投影重建<br>重新索引维护   | 是的 | 是的   | 已验证的indexed_blocks和chain_events，或显式重新索引  | `CONVENIENCE` | 检查点块和哈希必须保持不可分割的规范锚。                         |
| `sales`                  | `DERIVED_PROJECTION`  | 已验证的规范 MotorCoveEscrow 事件              | Indexer 投影器<br>投影重建<br>重新索引维护 | 是的 | 是的   | 已验证规范的 chain_events；当源证据可疑时显式重新索引 | `CONVENIENCE` | 行遵循规范的事件序列，并通过检查点更改自动回滚。                 |
| `payment_claims`         | `DERIVED_PROJECTION`  | 经过验证的规范托管索赔事件                     | Indexer 投影器<br>投影重建<br>重新索引维护 | 是的 | 是的   | 已验证规范的 chain_events；当源证据可疑时显式重新索引 | `CONVENIENCE` | Claim 状态遵循规范的创建和撤回事件。                             |
| `token_ownership`        | `DERIVED_PROJECTION`  | 已验证的规范 VehicleNFT 传输事件               | Indexer 投影器<br>投影重建<br>重新索引维护 | 是的 | 是的   | 经过验证的规范 VehicleNFT chain_events 或显式重新索引 | `CONVENIENCE` | 所有权遵循检查点的规范转移顺序。                                 |
| `indexer_runtime_status` | `RUNTIME_OBSERVATION` | Indexer运行时和实时RPC观察                     | Indexer运行时<br>显式投影维护              | 是的 | 是的   | 新的 Indexer 执行和显式恢复转换                       | `NONE`        | 发现的冲突可以使健康走向恢复；维护不能创造新鲜感。               |
| `reconciliation_runs`    | `AUDIT_EVIDENCE`      | 对账对其记录的部署、范围、检查点和头部进行观察 | 对账 CLI                                   | 是的 | 不     | 验证数据库备份；新的运行无法重现先前的观察结果        | `PREFER`      | 报告仍然与其历史锚点联系在一起，并且永远不会继承当前的规范性。   |

<!-- GENERATED:DATABASE-AUTHORITY:END -->

## 解释界限

### 权威来源

部署注册和目录数据是权威的本地输入。它们在投影重建和重新索引中幸存下来。模式控制行证明存在哪个数据库契约；手动更改它们不会迁移数据库。

### 证据

`indexed_blocks` 和 `chain_events` 保留本地验证的观测结果。仅在完成完整性、摘要、解码器、范围、检查点和规范连续性检查后，Rebuild 才会信任此源。当这些检查失败时，重新索引会从已验证的部署中重新获取它。

### 投影

`sales`、`payment_claims`、`token_ownership` 是查询投影。它们的行通过检查点原子地遵循规范事件序列。它们不会仅仅因为备份包含它们而成为独立的恢复源。

### 运行时观察

检查点记录最后提交的投影锚点。运行时状态报告工作线程运行状况、RPC 观察和恢复状态。未经最近观察而存储的 `CURRENT` 值是历史陈述，而不是当前新鲜度的证明。

### 审核历史

每个对账报告都保留自己的部署、投影构建、日志范围、检查点、链头、发布时间与部署内的 `run_sequence`。最新报告按序号选取，不按时间戳。后续运行状态不能重写旧报告的含义。
