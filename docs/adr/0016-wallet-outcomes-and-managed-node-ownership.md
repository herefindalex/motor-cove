# ADR 0016: Wallet outcomes and managed local node ownership

- **Status:** accepted
- **Date:** 2026-09-22

## Context

A wallet request and a transaction observation are concurrent sources of evidence. A recovery
observer can advance a hashless journal entry while the wallet request is still open. Treating a
wallet rejection as a replacement transaction state would either lose the rejection on a revision
conflict or erase a transaction hash found concurrently.

Local reset has a wider blast radius than a database environment. `anvil_reset` changes the entire
RPC node, so environment-scoped database locks cannot protect a second managed environment that
points at the same node.

## Decision

The journal records wallet request outcome separately from transaction status. A rejection or
unknown wallet response is merged into the latest revision only when the immutable intent and
wallet request start time still match. Transaction evidence wins for the transaction status and
hash. A storage failure retains the outcome only in the application-lifetime volatile overlay and
the UI identifies that reload limitation.

Each managed environment claims one normalized loopback HTTP endpoint in `managed-node.json`.
Claims and ownership checks use the workspace-wide `managed-nodes.lock`. Bootstrap claims the node
before chain writes. Indexer startup and reset verify ownership. Reset preserves the binding so the
same environment can be rebuilt on the same dedicated node.

## Consequences

- A wallet rejection survives observer revision races without deleting concurrent hash evidence.
- Durable and application-lifetime-only wallet outcomes remain distinguishable.
- Two managed environments cannot claim aliases of the same loopback endpoint and port.
- Missing, conflicting, corrupt, or changed node bindings fail closed before indexer startup or
  `anvil_reset`.
- This ownership model does not identify unrelated processes, port forwarding, or different ports
  that reach the same external service. Managed local environments require dedicated harness-owned
  loopback nodes.
