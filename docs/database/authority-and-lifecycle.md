# Database authority and lifecycle

## How to read the matrix

`CRITICAL` means loss cannot be repaired by ordinary chain replay alone. `PREFER` means the record
is reproducible but materially improves local recovery or preserves historical evidence.
`CONVENIENCE` means a verified source can reproduce it. `NONE` means a fresh runtime observation is
the legitimate recovery path.

`Rebuildable` identifies whether the table can be reconstructed through its stated recovery source.
It does not authorize ad hoc deletion. Maintenance ownership, durable operation markers, deployment
identity checks, and source verification still apply.

## Table matrix

<!-- GENERATED:DATABASE-AUTHORITY:START -->

| Table                    | Category              | Authority                                                                          | Writers                                                        | Derived | Rebuildable | Recovery source                                                                   | Backup        | Reorg semantics                                                                                          |
| ------------------------ | --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------- | ----------- | --------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `__drizzle_migrations`   | `SCHEMA_CONTROL`      | Repository Drizzle migration bundle                                                | Drizzle migration runner                                       | no      | no          | Verified database backup or migration replay into a new empty database            | `CRITICAL`    | Not chain-dependent.                                                                                     |
| `db_contract`            | `SCHEMA_CONTROL`      | Verified schema contract, migration bundle, and schema fingerprint                 | Migration maintenance operation                                | yes     | yes         | Successful verification against the repository schema contract                    | `CONVENIENCE` | Not chain-dependent.                                                                                     |
| `deployments`            | `DEPLOYMENT_IDENTITY` | Verified deployment manifest and on-chain contract identity                        | Bootstrap deployment registration                              | no      | no          | Compatible deployment manifest plus verified on-chain identity                    | `CRITICAL`    | Deployment block hashes are identity evidence and must not be silently replaced.                         |
| `catalog_vehicles`       | `OFFCHAIN_AUTHORITY`  | MotorCove catalog seed or explicit local catalog input                             | Catalog seed maintenance command                               | no      | no          | Verified database backup or the exact authoritative catalog input                 | `CRITICAL`    | Catalog rows are independent of chain canonicality.                                                      |
| `catalog_asset_bindings` | `OFFCHAIN_AUTHORITY`  | MotorCove catalog authority constrained by deployment identity                     | Catalog seed maintenance command                               | no      | no          | Verified database backup or the exact authoritative binding input                 | `CRITICAL`    | Bindings remain deployment-scoped; a reorg does not rewrite catalog intent.                              |
| `indexed_blocks`         | `RAW_CHAIN_EVIDENCE`  | Verified chain observation for the configured deployment and log scope             | Indexer ingestion<br>Reindex maintenance                       | no      | yes         | Explicit reindex from the verified deployment scan start                          | `PREFER`      | Competing hashes may be retained; exactly one canonical row may exist per deployment and height.         |
| `chain_events`           | `RAW_CHAIN_EVIDENCE`  | Verified chain log observation and recorded decoder version                        | Indexer ingestion<br>Reindex maintenance                       | no      | yes         | Explicit reindex from canonical block headers and logs                            | `PREFER`      | Historical noncanonical events remain auditable and are interpreted through indexed_blocks canonicality. |
| `indexer_checkpoint`     | `RUNTIME_OBSERVATION` | Last atomically committed canonical ingestion unit                                 | Indexer ingestion<br>Projection rebuild<br>Reindex maintenance | yes     | yes         | Verified indexed_blocks and chain_events, or explicit reindex                     | `CONVENIENCE` | Checkpoint block and hash must remain an inseparable canonical anchor.                                   |
| `sales`                  | `DERIVED_PROJECTION`  | Verified canonical MotorCoveEscrow events                                          | Indexer projector<br>Projection rebuild<br>Reindex maintenance | yes     | yes         | Verified canonical chain_events; explicit reindex when source evidence is suspect | `CONVENIENCE` | Rows follow the canonical event sequence and roll back atomically with checkpoint changes.               |
| `payment_claims`         | `DERIVED_PROJECTION`  | Verified canonical escrow claim events                                             | Indexer projector<br>Projection rebuild<br>Reindex maintenance | yes     | yes         | Verified canonical chain_events; explicit reindex when source evidence is suspect | `CONVENIENCE` | Claim state follows canonical creation and withdrawal events.                                            |
| `token_ownership`        | `DERIVED_PROJECTION`  | Verified canonical VehicleNFT Transfer events                                      | Indexer projector<br>Projection rebuild<br>Reindex maintenance | yes     | yes         | Verified canonical VehicleNFT chain_events or explicit reindex                    | `CONVENIENCE` | Ownership follows the canonical transfer sequence at the checkpoint.                                     |
| `indexer_runtime_status` | `RUNTIME_OBSERVATION` | Indexer runtime and live RPC observation                                           | Indexer runtime<br>Explicit projection maintenance             | yes     | yes         | Fresh Indexer execution and explicit recovery transitions                         | `NONE`        | A detected conflict moves health toward recovery; maintenance must not invent live freshness.            |
| `reconciliation_runs`    | `AUDIT_EVIDENCE`      | Reconciliation observation at its recorded deployment, scope, checkpoint, and head | Reconciliation CLI                                             | yes     | no          | Verified database backup; a new run cannot recreate the prior observation         | `PREFER`      | A report remains tied to its historical anchors and never inherits current canonicality.                 |

<!-- GENERATED:DATABASE-AUTHORITY:END -->

## Interpretation boundaries

### Authority

Deployment registration and catalog data are authoritative local inputs. They survive projection
rebuild and reindex. Schema-control rows attest which database contract exists; changing them by
hand does not migrate a database.

### Evidence

`indexed_blocks` and `chain_events` retain locally verified observations. Rebuild trusts this source
only after completeness, digest, decoder, scope, checkpoint, and canonical continuity checks.
Reindex reacquires it from the verified deployment when those checks fail.

### Projection

`sales`, `payment_claims`, and `token_ownership` are query projections. Their rows follow the
canonical event sequence atomically with the checkpoint. They do not become an independent recovery
source merely because a backup contains them.

### Runtime observation

The checkpoint records the last committed projection anchor. Runtime status reports worker health,
RPC observation, and recovery state. A stored `CURRENT` value without recent observation is a
historical statement, not proof of present freshness.

### Audit history

Each reconciliation report keeps its own deployment, projection build, log scope, checkpoint, head,
and creation time. Later runtime state cannot rewrite the meaning of an older report.
