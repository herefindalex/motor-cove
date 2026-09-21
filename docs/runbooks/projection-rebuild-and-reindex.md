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
