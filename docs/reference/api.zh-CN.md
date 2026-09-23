# HTTP API 参考

[English](api.md) · [繁體中文](api.zh-TW.md)

本页说明当前 Fastify 应用程序注册的路由，以及 `@motorcove/api-contracts` 定义的请求与响应数据格式。生成的 OpenAPI 文档位于 `packages/api-contracts/generated/openapi.json`。

| 方法 | 路径                        | 响应目的                             |
| ---- | --------------------------- | ------------------------------------ |
| 获取 | `/health/live`              | 仅进程活跃度                         |
| 获取 | `/health/ready`             | 读者可以获取系统状态；不全链新鲜度   |
| 获取 | `/v1/config`                | 部署、链、合约地址、融资期限         |
| 获取 | `/v1/vehicles`              | 车辆目录和预计当前车主               |
| 获取 | `/v1/sales`                 | 包含声明的部署范围销售清单           |
| 获取 | `/v1/sales/{saleId}`        | 一次销售或选择范围内的融资观察       |
| 获取 | `/v1/system/status`         | 最后投影状态，观察新鲜度、滞后、恢复 |
| 获取 | `/v1/system/events`         | 最近索引的事件证据                   |
| 获取 | `/v1/system/reconciliation` | 最新存储的对账报告                   |

## 数字和身份编码

公共模式使用十进制字符串作为 ID、wei、链 ID、区块和时间戳，这些字符串源自 EVM 整数。地址和 bytes32 值使用十六进制字符串。不要通过 JavaScript `Number` 转换 wei 或 uint256 ID。

`saleId` 是 `0..2^256-1` 中的规范十进制值：不接受符号、空格、指数、小数部分或前导零。格式错误或溢出的路由值在数据库读取器运行之前返回 `400 INVALID_SALE_ID`。没有投影 Sale 的有效 ID 将返回 `404 SALE_NOT_FOUND`。观察块选择器还限于 JavaScript 的安全整数范围，因为当前的 SQLite 块列和读取器合约使用安全整数。

## 出处

响应公开 `deploymentId`、`indexedBlockNumber`、`indexedBlockHash`、`projectorVersion`、`projectionBuildId` 和 `logScopeHash`。数据和来源在一个 SQLite 事务中读取。消费者必须使用这些字段来区分部署、源范围和投影构建。

对账端点包含两个源范围。 `data.logScopeHash`属于存储的历史报表。 `provenance.logScopeHash` 属于用于读取该报告的当前快照。它们在允许的范围转换后可能会有所不同，并且不得相互替换。

## 最近的事件证据

`GET /v1/system/events` 是原始审计源。它有意保留来自移位块的源事件以及当前的规范事件。每行包括：

| 领域                 | 含义                                   |
| -------------------- | -------------------------------------- |
| `canonical`          | 该行的源块是否位于当前选定的规范分支上 |
| `scanComplete`       | 该块的配置日志范围是否已完全扫描       |
| `sourceLogScopeHash` | 使用该源块记录的日志范围标识           |

消费者必须评估每个事件的这些字段。响应信封描述了当前的投影快照，并且不能将较旧的行标记为规范的或已移位的。当保留事件的块再次变得规范时，重新索引可以更新其规范状态；源事件本身不会被删除或重写为业务结果投影。

## 投影状态和观察新鲜度

`projectionStatus` 是 Indexer 保留的最后状态。 `observationFreshness` 描述了工人心跳是否仍然可以支持现在时健康声明：

| 价值      | 含义                         |
| --------- | ---------------------------- |
| `FRESH`   | 心跳在配置的过时阈值内。     |
| `STALE`   | 存在有效的心跳，但早于阈值。 |
| `UNKNOWN` | 没有有效的心跳时间。         |

`observationAgeSeconds` 报告测量的年龄（如果有）。当新鲜度不是 `FRESH` 时，`lagBlocks` 是 `null`：API 保留最后一个检查点和观察到的头，但不发明当前的链高度。默认的过时阈值是 30 秒。本地 API 进程可以将 `MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS` 设置为从其轮询和重试预算派生的正安全整数。此读取计算不会更改恢复标记或持久的投影状态。

## 资助观察选择器

`GET /v1/sales/{saleId}` 接受以下字段作为一组“全有或全无”：

| 查询字段             | 含义                       |
| -------------------- | -------------------------- |
| `deploymentId`       | 确切的部署范围             |
| `observeTxHash`      | 资金交易哈希               |
| `observeBlockNumber` | 收据包含高度为十进制字符串 |
| `observeBlockHash`   | 收据包含块哈希             |
| `observeLogIndex`    | RPC 事件日志索引           |

如果没有这个组，路由会保持正常的销售和 404 行为。部分或畸形的组返回 `400 INVALID_OBSERVATION_SELECTOR`；另一个部署返回 `409 DEPLOYMENT_MISMATCH`。当投影尚未到达接收块时，观察模式可能会返回`200`、`sale: null`和`coverage: NOT_REACHED`。

回应将四个问题分开：

- `coverage`：`NOT_REACHED`、`SCANNED` 或 `UNVERIFIABLE`；
- `eventLookup`：`NOT_FOUND`、`MATCHED`、`NONCANONICAL` 或 `SELECTOR_MISMATCH`；
- `projectionEffect`：`NOT_ASSESSED`、`CONSISTENT` 或 `INCONSISTENT`；
- `freshness`：观察头、观察时间和工人可用性。

`matchedEvent` 是根据存储的源证据构建的。读取器在收据高度处检查规范标头，因此块 105 处的收据不会直接与块 110 处的检查点哈希进行比较。所有行和出处都来自一个短 SQLite 读取事务。选择器输入不受信任：丢失的发明哈希永远不会写入恢复标记、停止 Indexer 或修复投影。

## 误差边界

无效或溢出的销售 ID 在销售路由中返回稳定的客户端错误。未初始化或不匹配的读取模型映射到服务不可用。意外错误会返回请求 ID，但不会暴露堆栈跟踪。未实现身份验证和分页。

参见`tests/integration/api-contract.test.ts`中的[后端架构](../architecture/backend-indexer.zh-CN.md)和API合约测试。
