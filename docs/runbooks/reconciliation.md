# How to reconcile a projection

Reconciliation compares chain and projection at the same deployment, block number, and block hash.
It reports comparison, freshness, scope, completeness assumptions, and anchoring separately.

## Operation

`MOTORCOVE_ENV=<id> pnpm ops:reconcile` reads sale, claim, and ownership projections plus anchored
contract getters and stores a report. It reports `MATCH`, `MISMATCH`, or `UNVERIFIABLE` separately
from `CURRENT` or lagging. It does not repair data.

## Procedure

1. Stop normal Indexer and API for maintenance.
2. Acquire exclusive service and writer locks.
3. Fix H from the checkpoint and verify its canonical hash before and after reads.
4. Enumerate the declared scope; do not compare only rows already present in DB.
5. Persist a report with deployment, H/hash, projector/build/scope, comparison, freshness, differences,
   timestamps, and completeness limits.
6. Return nonzero for mismatch or unverifiable outcomes; choose recovery separately.

Historical RPC state may be unavailable. In that case report `UNVERIFIABLE`; never return a false
match. A projection at H can validly be `MATCH` and `PROJECTION_LAGGING` while head is H+k.
The current implementation reads anchored `saleCount` and checks every Sale ID, reads every claim
getter in that canonical range, and independently enumerates every projected claim row. Missing,
changed, extra, or orphan claims therefore produce `MISMATCH`. It then reads anchored `nextTokenId`
and checks every minted token owner. Unavailable historical reads still produce `UNVERIFIABLE`.

The stored report owns its historical `logScopeHash`. In `GET /v1/system/reconciliation`, that value
is returned in `data.logScopeHash`; the response envelope's `provenance.logScopeHash` describes the
current read snapshot. A scope transition may make them different without rewriting the report.

## Unavailable latest-head observation

If the latest-head read fails after the checkpoint is available, the command still persists the
current attempt as `UNVERIFIABLE` with `HEAD_UNKNOWN`, records the RPC cause, and exits nonzero. It
does not reuse a previous report or head as evidence for the new run. Failure to open or write the
database remains an external command failure because no durable report can be promised in that
case.
