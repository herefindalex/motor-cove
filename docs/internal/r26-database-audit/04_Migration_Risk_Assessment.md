# R26 migration risk assessment

## Current decision

R26 accepts no physical schema changes. The migration bundle, applied SQL history, schema contract,
and generated schema fingerprint remain unchanged. The reader correction for future heartbeat
timestamps and the `db_contract.verified_at` wording change have no backfill and do not change
stored bytes. Existing managed environments must not be reset, adopted, or migrated for this audit.

## Why the candidate fields remain out of schema

| Candidate group                   | Backfill source                                                                                                 | Main cost or ambiguity                                                                        | Current alternative                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Binding wall clocks               | No historical creation/mutation clock in existing rows                                                          | Backfilling migration time as creation time would be false; no update lifecycle exists        | Seed set/version and immutable binding identity                      |
| Block first-seen/last-verified    | Existing block rows have header time, not a guaranteed first local observation or separate verification history | Filling with current time on migration or reindex would change the claimed meaning            | Header/hash, scan digest, canonical flag and raw event observation   |
| Claim block heights/timestamps    | Retained `indexed_blocks` keyed by deployment and block hash                                                    | Duplicated values would need replay, reorg, and source-refresh consistency rules              | Join on creation/withdrawal block hash                               |
| Last transfer timestamp           | Retained `indexed_blocks` keyed by deployment and block hash                                                    | Denormalized value could disagree after source refresh or schema migration                    | Join on last transfer block hash                                     |
| Sale creation event direct anchor | Verified `chain_events` and creation block                                                                      | Historical backfill must uniquely identify the creation log per sale across retained branches | Resolve canonical source by sale identity and event kind when needed |

## Gate for any later `ADD` or `RENAME-LATER`

1. State the exact correctness, audit, recovery, or product query and show why existing source
   identity or a block join fails it.
2. Define whether the new value is business, chain, observation, verification, process liveness,
   or local mutation time. Specify its writer and whether re-observation may change it.
3. Add a new ordered migration. Never edit an applied migration. Define a truthful historical
   backfill; if older rows cannot be populated honestly, use an explicit nullable/unknown state.
4. Assess backup and restore identity, source-refresh archive, rebuild determinism, reindex,
   canonicality changes, projector/scope versions, API/reader mapping, and generated schema docs.
5. Add migration, rollback-on-failure, reorg, restore, and rebuild tests as appropriate, then run
   the pinned focused gates, `pnpm verify`, and `pnpm test:e2e` in an isolated managed environment.

A simple `ALTER TABLE` is not sufficient evidence. In particular, a local `Date.now()` assigned
during rebuild would make the same verified chain history produce different projection values.
