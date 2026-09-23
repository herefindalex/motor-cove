# Database temporal semantics

Database timestamps answer different questions. A later timestamp does not make a row more
authoritative, prove that a block is canonical, or prove that the Indexer is still running. The
physical columns are listed in the [generated schema reference](schema-reference.generated.md);
the per-table meanings are recorded in the [database model](database-model.md) and its
[`databaseModel` source](../../packages/database/src/model.ts).

## Time categories

| Category                | Question answered                                              | Examples                                                                           |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `BUSINESS_TIME`         | When did a contract-defined state or deadline take effect?     | `sales.funded_at`, `sales.expires_at`                                              |
| `CHAIN_TIME`            | Which chain position or block timestamp anchors evidence?      | `indexed_blocks.block_timestamp`, projection block/hash/log positions              |
| `OBSERVATION_TIME`      | When did this process observe chain or RPC evidence?           | `chain_events.first_seen_at`, runtime `last_observed_at` and `last_rpc_success_at` |
| `VERIFICATION_TIME`     | When was a local contract or comparison verified or published? | `db_contract.verified_at`, `reconciliation_runs.created_at`                        |
| `PROCESS_LIVENESS_TIME` | When did the worker last report that it was alive?             | `indexer_runtime_status.worker_heartbeat_at`                                       |
| `LOCAL_MUTATION_TIME`   | When did a local write occur?                                  | catalog timestamps, `deployments.registered_at`, `indexer_checkpoint.updated_at`   |

These categories describe existing fields. They are not a requirement to add `created_at` and
`updated_at` to every table. The generator checks that every field named in the TypeScript temporal
model exists in its migrated physical table.

## Table and field meanings

| Table                    | Existing time or position fields                                     | Interpretation                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__drizzle_migrations`   | `created_at`                                                         | Local migration-ledger write time. Ordered migration hashes and the schema contract establish validity.                                                |
| `db_contract`            | `verified_at`                                                        | Last local schema verification. A fresh value cannot compensate for a wrong fingerprint.                                                               |
| `deployments`            | `registered_at`; deployment block/hash fields                        | Local registration time differs from the NFT and escrow deployment blocks that bind chain identity.                                                    |
| `catalog_vehicles`       | `created_at`, `updated_at`                                           | Local catalog writes. Catalog authority comes from the approved seed/input, not the clock.                                                             |
| `catalog_asset_bindings` | No wall-clock column                                                 | Deployment, collection, token, and catalog identity define the binding. Chain replay cannot recreate catalog intent.                                   |
| `indexed_blocks`         | `block_timestamp`; number/hash/parent hash                           | Header-provided chain time and branch identity. `is_canonical` and scan evidence determine whether this row belongs to the current branch.             |
| `chain_events`           | `first_seen_at`; block/hash/transaction/log position                 | First local sighting is observation time; block and log identity anchor the event. Retained orphan evidence does not become canonical merely with age. |
| `indexer_checkpoint`     | `updated_at`; `last_scanned_block`/`last_scanned_hash`               | Local atomic cursor update and its chain anchor. The timestamp cannot establish the latest live head.                                                  |
| `sales`                  | `funded_at`, `expires_at`; creation/update block and last event hash | Contract business times and canonical event provenance. No local row-update timestamp is needed to order sale transitions.                             |
| `payment_claims`         | Creation/withdrawal block hash and log index                         | Canonical claim events order the state; absence of a local timestamp does not make the claim timeless.                                                 |
| `token_ownership`        | `updated_block`, last transfer block hash/log index                  | Last reflected canonical transfer, separate from historical sale buyer identity.                                                                       |
| `indexer_runtime_status` | `worker_heartbeat_at`, `last_rpc_success_at`, `last_observed_at`     | Three distinct claims: worker liveness, RPC success, and observed head time. A local rebuild must not renew them.                                      |
| `reconciliation_runs`    | `created_at`; comparison block/hash and recorded head                | Historical publication time and fixed comparison anchors. The report never inherits a later checkpoint or scope.                                       |

## Freshness and recovery

`CURRENT` is a projection status at a verified live observation: the checkpoint has reached the
eligible target derived from the observed head and `indexingDepth`. A successful batch commit or a
local maintenance operation alone does not prove currentness. Readers present the last-known status
alongside worker/RPC observation freshness; an expired heartbeat marks the observation stale without
inventing a newer head or lag. `RECOVERY_REQUIRED` remains a durable integrity barrier and
must not be cleared by a newer heartbeat, ordinary commit, restart, or stale transition.

Rebuild verifies retained local chain evidence and publishes a new projection build. It does not
reobserve the live chain or refresh worker-owned timestamps. Reindex reacquires source evidence
against a fixed eligible target and uses actual chain observation to establish later live health.
Restore verifies a compatible snapshot, not that its saved timestamps still describe the live
worker or current chain head. See [recovery semantics](recovery-semantics.md) for operation rules.

## Questions reserved for R26

The temporal model records what the current schema means. R26 may evaluate whether any missing
timestamp, ordering key, or provenance field prevents a specific required diagnosis. DB-DOC-2
does not add columns or change an applied migration for timestamp symmetry.
