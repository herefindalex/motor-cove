# How to choose rebuild or reindex

Use this runbook after stopping API and Indexer and identifying why normal catch-up cannot continue.

## Choose the source

- **Rebuild** only when local headers/raw logs are complete, content-verified, correctly scoped, and
  anchored. Delete/recreate derived projection rows in one maintenance build while preserving catalog.
- **Reindex** when history, canonical branch, decoder scope, or log completeness is suspect. Fetch
  headers and raw logs from the verified deployment's RPC, then rebuild.
- **New deployment** when deployment getter, code hash, or manifest identity changed. Do not treat it
  as an ordinary reorg.

## Commands

```bash
MOTORCOVE_ENV=<id> pnpm ops:rebuild
MOTORCOVE_ENV=<id> pnpm ops:reindex -- --yes
```

Rebuild replays verified local source evidence into a new projection build. Reindex validates the
loopback deployment identity, rewinds from the requested block, preserves displaced source evidence,
refetches canonical headers and logs, and catches up to a captured target.

## Success conditions

Success requires a new `projectionBuildId`, preserved catalog/bindings, replay of all
applicable source events in canonical order, reach a verified checkpoint, and reconcile at the same
block/hash. A failure must not expose half-built projections.

See [indexing flow](../flows/indexing-and-recovery.md) and
[reconciliation](reconciliation.md).

## Resume an interrupted operation

Inspect the marker with `pnpm ops:recover --env <id>`. For `REBUILD_PROJECTION` and
`REINDEX_PROJECTION`, `--complete` intentionally returns `ACTION_REQUIRED`; it does not clear the
marker. Stop the runtime and rerun the same rebuild command, or the same reindex command with the
original `--from` value. Resume requires matching operation type, deployment, rewind point, captured
target block, and target hash. A mismatch remains blocked.

## Source preflight and maintenance compatibility

Before rebuild changes projection rows, it verifies contiguous canonical and scan-complete headers
from the deployment scan start through the checkpoint. Every block's observed count and digest must
match the stored event rows, and every event must retain its raw-envelope, decoded-event, and decoder
version binding. `REBUILD_SOURCE_INCOMPLETE` leaves the existing projection in place; use reindex to
reacquire the source instead of editing journal rows.

Reindex captures `head - indexingDepth` and its hash as the completion target. A non-zero depth does
not wait for an ineligible live head, and an idle chain does not need an extra transaction to finish.
If the target hash changes while it is captured, reindex stops before the maintenance rewind.

Runtime startup rejects projector or log-scope mismatches. Maintenance accepts only explicitly
supported prior projector versions. A scope change is allowed only when reindex starts at the
deployment scan-start block.
