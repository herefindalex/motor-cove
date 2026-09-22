# ADR 0014: Migration continuation and bounded transaction observation

- **Status:** accepted
- **Date:** 2026-09-22

## Context

An interrupted migration left one of two valid states: an unchanged known migration prefix, or the
current SQL schema before `db_contract` finalization. The durable `MIGRATE` marker did not identify
the target migration bundle, so the migration command refused every retry while generic recovery
could clear a current-schema marker without finishing metadata.

Browser transaction recovery also had two asymmetric lifetime rules. An HTTP response body could
remain pending after headers arrived and retain the Observer single-flight slot indefinitely.
Successful receipts remained under automatic local observation while reverted receipts stopped.

## Decision

1. A new migration marker records the expected schema contract and migration-bundle digest. A
   migration may continue an existing marker only when operation, environment, database path,
   schema contract, and bundle digest all match.
2. Recovery verifies native history before acting. A known older prefix remains marked and returns
   `RERUN_MATCHING_MIGRATION`. A current schema is verified, its `db_contract` metadata is finalized
   from the checked repository contract, verified again as a source database, and only then has its
   marker cleared. Unknown history, schema drift, and identity mismatch remain fail closed.
3. The Web HTTP adapter gives headers and body consumption one AbortController deadline. Timeout
   aborts the underlying fetch, records the existing unavailable verification outcome through the
   recovery path, and releases the Observer single-flight slot.
4. `INCLUDED_SUCCESS` and `INCLUDED_REVERTED` use the same local non-final automatic observation
   policy. Wallet rejection and failure before submission remain excluded. This policy supports
   reorg and same-hash reinclusion detection; it is not a public-network finality claim.

## Consequences

- Operators can resume the exact migration bundle without deleting durable failure evidence.
- A crash after SQL commit cannot be reported recovered while source-contract metadata is stale.
- A stalled response body has a bounded lifetime and does not permanently suppress later read-only
  verification attempts.
- Reverted receipts can advance to orphaned or reincluded evidence without a manual button press.

## Verification

- `tests/migrations/migrations.test.ts` covers failed-prefix action-required recovery, bundle
  mismatch refusal, matching continuation, and current-schema metadata finalization.
- `apps/web/src/integrations/http/motorcove-api.test.ts` holds a response body open, observes abort,
  and completes a following request.
- `apps/web/src/integrations/evm/TransactionObserver.test.tsx` covers automatic reverted-receipt
  observation and the rejected-before-submit exclusion.
