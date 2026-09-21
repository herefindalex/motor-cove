# HTTP API reference

This page describes routes registered by the current Fastify application and the wire schemas in
`@motorcove/api-contracts`. Generated OpenAPI lives at
`packages/api-contracts/generated/openapi.json`.

| Method | Path                        | Response purpose                                                 |
| ------ | --------------------------- | ---------------------------------------------------------------- |
| GET    | `/health/live`              | Process liveness only                                            |
| GET    | `/health/ready`             | Reader can obtain system status; not full chain freshness        |
| GET    | `/v1/config`                | Deployment, chain, contract addresses, and funding period        |
| GET    | `/v1/vehicles`              | Catalog vehicles and projected current owner                     |
| GET    | `/v1/sales`                 | Deployment-scoped sale list with claims                          |
| GET    | `/v1/sales/{saleId}`        | One sale, or a selector-scoped funding observation               |
| GET    | `/v1/system/status`         | Projection state, observed head, lag, heartbeat, recovery reason |
| GET    | `/v1/system/events`         | Recent indexed event evidence                                    |
| GET    | `/v1/system/reconciliation` | Latest stored reconciliation report                              |

## Numeric and identity encoding

The public schemas use decimal strings for IDs, wei, chain ID, blocks, and timestamps that originate
as EVM integers. Addresses and bytes32 values use hex strings. Do not convert wei or uint256 IDs
through JavaScript `Number`.

## Provenance

Responses expose `deploymentId`, `indexedBlockNumber`, `indexedBlockHash`, `projectorVersion`,
`projectionBuildId`, and `logScopeHash`. Data and provenance are read in one SQLite transaction.
Consumers must use these fields to distinguish deployment, source scope, and projection build.

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

Invalid decimal sale IDs return a stable client error in the sales route. Uninitialized or mismatched
read models map to service unavailable. Unexpected errors return a request ID without exposing stack
traces. Authentication and pagination are not implemented.

See [backend architecture](../architecture/backend-indexer.md) and API contract tests in
`tests/integration/api-contract.test.ts`.
