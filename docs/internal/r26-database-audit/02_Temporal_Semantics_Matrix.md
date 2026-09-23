# R26 temporal semantics matrix

This audit covers all 13 tables produced by the current migration bundle. The
[findings summary](01_R26_Findings.zh-TW.md) is in Traditional Chinese. Physical column types
and constraints remain in the [generated schema reference](../../database/schema-reference.generated.md).
`B` means contract or business time; `C` chain time or causal position; `O` local observation;
`V` verification or report publication; `P` process liveness; `L` local mutation. A dash means
there is no field in that category, not that the represented fact has no chronology.

| Table                    | B                         | C                                             | O                                         | V             | P                     | L                          | Source of the current fact                                                     | Decision                                               |
| ------------------------ | ------------------------- | --------------------------------------------- | ----------------------------------------- | ------------- | --------------------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `__drizzle_migrations`   | —                         | —                                             | —                                         | —             | —                     | `created_at`               | Ordered applied migration IDs and hashes checked against the repository bundle | Keep                                                   |
| `db_contract`            | —                         | —                                             | —                                         | `verified_at` | —                     | —                          | Migration finalization after schema and history verification                   | Document exact write point                             |
| `deployments`            | —                         | NFT and escrow deployment block/hash          | —                                         | —             | —                     | `registered_at`            | Immutable manifest, runtime code, and chain deployment identity                | Keep                                                   |
| `catalog_vehicles`       | —                         | —                                             | —                                         | —             | —                     | `created_at`, `updated_at` | Approved local catalog seed/input and seed set version                         | Keep; no-op seed does not rewrite                      |
| `catalog_asset_bindings` | —                         | —                                             | —                                         | —             | —                     | —                          | Deployment, collection, token, catalog, seed source/version                    | Reject generic timestamps now                          |
| `indexed_blocks`         | —                         | `block_timestamp`, number/hash/parent         | —                                         | —             | —                     | —                          | Header, scan completeness, scope digest, canonical branch flag                 | Keep chain time                                        |
| `chain_events`           | —                         | block/hash, transaction/log position          | `first_seen_at`                           | —             | —                     | —                          | Recorded raw envelope, digest, decoder version, deployment and scope           | Keep first-seen semantics                              |
| `indexer_checkpoint`     | —                         | scanned block/hash anchor                     | —                                         | —             | —                     | `updated_at`               | Atomic ingestion or explicit maintenance cursor/build transition               | Document local mutation                                |
| `sales`                  | `funded_at`, `expires_at` | creation/update block and last event hash/log | —                                         | —             | —                     | —                          | Canonical escrow event sequence and projection build                           | Reject local row clocks                                |
| `payment_claims`         | —                         | creation/withdrawal block hash/log            | —                                         | —             | —                     | —                          | Canonical claim creation and withdrawal events                                 | Use block joins for time/height                        |
| `token_ownership`        | —                         | updated block and last transfer hash/log      | —                                         | —             | —                     | —                          | Canonical VehicleNFT transfer event                                            | Use block join for time                                |
| `indexer_runtime_status` | —                         | observed head position                        | `last_rpc_success_at`, `last_observed_at` | —             | `worker_heartbeat_at` | —                          | Specific worker/RPC observation and durable recovery transition                | Keep clocks distinct; reject future heartbeat as fresh |
| `reconciliation_runs`    | —                         | comparison block/hash and head anchor         | —                                         | `created_at`  | —                     | —                          | Completed comparison report at its original scope and build                    | Document publication time                              |

## Provenance and reconstruction checks

- A projection row's current value is tied to the deployment and canonical source event. `sales`
  and `token_ownership` retain their last event block hash and log index; claims retain creation
  and optional withdrawal event anchors. The source journal uses deployment, block hash, and log
  index identity. A block hash resolves to `indexed_blocks` for height and timestamp.
- Rebuild reads verified retained events and must produce chain-derived state independently of the
  day it runs. Local timestamps in catalog and checkpoint are not copied into sale/payment/ownership
  business chronology.
- A reorg can change canonicality while retaining displaced block and event evidence. A timestamp
  never substitutes for canonical flag, block hash, scan completeness, or scope digest.
- Restore preserves historical timestamps as snapshot data. It does not refresh the worker's
  heartbeat, prove a live head, or make an old reconciliation report current.

See the [candidate decisions](03_Schema_Change_Recommendations.md) for fields deliberately left
out of this schema.
