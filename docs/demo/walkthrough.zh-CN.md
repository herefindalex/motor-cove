# Demo 操作指南

[English](walkthrough.md) · [繁體中文](walkthrough.zh-TW.md)

本指南涵盖正常交易、故障恢复证据与团队交付边界。请先依
[本机开发 runbook](../runbooks/local-development.zh-CN.md)创建新的 owned environment。不要 reset
既有环境，也不要把未实际运行的情境当成验证证据。

## 1. 使用本地 demo wallet 完成一笔交易

**状态：**Playwright 已对真实本机 Anvil、Indexer、SQLite、API 与 Web 进程运行此路径。
Connector 使用 Anvil 已解锁的测试帐号；这不是 MetaMask 测试。

以 `VITE_MOTORCOVE_DEMO_WALLET=1` 启动 `dev:full`，然后打开
<http://127.0.0.1:5173>。

1. 选择 **Use local buyer**。
2. 找到 `LISTED` 状态的 **Apex GT**，按下 **Fund exactly**。
3. 观察 transaction timeline 分别显示 wallet request、transaction hash、receipt 与
   projection evidence，并等待卡片显示 `FUNDED`。
4. 按下 **Complete sale** 并等待 `COMPLETED`。Complete 会转移 NFT 并创建 seller proceeds
   claim，不会同时提领款项。
5. 按下 **Disconnect**，选择 **Use local seller**，再按 **Withdraw proceeds**。
6. 确认 seller claim 显示 `WITHDRAWN`。

画面应分别呈现 transaction timeline、sale state、claim state 与 indexed block。Receipt
成功可能早于 Indexer projection 追上链头。

## 2. 其他合约结果

- **Approve 与 listing：**以 seller 连接，先 approve 尚未进入 escrow 的资产；等待 inclusion
  后再 create sale。这是两笔不同交易。
- **Cancel 与 reclaim：**seller cancel `LISTED` sale，之后再独立 reclaim NFT。
- **Expire、refund 与 reclaim：**buyer fund 后，把本地 Anvil 时间推进到期限之后；任一帐号
  可 expire。Buyer withdraw refund，seller 再独立 reclaim NFT。

以上路径对应 [scenario catalog](../testing/scenario-catalog.zh-CN.md) 的 `SALE-001` 到 `SALE-005`。

## 3. 故障与恢复路径

**状态：**自动化证据涵盖受控 wallet rejection、单次 broadcast 后遗失 response、唯读 hash
recovery、projection stale/catch-up、SQLite rebuild/reindex、process-kill recovery 与
reconciliation。实际浏览器钱包的故障行为仍未人工验证。

1. 运行 Playwright rejection 情境，确认拒绝显示 `REJECTED`，不是 `SUBMITTED` 或 `UNKNOWN`。
2. 只停止受管理的 Indexer。API 可以继续读取最后 snapshot，但必须显示 lag，不能宣称 current。
3. 对本地 Anvil 送出交易并保留 hash。Receipt evidence 可以领先 projection state。
4. Reload journal 后使用 **Recheck evidence**。Recovery 必须验证 account、contract、calldata、
   value、receipt、matching event 与 projection，而且不再次送交易。
5. 恢复同一个 Indexer，确认状态收敛且没有第二次付款。

以下聚焦测试会创建自己的暂存环境与 ports：

```bash
pnpm vitest run tests/integration/transaction-convergence.test.ts
pnpm vitest run tests/integration/indexer-kill-recovery.test.ts
```

## 4. 团队交付路径

从 `SALE-002` 等 scenario 开始，沿着 contract ABI、frontend gateway、Indexer
decoder/projector、API response 与文档证据追踪。宣称 ready 前应检查 negative architecture
fixtures、consumer tests、generated artifacts 与 migration gates。交接字段与证据格式见
[delivery workflow](../collaboration/delivery-workflow.zh-CN.md)。

## 清理

只停止本次 demo 启动的进程。若失败状态仍需诊断，请保留该 environment。暂存测试会清除
自己的 roots。破坏性的 demo reset 只适用于可丢弃且由 MotorCove 管理的环境，并须依
[本机 reset runbook](../runbooks/local-reset.zh-CN.md)运行。
