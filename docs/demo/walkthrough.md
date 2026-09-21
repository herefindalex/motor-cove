# Demo walkthrough

[繁體中文](walkthrough.zh-TW.md)

This guide offers three review paths and labels current product gaps. Use a fresh owned environment;
do not reset an existing environment or present an unexecuted scenario as evidence.

## 1. Core transaction path

**Status:** implemented and verified by the current contract, real-stack, and Playwright runs.

1. Inspect `SALE-001`: approval and listing are two transactions.
2. Inspect `SALE-002`: exact-value funding, receipt state, and API provenance remain separate.
3. Inspect `SALE-003`: completion transfers the NFT and creates a claim; seller withdrawal is later.
4. Inspect `SALE-004` and `SALE-005`: token reclaim and buyer refund remain independent actions.

Visible evidence should include transaction timeline, sale state, claim state, and projection block.
This path does not prove manual MetaMask compatibility or public-chain behavior.

## 2. Failure and recovery path

**Status:** wallet rejection, stale/catch-up, read-only hash recovery, SQLite rebuild/reindex,
pre/post-COMMIT process kill, and real-stack rebuild/reconciliation scenarios passed in the current
worktree.

1. Trigger test-only wallet rejection and confirm it differs from an unknown submission.
2. Pause only the managed Indexer process; the API may keep reading the last snapshot and show lag.
3. Fund on the local Anvil chain and retain the returned hash. A selector query should report
   `NOT_REACHED`; the UI says the payment executed while marketplace data is syncing.
4. Reload the saved journal. Choose **Recheck evidence**; recovery validates the original account,
   escrow, calldata, value, receipt, and `SaleFunded` log and makes zero submission calls.
5. Resume the same Indexer and observe `SCANNED + MATCHED + CONSISTENT` without a second payment.
6. For a missing hash, copy a candidate from wallet activity. A mismatched candidate is rejected;
   the recovery button never sends a transaction.
7. Use the [recovery flow](../flows/indexing-and-recovery.md) to choose catch-up, rebuild, or reindex.

The automated convergence case is:

```bash
pnpm vitest run tests/integration/transaction-convergence.test.ts
pnpm vitest run tests/integration/indexer-kill-recovery.test.ts
```

Both commands create isolated temporary environments and ports. The second command targets only its
own child PID with `SIGKILL` and keeps WAL/SHM files for normal SQLite recovery.

Do not run maintenance while API or Indexer holds the service gate. A command existing is not proof
that its recovery path passed.

## 3. Team delivery path

**Status:** repository planning artifact; it is not historical team evidence.

1. Start with the [SALE-002 work package](../collaboration/delivery-workflow.md).
2. Follow the protocol ABI through the frontend gateway, Indexer decoder/projector, and API consumer.
3. Inspect negative architecture fixtures, consumer tests, generated artifacts, and migration gates.
4. Use the async handoff template to record ready work, blockers, acceptance, and evidence.

## Cleanup

Stop only processes started for the demo. Temporary test suites remove their own roots. Preserve the
selected environment when it is failure evidence. Follow [local development](../runbooks/local-development.md)
and [acceptance evidence](acceptance-evidence.md).
