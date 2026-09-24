[English](0028-public-chain-finality-provider-trust-and-marketplace-scope.md) · [繁體中文](0028-public-chain-finality-provider-trust-and-marketplace-scope.zh-TW.md)

# ADR 0028：公链最终性、供应商信任与市集范围

- 状态：已接受
- 日期：2026-09-23

## 背景

MotorCove 起初是在 loopback Anvil 上运作的本地工程研究专案。先前的决策已明确处理交易结果不确定性、部署身分、原始链上证据、投影恢复、浏览器 journal 的持久性与 escrow 保管。若同一套架构要延伸至公用 EVM 网路，就需要先界定最终性、RPC 供应商信任，以及市集交易的范围。

Seaport、LooksRare 一类通用市集需要签章、nonce、counter、取消、部分成交，以及卖家仍持有资产时持续验证余额和授权。MotorCove 目前的 listing 会把 NFT 转入 `MotorCoveEscrow`，没有这种离链订单模型。另一方面，接近链头的区块未必已达最终性；不同链的相同确认区块数不代表相同时间或安全语意；RPC 可能缺少历史与 finalized 查询能力；本地资料即使自洽，仍可能漏掉来源。以下决策先界定这些风险。

## 决策

### 1. 投影只处理已达最终性的资料

在公链 profile 下，区块须符合该 profile 的最终性政策，才能进入应用投影。收据已包含与链上最终性是两个不同主张。浏览器可能先看到已包含交易，而市集投影仍等待最终性；这是预期行为。Anvil 是开发与测试用的明确例外，可把最新本地区块视为立即达最终性。

### 2. 支援链明确限定为 Anvil、Ethereum、Polygon

- Anvil：chain ID `31337`，只供 loopback 开发与测试。
- Ethereum：chain ID `1`。
- Polygon：chain ID `137`。

这不表示支援任意 EVM 链。Ethereum 与 Polygon 的 RPC 必须提供 profile 要求的 finalized 链上证据；能力不足时不得暗中改用 latest 或猜测确认深度。不支援的 chain ID 直接拒绝。链别政策集中在 `ChainProfile` 契约中。

### 3. 正常运作使用一个主要来源，重要稽核使用第二个来源

正常读取与索引沿用单一主要 RPC，不在每个即时请求上要求多供应商共识。重要的 finalized 来源稽核另用独立设定的次要来源，比对 MotorCove 保留的区块与 log 证据。来源不一致只形成诊断证据；稽核不会自动改写 DB，也不会触发钱包操作。本地内部一致与独立来源一致是不同主张。

### 4. Sale 预留给卖家选定的买家

建立 Sale 时，卖家指定一位 `allowedBuyer`。Escrow 合约保存此授权，只接受该地址呼叫 `fundSale` 付款。投影和 API 必须分别呈现预留买家 `allowedBuyer` 与实际已付款买家 `buyer`；成功 funding 后两者相同。这符合车辆交易先达成商业协议、再链上交割的模型，并取消公开 mempool 中任意钱包抢先付款的竞赛。

### 5. 索引继续使用轮询

保留单一 polling ingestion 路径。现阶段不增加 WebSocket 订阅、断线重订、订阅停滞侦测，以及历史与即时流之间的去重与交接。若产品确实需要比轮询周期更快的反应，再作架构决策。

### 6. Listing 继续由 escrow 保管资产

建立 listing 仍会把 NFT 转入 MotorCove escrow。本阶段不加入卖家继续持有 NFT 的离链签名 listing，因此 EIP-712 市集订单、maker counter／nonce、批次取消、部分成交、transfer conduit 及任意 execution zone 都不在范围内。`VehicleNFT` 的 escrow 绑定、直接存入拒绝、`custodySaleId` 不变条件、取回流程与 pull-payment claim 继续保留。

## 后果

### 接受最终性延迟

Finalized-only 投影会比链头投影慢。对高价车辆交易，这比维护可回滚的推测性应用状态更合适。收据已包含但投影尚未显示成交，不等于投影失败。

### 供应商能力是设定正确性的一部分

RPC URL 语法正确不足以证明可用。启动与操作工具须确认目前 profile 所需的 finalized 查询、block-hash logs 与对帐用历史状态；缺少必要能力时明确拒绝。

### 独立验证有成本，但不在热路径

关键稽核需要另一个独立来源，会增加操作成本；正常读取与索引仍只依赖主要来源。

### 预留买家交易较不开放

任意钱包不能抢先 fund 已刊登车辆。若未来要支援公开 listing、竞价或拍卖，须另作协定决策，不能只切换 UI。

### 轮询保留单一正确性模型

接受轮询延迟，以避免在现阶段引入历史与即时来源交接的第二套正确性边界。

### Escrow 保管避免离链订单失效复杂度

Listing 时转入 NFT，避免卖家之后转走资产或撤销授权，使已签署订单无法履行。代价是刊登需要保管转移，取消后也需明确取回。

## 供应商最终性模型

```text
Anvil     → 本地立即最终性
Ethereum  → 必须有 finalized RPC 证据
Polygon   → 必须有 finalized RPC 证据
```

公链投影目标取自 finalized 证据，而不是任意设定的确认区块数。若供应商不能建立所需 finalized 状态，MotorCove 不会退回 latest。未来若某个网路确有必要使用替代政策，需另以 ADR 明确说明。

## 交易生命周期

包含与最终性依序为 `SUBMITTED → INCLUDED → FINALIZED`；执行结果则是 `SUCCESS` 或 `REVERTED`。已包含但尚未 finalized 的收据仍可能成为 orphan。已 finalized 的证据若发生矛盾，视为完整性事件并进入恢复，而不是当作一般浅层 reorg。

## 来源稽核

操作员可对 finalized 范围执行唯读稽核，至少比对区块号码、区块与父区块 hash、MotorCove log scope、范围内 log 数量与 digest，以及本地保留的原始 event identity。结果为 `MATCH`、`MISMATCH` 或 `UNVERIFIABLE`；后者绝不视为 `MATCH`。稽核不送交易、不清除恢复证据，也不自动改写投影。

## 预留买家的 Sale 模型

建立 Sale 绑定 `seller`、`tokenId`、`priceWei`、`allowedBuyer`，并把 NFT 转入 escrow。付款要求 `msg.sender == allowedBuyer` 且 `msg.value == priceWei`。成功付款后，实际 `buyer` 等于 `allowedBuyer`。取消、完成、到期、退款、卖家取回与 pull-payment 语意维持既有规则，仅因栏位与事件契约所需而作机械性更新。

## 安全验证边界

既有安全政策不变。自动化与贡献者验证只用 loopback 基础设施；Ethereum 与 Polygon profile 以确定性的本地或模拟供应商测试。本 ADR 不授权 mainnet／public testnet 部署、公网 RPC、真实钱包秘密或真实资产操作。

## 曾考虑的替代方案

### 投影链头并回滚浅层 reorg

暂不采用。虽可缩短延迟，但需要可逆投影、崩溃安全的 undo 状态、热区块 journal、回滚顺序与更复杂的恢复。现有产品需求不足以支持此成本。

### 对每条 EVM 链使用固定确认深度

不采用。区块节奏与最终性行为不同，固定区块数不能跨链提供可携的时间或安全保证。

### 每个执行时操作都查多个供应商

不采用。热路径会增加延迟与复杂度。独立来源的价值集中在重要稽核与恢复证据。

### 公开先到先得付款

不符合目前车辆市集模型，会形成公开 mempool 付款竞赛。当前模型以卖家核准的交易对手进行链上交割。

### WebSocket 即时索引

目前没有足以支持订阅生命周期与历史／即时交接成本的延迟需求，因此不采用。

### 非托管签名 listing

目前不采用。它需要订单签名、重播防护、到期与取消、即时余额／授权检查，以及 nonce／counter 语意。Escrow 保管刻意避免这些表面。

## 重新评估条件

若产品需要接近链头的状态、finalized 延迟无法接受，且具备可逆投影设计与维运资源，重新评估 finalized-only。新增链有具体需求时，先文件化其最终性及供应商语意，再新增 profile。供应商分歧频繁，或安全关键流程需要多方读取共识时，重新评估单一主要来源。若产品加入公开刊登、拍卖或竞价，重新评估预留买家。若实测延迟要求即时链头，重新评估轮询。若产品要求非托管的离链刊登，重新评估 escrow 保管。

## 此实现的兼容性契约

Web 构建只选用一个明确配置的链 profile 和 RPC transport；Anvil 演示连接器不会注册到 Ethereum 或 Polygon。主要 ingestion 与只读次要审计共用事件 selector 范围：NFT `Transfer` 和八种 MotorCove escrow 生命周期事件。`logScopeHash` 绑定范围版本、链、部署、扫描起点、来源角色、地址及事件 selector；过滤契约改变时必须产生新的 hash。decoder 和 projector 的兼容性另由 projector 版本管控。

预留买家的 `createSale` 和 `SaleCreated` 是不兼容的协议变更。此实现在 manifest、API 配置、浏览器交易意图身份及发布 metadata 使用 `protocolVersion=0.2.0`；ABI 和 runtime code hash 仍独立绑定合约。Migration `0003` 保留旧 projector-v1 Sale，并将 `allowed_buyer` 设为 `NULL`，不猜测买家。旧 checkpoint 不能继续 projector-v2 增量 ingestion。本地演示环境须经过明确的受管环境 reset 和重新部署；未来正式环境的转换须另行规定 replay 或 migration 流程。

## 验证

测试须覆盖：不支援链拒绝、finalized-only 目标、供应商能力不足时拒绝、已包含与已 finalized 的不同状态、finalized anchor 矛盾进入恢复、次要来源 `MATCH`／`MISMATCH`／身份矛盾／不可用、合约强制预留买家与 outsider 拒绝、投影／API／UI／E2E 预留买家流程、escrow 保管不变条件、没有新 WebSocket 路径，以及历史回归。

最终交付须执行 `pnpm verify` 与 `pnpm test:e2e`。若只用 loopback 或模拟 fixture 验证公链 profile，必须明确记录，不能声称已做公链验证。
