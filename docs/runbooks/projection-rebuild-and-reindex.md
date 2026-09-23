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
target block, and target hash. The resumed command verifies and reuses the marker's original target;
it does not move the target when the live head advances. A missing or changed target anchor remains
blocked before another rewind.

## Source preflight and maintenance compatibility

Before rebuild changes projection rows, it verifies contiguous canonical and scan-complete headers
from the deployment scan start through the checkpoint. Every block's observed count and digest must
match the stored event rows, and every event must retain its raw-envelope, decoded-event, and decoder
version binding. `REBUILD_SOURCE_INCOMPLETE` leaves the existing projection in place; use reindex to
reacquire the source instead of editing journal rows.

A failed rebuild with that exact error may transition to a full reindex under the same exclusive
maintenance gate. The reindex must start at the deployment scan-start block, capture and verify a
target block/hash, and match the marker's environment, database, deployment, and schema contract.
The new marker receives a new operation ID and records the failed rebuild operation ID, type, and
error as lineage. Other failed rebuild reasons, partial reindex ranges, and implicit marker changes
remain blocked.

Reindex captures `head - indexingDepth` and its hash as the completion target. A non-zero depth does
not wait for an ineligible live head, and an idle chain does not need an extra transaction to finish.
If the target hash changes while it is captured, reindex stops before the maintenance rewind.

If an operator increases indexing depth after the database has already projected newer blocks,
normal ingestion stops with `CHECKPOINT_EXCEEDS_ELIGIBLE_TARGET`. Run reindex from the deployment scan
start so its fixed eligible target and rebuilt projection enforce the new holdback. Do not clear the
recovery reason or lower the checkpoint by hand. Decreasing depth needs no rebuild and catches up
forward normally.

Runtime startup rejects projector or log-scope mismatches. Maintenance accepts only explicitly
supported prior projector versions. A scope change is allowed only when reindex starts at the
deployment scan-start block.

## Source refresh archive boundary

When a supported scope, decoder, or source-digest transition requires replacing stored headers and
events, reindex creates and verifies an environment backup under the existing exclusive maintenance
gate. It writes the verified backup ID into the reindex marker before deleting active source rows.
An interrupted resume verifies the recorded backup again. If backup creation, checksum verification,
or marker persistence fails, the active source journal remains unchanged.

The backup preserves the prior SQLite source rows, including displaced or orphan evidence. Reindex
still refetches only the canonical range needed by the active build; the backup is diagnostic and
recovery evidence, not a promise that an RPC can reproduce historical orphan logs.

Source refresh classification is evaluated immediately before reindex preparation. A non-null event
row requires refresh when its raw envelope, decoded payload, decoder version, source-record digest,
or the completed block's same-count digest is inconsistent. Reindex must begin at the deployment
scan-start block, record and verify the backup, then reacquire canonical source. A pure missing event
row follows ordinary rewind and reinsert instead of being mislabeled as contradictory content.
`EVENT_IDENTITY_CONTENT_MISMATCH` remains a hard failure during normal ingestion.

## Verify source snapshot identity

Normal catch-up and reindex fetch headers before logs, then request logs with the exact observed block
hashes. A compliant chain provider must support EIP-234 block-hash log filters. MotorCove does not
combine logs from a numeric range with headers observed after that request.

When diagnosis shows a header/log identity error:

1. Keep the current checkpoint and maintenance marker.
2. Confirm the configured RPC can serve logs by block hash for the deployment range.
3. Rerun the same reindex operation after transport health is restored.
4. Do not edit scan-complete metadata or source rows to force progress.

JSON-RPC batching is enabled for the local Indexer transport so the per-header identity checks do not
turn a large catch-up range into serialized HTTP round trips.

## Resume a long reindex

A reindex may require more than 1,000 successful batches. The command runs until its fixed eligible
target is reached, provided each successful iteration advances the durable checkpoint.

The marker's `projectionPhase` determines safe recovery:

- `PREPARING`: the operation may still perform its owned source rewind and projection preparation.
- `CATCHING_UP`: rerun the same command with the same `--from` value. It rebuilds derived projection
  state from retained source evidence and continues from the checkpoint without rewinding again.

`REINDEX_CATCHUP_NO_PROGRESS` means the adapter returned successfully but did not advance durable
state. Keep the marker, inspect the checkpoint and provider response, then resume only after correcting
the cause. Do not clear the marker or start a new target to bypass this error.
