# HTTP API reference

This page describes routes registered by the current Fastify application and the wire schemas in
`@motorcove/api-contracts`. Generated OpenAPI lives at
`packages/api-contracts/generated/openapi.json`.

| Method | Path                        | Response purpose                                            |
| ------ | --------------------------- | ----------------------------------------------------------- |
| GET    | `/health/live`              | Process liveness only                                       |
| GET    | `/health/ready`             | Reader can obtain system status; not full chain freshness   |
| GET    | `/v1/config`                | Deployment, chain, contract addresses, and funding period   |
| GET    | `/v1/vehicles`              | Catalog vehicles and projected current owner                |
| GET    | `/v1/sales`                 | Deployment-scoped sale list with claims                     |
| GET    | `/v1/sales/{saleId}`        | One sale, or a selector-scoped funding observation          |
| GET    | `/v1/system/status`         | Last projection state, observation freshness, lag, recovery |
| GET    | `/v1/system/events`         | Recent indexed event evidence                               |
| GET    | `/v1/system/reconciliation` | Latest stored reconciliation report                         |

## Numeric and identity encoding

The public schemas use decimal strings for IDs, wei, chain ID, blocks, and timestamps that originate
as EVM integers. Addresses and bytes32 values use hex strings. Do not convert wei or uint256 IDs
through JavaScript `Number`.

`saleId` is a canonical decimal value in `0..2^256-1`: no sign, whitespace, exponent, fractional
part, or leading zero is accepted. A malformed or overflowing route value returns
`400 INVALID_SALE_ID` before the database reader runs. A valid ID with no projected Sale returns
`404 SALE_NOT_FOUND`. Observation block selectors are additionally limited to JavaScript's safe
integer range because the current SQLite block columns and reader contract use safe integers.

## Provenance

Responses expose `deploymentId`, `indexedBlockNumber`, `indexedBlockHash`, `projectorVersion`,
`projectionBuildId`, and `logScopeHash`. Data and provenance are read in one SQLite transaction.
Consumers must use these fields to distinguish deployment, source scope, and projection build.

The reconciliation endpoint contains two source scopes. `data.logScopeHash` belongs to the stored
historical report. `provenance.logScopeHash` belongs to the current snapshot used to read that
report. They may differ after an allowed scope transition and must not be substituted for each
other.

## Projection status and observation freshness

`projectionStatus` is the last state persisted by the Indexer. `observationFreshness` describes
whether the worker heartbeat can still support a present-tense health claim:

| Value     | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| `FRESH`   | The heartbeat is within the configured stale threshold.   |
| `STALE`   | A valid heartbeat exists but is older than the threshold. |
| `UNKNOWN` | No valid heartbeat time is available.                     |

`observationAgeSeconds` reports the measured age when available. When freshness is not `FRESH`,
`lagBlocks` is `null`: the API keeps the last checkpoint and observed head but does not invent a
current chain height. The default stale threshold is 30 seconds. A local API process can set
`MOTORCOVE_WORKER_HEARTBEAT_STALE_AFTER_MS` to a positive safe integer derived from its polling and
retry budget. This read calculation never changes a recovery marker or the persisted projection
status.

## Funding observation selector

`GET /v1/sales/{saleId}` accepts the following fields as one all-or-none group:

| Query field          | Meaning                                      |
| -------------------- | -------------------------------------------- |
| `deploymentId`       | Exact deployment scope                       |
| `observeTxHash`      | Funding transaction hash                     |
| `observeBlockNumber` | Receipt inclusion height as a decimal string |
| `observeBlockHash`   | Receipt inclusion block hash                 |
| `observeLogIndex`    | RPC event log index                          |

Without this group, the route keeps its ordinary sale and 404 behavior. A partial or malformed
group returns `400 INVALID_OBSERVATION_SELECTOR`; another deployment returns
`409 DEPLOYMENT_MISMATCH`. Observation mode may return `200` with `sale: null` and
`coverage: NOT_REACHED` when the projection has not reached the receipt block.

The response keeps four questions separate:

- `coverage`: `NOT_REACHED`, `SCANNED`, or `UNVERIFIABLE`;
- `eventLookup`: `NOT_FOUND`, `MATCHED`, `NONCANONICAL`, or `SELECTOR_MISMATCH`;
- `projectionEffect`: `NOT_ASSESSED`, `CONSISTENT`, or `INCONSISTENT`;
- `freshness`: observed head, observation time, and worker availability.

`matchedEvent` is built from stored source evidence. The reader checks the canonical header at the
receipt height, so a receipt at block 105 is not compared directly with a checkpoint hash at block 110. All rows and provenance come from one short SQLite read transaction. Selector input is
untrusted: a missing invented hash never writes a recovery marker, stops the Indexer, or repairs a
projection.

## Error boundary

Invalid or overflowing sale IDs return a stable client error in the sales route. Uninitialized or
mismatched read models map to service unavailable. Unexpected errors return a request ID without
exposing stack traces. Authentication and pagination are not implemented.

See [backend architecture](../architecture/backend-indexer.md) and API contract tests in
`tests/integration/api-contract.test.ts`.
