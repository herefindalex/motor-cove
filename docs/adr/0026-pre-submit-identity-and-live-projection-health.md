# ADR 0026: Pre-submit deployment proof and live projection health

- Status: Accepted
- Date: 2026-09-23

## Context

Browser account, chain, and configuration checks can all pass while the wallet provider resolves
the intended escrow address to a different deployment generation. A successful simulation through
the public RPC does not prove what the wallet provider will execute. Separately, a projection can
finish a fixed catch-up target that is behind the current eligible chain head. Publishing `CURRENT`
from the SQLite commit in that case overstates live convergence.

The API previously accepted both `localhost` and `127.0.0.1` as frontend origins by default, even
though the documented local UI has one canonical origin.

## Decision

After saving `AWAITING_WALLET` and immediately before opening the wallet request, the transaction
gateway checks the public RPC chain ID and escrow `deploymentId()`, the wallet client's chain ID,
and the wallet provider's own `eth_call` result for that escrow `deploymentId()`. The result must
match the immutable journal intent. A failed or unavailable proof records
`FAILED_BEFORE_SUBMIT / OPERATION_ENVIRONMENT_MISMATCH` and returns without a wallet write. The
gateway checks the live browser context again after the asynchronous proof. This applies to token
approval as well as escrow actions. Once the wallet request starts, the existing unknown-result
and hash recovery rules continue to apply.

The SQLite projection commit records source and checkpoint progress but does not publish `CURRENT`.
Ingestion publishes `CURRENT` only after reaching the live depth-adjusted eligible target and
validating its anchor. Completing an older fixed maintenance target is progress, not proof of live
convergence. `RECOVERY_REQUIRED` remains a separate recovery barrier.

The API permits `http://127.0.0.1:5173` as its default browser origin. Operators serving the UI
from another origin set one exact `MOTORCOVE_WEB_ORIGIN`; the API does not silently allow a second
local hostname.

## Verification

R24 regression tests cover public and wallet deployment disagreement, pre-submit failure without a
wallet write, successful matching proof, fixed-target catch-up below the eligible head, and the
default and configured CORS origins. The verification record states which full gates were executed.
