# ADR 0026：预提交部署证明和实时投影运行状况

[English](0026-pre-submit-identity-and-live-projection-health.md) · [繁體中文](0026-pre-submit-identity-and-live-projection-health.zh-TW.md)

- 状态：已接受
- 日期：2026-09-23

## 背景

当钱包提供商将预期的托管地址解析为不同的部署代时，浏览器帐户、链和配置检查都可以通过。通过公开 RPC 进行的成功模拟并不能证明钱包提供商将执行什么。另外，投影可以完成落后于当前合格链头的固定追赶目标。在这种情况下，从 SQLite 提交发布 `CURRENT` 夸大了实时收敛。

API 之前默认接受 `localhost` 和 `127.0.0.1` 作为前端来源，尽管记录的本地 UI 有一个规范来源。

## 决定

保存 `AWAITING_WALLET` 后，在打开钱包请求之前，交易网关会检查公共 RPC 链 ID 和托管 `deploymentId()`、钱包客户端的链 ID 以及该托管 `deploymentId()` 的钱包提供商自己的 `eth_call` 结果。结果必须与不可变的日志意图匹配。失败或不可用的证明记录 `FAILED_BEFORE_SUBMIT / OPERATION_ENVIRONMENT_MISMATCH` 并返回而不写入钱包。异步证明后，网关再次检查实时浏览器上下文。这适用于令牌批准以及托管操作。一旦钱包请求开始，现有的未知结果和哈希恢复规则将继续适用。

SQLite 投影提交记录源和检查点进度，但不发布 `CURRENT`。仅在达到实时深度调整的合格目标并验证其锚点后，摄取才会发布 `CURRENT`。完成旧的固定维护目标是进步，而不是实时融合的证明。 `RECOVERY_REQUIRED` 仍然是一个单独的恢复障碍。

API 允许 `http://127.0.0.1:5173` 作为其默认浏览器源。从另一个源提供 UI 的运营商设置了一个精确的 `MOTORCOVE_WEB_ORIGIN`； API 不会默默地允许第二个本地主机名。

## 验证

R24 回归测试涵盖公共和钱包部署分歧、没有钱包写入的预提交失败、成功匹配证明、低于合格头的固定目标追赶以及默认和配置的 CORS 来源。验证记录表明执行了哪些全门。
