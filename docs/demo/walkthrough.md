# Demo walkthrough

[繁體中文](walkthrough.zh-TW.md) · [简体中文](walkthrough.zh-CN.md)

This guide covers the normal transaction path, recovery evidence, and team delivery boundaries. Use
a fresh owned environment from the [local development runbook](../runbooks/local-development.md).
Never reset an existing environment or present an unexecuted scenario as evidence.

## 1. Completed sale with the local demo wallet

**Status:** implemented and exercised by Playwright against real local Anvil, Indexer, SQLite, API,
and web processes. The connector uses unlocked Anvil test accounts; it is not a MetaMask test.

Start `dev:full` with `VITE_MOTORCOVE_DEMO_WALLET=1`, then open
<http://127.0.0.1:5173>.

1. Choose **Use local buyer**.
2. Find **Apex GT** in `LISTED` state and click **Fund exactly**.
3. Watch the transaction timeline progress independently through wallet request, transaction hash,
   receipt, and projection evidence. Wait for the marketplace card to show `FUNDED`.
4. Click **Complete sale** and wait for `COMPLETED`. Completion transfers the NFT and creates the
   seller's proceeds claim; it does not withdraw the proceeds.
5. Click **Disconnect**, choose **Use local seller**, and click **Withdraw proceeds**.
6. Confirm the seller claim shows `WITHDRAWN`.

The visible evidence should include the transaction timeline, sale state, claim state, and indexed
block. Receipt success may appear before the Indexer projection catches up.

## 2. Other contract outcomes

- **Approve and list:** connect as the seller, approve an unescrowed asset, wait for inclusion, then
  create a sale. Approval and listing are separate transactions.
- **Cancel and reclaim:** the seller cancels a `LISTED` sale, then reclaims the NFT separately.
- **Expire, refund, and reclaim:** a buyer funds a sale; after advancing local Anvil time beyond the
  deadline, any account expires it. The buyer withdraws the refund and the seller reclaims the NFT as
  separate operations.

These paths correspond to `SALE-001` through `SALE-005` in the
[scenario catalog](../testing/scenario-catalog.md).

## 3. Failure and recovery path

**Status:** automated evidence covers controlled wallet rejection, response loss after one broadcast,
read-only hash recovery, stale/catch-up projection, SQLite rebuild/reindex, process-kill recovery,
and reconciliation. Manual browser-wallet failure behavior remains unverified.

1. Run the Playwright rejection scenario and confirm rejection produces `REJECTED`, not `SUBMITTED`
   or `UNKNOWN`.
2. Stop only the managed Indexer process. The API may continue serving its last snapshot and must
   expose lag rather than claim freshness.
3. Submit a local Anvil transaction and retain its hash. Receipt evidence can lead projection state.
4. Reload the saved journal and use **Recheck evidence**. Recovery verifies account, contract,
   calldata, value, receipt, matching event, and projection without submitting again.
5. Resume the same Indexer and observe convergence without a second payment.

Focused recovery commands create their own temporary environments and ports:

```bash
pnpm vitest run tests/integration/transaction-convergence.test.ts
pnpm vitest run tests/integration/indexer-kill-recovery.test.ts
```

## 4. Team delivery path

Start from a scenario such as `SALE-002`, then trace the contract ABI through the frontend gateway,
Indexer decoder/projector, API response, and documentation evidence. Inspect negative architecture
fixtures, consumer tests, generated artifacts, and migration gates before claiming the work is ready.
Use the [delivery workflow](../collaboration/delivery-workflow.md) for handoff fields and evidence.

## Cleanup

Stop only the processes started for this demo. Preserve a failed environment when its state is needed
for diagnosis. Temporary test suites remove their own roots. Destructive demo reset is limited to a
disposable MotorCove-owned environment and requires the separate
[local reset runbook](../runbooks/local-reset.md).
