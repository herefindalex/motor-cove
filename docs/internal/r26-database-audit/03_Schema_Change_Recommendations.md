# R26 schema change recommendations

## Decision

No physical schema change is accepted in R26. The current event/block anchors answer the existing
recovery and audit questions without a second wall clock on each projection. The concrete future
heartbeat error is corrected in reader presentation and a real SQLite/API test; it does not call
for a new column. `db_contract.verified_at` needs a narrower description, which is updated in the
TypeScript database model and [temporal reference](../../database/temporal-semantics.md).

The classes below are `KEEP`, `DOCUMENT`, `ADD`, `RENAME-LATER`, and `REJECT`. `REJECT` means the
field has no demonstrated correctness, recovery, audit, or product need today; it is not a rule
against revisiting a new requirement.

| Candidate                                        | Class    | Evidence and reason                                                                                                                                                                                                                                            |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog_asset_bindings.created_at`              | REJECT   | The supported seed path inserts once and rejects conflicting rebinding. Deployment, token, seed ID/version and binding source carry the required lineage. No consumer needs creation wall time.                                                                |
| `catalog_asset_bindings.updated_at`              | REJECT   | There is no supported update/rebind transition to timestamp. Adding it would imply a lifecycle the command does not provide.                                                                                                                                   |
| `indexed_blocks.first_seen_at`                   | REJECT   | Header timestamp, block hash, scan proof, and canonicality drive recovery; raw events already retain first local sighting. A block-local first-seen clock has no required diagnostic consumer.                                                                 |
| `indexed_blocks.last_verified_at`                | REJECT   | Ingestion/reindex checks are transaction-local and do not define a separate persisted verification cadence. A timestamp without that workflow would overstate trust.                                                                                           |
| `payment_claims.creation_block_number`           | REJECT   | The existing creation block hash joins the retained `indexed_blocks` row for its number, including displaced branch evidence.                                                                                                                                  |
| `payment_claims.creation_block_timestamp`        | REJECT   | The same block-hash join supplies chain time without another value that reorg/reindex must keep synchronized.                                                                                                                                                  |
| `payment_claims.withdrawal_block_number`         | REJECT   | The optional withdrawal block hash already resolves its number when withdrawal exists.                                                                                                                                                                         |
| `payment_claims.withdrawal_block_timestamp`      | REJECT   | A joined block supplies the timestamp; a duplicated value has no measured read-path need.                                                                                                                                                                      |
| `token_ownership.last_transfer_block_timestamp`  | REJECT   | Last transfer block hash/log identifies the transfer and its retained block timestamp. No current API uses a direct transfer-time column.                                                                                                                      |
| `sales.created_block_hash` / `created_log_index` | DOCUMENT | The current state has last-event provenance; creation can be found in verified canonical source by sale identity and creation block. A direct creation anchor would improve a future dedicated query, but no present correctness or recovery path requires it. |
| `db_contract.verified_at`                        | DOCUMENT | Only migration finalization publishes this time. A read-only schema check does not advance it. The model and public explanation now say so.                                                                                                                    |
| `indexer_checkpoint.updated_at`                  | DOCUMENT | Cursor mutation may occur during ingestion, rebuild, or reindex. It is not an RPC observation clock; no rename is justified by current consumers.                                                                                                              |
| `reconciliation_runs.created_at`                 | DOCUMENT | The report is assembled and persisted at this local time. Its comparison anchor, head, scope, and build remain distinct. No migration to `published_at` is warranted without an actual consumer ambiguity.                                                     |

## Accepted non-schema correction

A future `worker_heartbeat_at` previously produced age zero through `Math.max(0, now - heartbeat)`.
That asserted `FRESH` and a numeric lag despite an impossible local chronology. Reader presentation
now returns `UNKNOWN` observation freshness and null lag/age for that case. It preserves the
last-known projection status and recovery reason. The regression first failed on the old code and
passes after the change in `tests/integration/api-reader-contract.test.ts`.

## Trigger for a future `ADD`

An additional field needs a named consumer or recovery invariant, a precise clock owner, a
deterministic backfill source, and evidence that a join or existing source identity is insufficient.
The [migration assessment](04_Migration_Risk_Assessment.md) records the review required before
that decision changes.
