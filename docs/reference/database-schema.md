# Database schema reference

This page describes the Drizzle schema in `packages/database/src/schema`. Use `db:verify` on an
owned managed environment; the pre-existing `data/motorcove.sqlite` was not modified or adopted.

| Table                    | Authority                | Writer                                      | Identity and purpose                                                |
| ------------------------ | ------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| `catalog_vehicles`       | Off-chain authoritative  | Maintenance catalog seed/manual maintenance | Stable `catalog_id`, copy, origin, seed version                     |
| `catalog_asset_bindings` | Off-chain authoritative  | Maintenance                                 | Deployment + collection + token to catalog                          |
| `deployments`            | Verified registration    | Bootstrap/maintenance                       | Deployment ID, chain/contracts, blocks, code and manifest hashes    |
| `indexed_blocks`         | Chain evidence           | Indexer                                     | Deployment + block hash, canonical and scan-complete evidence       |
| `chain_events`           | Immutable chain evidence | Indexer                                     | Deployment + block hash + log index, raw envelope and decoded cache |
| `sales`                  | Derived projection       | Indexer                                     | Deployment + sale ID, custody and sale state                        |
| `payment_claims`         | Derived projection       | Indexer                                     | Deployment + sale ID, beneficiary, amount, kind, withdrawal         |
| `token_ownership`        | Derived projection       | Indexer                                     | Deployment + collection + token current owner                       |
| `indexer_checkpoint`     | Operational provenance   | Indexer                                     | Last scanned block/hash, projector/build/scope versions             |
| `indexer_runtime_status` | Operational observation  | Indexer                                     | Heartbeat, observed head, RPC success, recovery state               |
| `db_contract`            | Compatibility receipt    | Migration maintenance                       | Contract version, migration digest, fingerprint                     |
| `reconciliation_runs`    | Diagnostic               | Reconciliation maintenance                  | Anchored comparison, freshness, scope, differences                  |

## Constraints

The migration includes CHECK constraints for canonical uint256 text, positive prices and claims,
safe integers, address/hash forms, status sets, and the checkpoint block/hash pair. Foreign keys and
composite primary keys enforce deployment scope. Unit tests bypass TypeScript and insert raw SQL to
confirm selected constraints.

## History and fingerprint

`__drizzle_migrations` is the only migration ledger. `schema-contract.json` records
ordered SQL hashes, an aggregate digest, normalized schema fingerprint, pinned toolchain, and required
projector version. `db_contract` is a compatibility receipt, not a second migration runner.

See [database architecture](../architecture/database.md) and
[database acceptance matrix](../testing/database-acceptance-matrix.md).
