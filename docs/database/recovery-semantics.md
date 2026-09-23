# Database recovery semantics

## Operation effects

| State class         | Migrate                                                             | Rebuild                                                       | Reindex                                                                         | Backup and restore                                               |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Schema control      | Append reviewed migration history and publish the verified contract | Verify; do not redefine                                       | Verify; do not redefine                                                         | Capture and validate as part of the complete database            |
| Deployment identity | Preserve                                                            | Preserve and require a match                                  | Preserve and verify against chain runtime identity                              | Require compatible database, manifest, and lifecycle evidence    |
| Off-chain authority | Preserve through reviewed transformations                           | Preserve                                                      | Preserve                                                                        | Critical recovery content; chain catch-up cannot recreate it     |
| Raw chain evidence  | Preserve through reviewed transformations                           | Verify and replay without reacquisition                       | Reacquire the explicitly selected range and retain required historical evidence | Prefer preserving; restored source must still pass trust checks  |
| Derived projection  | Preserve or transform transactionally                               | Clear and regenerate atomically                               | Regenerate from reacquired canonical evidence                                   | May be installed for convenience, then checked or caught up      |
| Runtime observation | Preserve only when semantically valid for the new schema            | Publish operation progress and a new build only after success | Publish rewind/catch-up progress and live observation evidence                  | Never treat restored health as proof of current worker freshness |
| Audit evidence      | Preserve                                                            | Preserve historical reports                                   | Preserve historical reports                                                     | Preserve when available; reports keep their original anchors     |

## Rebuild

Rebuild means: trust verified local `indexed_blocks` and `chain_events`, then regenerate the
projection. Before clearing derived rows, it validates canonical coverage, scan-complete markers,
log counts and digests, event envelopes, decoder compatibility, checkpoint coverage, deployment,
and log scope. A source failure leaves the previous projection intact and requires reindex or an
explicitly supported recovery path.

Catalog and deployment rows are never rebuilt from chain events. Successful publication replaces
the projection build metadata only after replay completes in the controlled unit of work.

## Reindex

Reindex returns to the chain as source authority. It verifies deployment runtime identity, fixes an
eligible target block and hash, records operation ownership, and reacquires headers and logs. Reorg
handling may retain displaced block and event evidence while changing which branch is canonical.
Projection state and checkpoint then converge on the same fixed target policy.

Reindex does not reset the chain, reseed catalog authority, or create a different deployment
generation.

## Backup

A standard backup captures SQLite through the supported backup path and binds its checksum to a
manifest. For a deployed environment, readiness also depends on compatible deployment, seed
journal, bootstrap receipt, source condition, schema contract, and lifecycle evidence. Internal
migration or source-refresh archives are operation-bound evidence and are not standard restore
sources.

Backup importance in the authority matrix describes recoverability, not selective file copying. A
SQLite snapshot always contains the complete physical table set.

## Restore

Restore installs a historical database generation. Before quarantining the active database it
validates the selected standard backup, source checksum, deployment descriptor, and active lifecycle
sidecars. It then stages the database, repeats the manifest SHA-256 check over the staged bytes, and
verifies schema, history, integrity, and deployment before quarantining or publishing anything. A
source change between verification and copying therefore leaves the active database in place and
records the failed restore marker. Restore does not roll back Anvil or any chain, and restored
projections may require catch-up or explicit recovery.

## Migration

Migration is the only supported path for a physical schema change. It verifies known native
history, creates and records a safety backup, applies ordered SQL, verifies integrity and foreign
keys, and publishes the matching `db_contract`. Applied migrations are immutable. A resume must use
the durable operation phase and revalidated backup evidence.

## Reset

Reset is an explicit destructive operation for a harness-owned local environment. It validates the
managed environment owner and top-level containment, acquires its maintenance gates, then rechecks
the database and reports directories with `lstat` and `realpath` before recording intent or mutating
the managed local chain. Generated-state cleanup repeats the same check before deletion. Reset is not
a repair technique for a backup, migration, rebuild, or deployment mismatch.

## Failure selection

Use rebuild when verified local source evidence is complete and only derived state is suspect. Use
reindex when local source completeness, canonical identity, decoder compatibility, or source digest
cannot be trusted. Use restore for a verified compatible snapshot. Use reset only for an explicitly
disposable owned local environment. None of these paths authorizes resubmitting a wallet operation.
