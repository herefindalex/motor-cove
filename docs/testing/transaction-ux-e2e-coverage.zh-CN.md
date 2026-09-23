# 交易界面的浏览器测试覆盖范围

本矩阵将交易界面状态对应到可执行的检查。浏览器测试位于
`tests/e2e/marketplace.spec.ts`，使用测试环境专属的 Anvil、合成账户，以及实际的 API、
Indexer 和 Web 应用。测试不使用真实钱包或公共链。

`asset-approval-state.test.ts`、`use-token-approvals.test.tsx` 和 `MyAssets.test.tsx`
覆盖批准模型与组件；`SubmissionNotice.test.tsx` 和 `TransactionTimeline.test.tsx`
覆盖交易消息。破折号表示该层没有专门断言，不表示产品没有该行为。

| 界面状态或操作流程                       | 单元 | 组件 |       E2E        | 浏览器证据与边界                                                                                 |
| ---------------------------------------- | :--: | :--: | :--------------: | ------------------------------------------------------------------------------------------------ |
| 尚未批准，无法上架                       |  有  |  有  |        有        | `keeps listing gated`：检查两个操作的状态与可见消息。                                            |
| 准备批准                                 |  —   |  —   |        有        | `keeps listing gated`：暂停批准模拟；此时尚未发出钱包请求。                                      |
| 等待钱包批准                             |  有  |  —   |        有        | `keeps listing gated`：测试钱包暂停响应；操作显示忙碌且仍无法上架。                              |
| 批准已提交、尚未入块                     |  有  |  有  |        有        | `keeps listing gated`：暂停 Anvil 自动出块，检查时间线与上架限制。                               |
| 已入块、权限尚未确认                     |  有  |  有  |        有        | `keeps listing gated`：先将收据入块，再暂停批准读取；上架仍禁用。                                |
| 链上批准已确认                           |  有  |  有  |        有        | `keeps listing gated`：恢复链上读取后可上架，并实际创建 Sale。                                   |
| 批准读取不可用                           |  有  |  有  |        有        | `fails closed`：受控 RPC 错误、操作禁用，且没有钱包提交。                                        |
| 链上持有人与索引数据不同                 |  有  |  —   |        有        | `blocks listing`：受控 `ownerOf` 响应，操作禁用。                                                |
| 钱包拒绝                                 |  —   |  有  |        有        | `surfaces network and rejection`：持久化状态提示与时间线语义。                                   |
| 钱包结果未知                             |  —   |  有  |        有        | 同一测试：警示与时间线语义；候选哈希恢复不会提交交易。                                           |
| 已提交但 journal 写入失败                |  —   |  有  |        有        | `lists, expires, refunds, and reclaims`：警告、哈希、站内导航与重新加载限制。                    |
| 投影仍在追赶、观察结果有效               |  —   |  —   |        有        | `keeps pending and included evidence`：真实收据与落后的 Sale 响应，配合受控的有效 API 健康状态。 |
| 投影观察不可用                           |  —   |  —   |        有        | 同一测试：停止 Indexer，并由实际 API 报告过期观察。                                              |
| 需要恢复                                 |  —   |  —   | 有，使用 fixture | 同一测试：真实收据与落后的 Sale 响应，配合受控的 API 恢复状态；未触发完整 Indexer 恢复。         |
| 加载中与空数据的区别                     |  —   |  有  |        有        | `shows loading`：暂停 Sale 与车辆 API 响应；可访问的加载状态先于内容出现。                       |
| 时间线对已提交、已入块、拒绝、未知的说明 |  —   |  有  |        有        | 批准、投影与丢失响应流程同时检查原始状态和用户可读文字。                                         |
| 批准操作忙碌状态与重复点击防护           |  —   |  有  |        有        | `keeps listing gated`：禁用、`aria-busy` 与钱包提交次数；付款忙碌状态目前只有组件测试。          |
| 站内导航保留暂存交易哈希                 |  —   |  有  |        有        | `lists, expires, refunds, and reclaims`：路由、时间线哈希与提交次数不变。                        |
| 窄屏资产布局                             |  —   |  —   |        有        | `fails closed` 以 390 px 视窗检查价格输入与两个操作仍可见。                                      |

受控 RPC 与 API 响应会经过真实的浏览器界面，不直接修改 React 状态。“需要恢复”案例
只验证呈现；恢复行为由另外的数据库与 Indexer 测试覆盖。浏览器检查等待具体状态，
不使用固定时间的 sleep。
