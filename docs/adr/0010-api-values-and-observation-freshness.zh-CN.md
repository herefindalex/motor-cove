# ADR 0010：API 值和观察新鲜度

[English](0010-api-values-and-observation-freshness.md) · [繁體中文](0010-api-values-and-observation-freshness.zh-TW.md)

## 状态

已接受。

## 背景

数据库保留了对账报告的源范围，但读者从历史记录中忽略了该字段。销售路由验证了十进制语法，而不强制执行 EVM `uint256` 限制。市场将精确的 wei 减少为整数毫以太以供显示，同时保留钱包请求中的全部价值。最后，在工作进程心跳停止后，持久的 `CURRENT` 投影状态在视觉上仍保持当前状态。

这些是边界和表达失败。存储的链值、协议金额和投影状态机仍然具有权威性，不需要新的存储或恢复系统。

## 决定

- 历史对账数据带有自己的`logScopeHash`。响应信封保留
  当前读取快照的来源分别；两个范围都不能替代另一个范围。
- 公开销售 ID 是规范的十进制 `uint256` 字符串。 API 拒绝畸形和溢出
  调用数据库读取器之前的值。收据块选择器仍然受到应用程序的安全整数存储合约的限制。
- 交易功能使用 bigint 商和余数运算来格式化 wei。初次销售
  价格显示精确的 ETH 价值，包括亚毫以太币数量，并且永远不会通过 JavaScript `Number`。
- `projectionStatus` 明确是最后一个持久保存的投影结果。阅读演示文稿得出
  来自带有可注入时钟的工作人员心跳的 `observationFreshness` 和 `observationAgeSeconds`。默认的过时阈值是 30 秒，API 进程可以为测量的本地环境设置 `MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS`。
- 陈旧或未知的观察报告 `lagBlocks: null`；它没有发明当前的链头。
  `RECOVERY_REQUIRED` 仍然可见，并且永远不会因新鲜度呈现而被清除。

## 后果

格式错误或溢出的销售 ID 会产生 `400 INVALID_SALE_ID`；有效的丢失 ID 仍然会产生 `404 SALE_NOT_FOUND`，并且意外的读卡器故障仍然是内部错误。

用户看到的金额与资助行动收到的金额完全相同。这仅更改显示文本；它不会改变合约值、解析器、种子数据或交易请求。

停止 Indexer 会使 API 可读，而其观察结果最终会变得陈旧。工人心跳可以恢复新鲜的呈现，而无需重写投影历史。新鲜度计算是只读的，不会创建恢复标记。
