# Architecture overview

This page explains the runtime components, trust boundaries, and independent write, receipt, and
read paths. Import dependencies are documented separately in [dependency rules](dependency-rules.md).

## Runtime paths

```mermaid
flowchart LR
  subgraph Browser
    UI[React features]
    Journal[Local transaction journal]
    Wallet[Injected wallet]
  end
  subgraph LocalEVM[Local EVM boundary]
    RPC[Anvil RPC]
    NFT[VehicleNFT]
    Escrow[MotorCoveEscrow]
  end
  subgraph LocalServer[Single-host server boundary]
    Indexer[Indexer]
    DB[(SQLite WAL)]
    API[Fastify readonly API]
    Ops[Maintenance CLI]
  end
  UI --> Wallet --> RPC --> NFT
  RPC --> Escrow
  RPC -. receipts .-> Journal
  RPC --> Indexer --> DB --> API --> UI
  Ops --> DB
```

The wallet owns transaction authorization. Contracts own custody, sale transitions, and claims.
The Indexer independently pulls logs and writes projections. The API never turns a frontend receipt
into a database state change. All server components are local processes; SQLite and its advisory
locks are not a cross-host service.

## Funding sequence

```mermaid
sequenceDiagram
  actor User
  participant Web
  participant Wallet
  participant Chain as Anvil and Escrow
  participant Indexer
  participant DB as SQLite
  participant API
  User->>Web: Choose Fund
  Web->>Chain: Simulate fundSale
  Web->>Wallet: Request signature
  Wallet->>Chain: Submit exact price
  par Receipt observation
    Chain-->>Web: Receipt success, revert, or replacement
  and Projection observation
    Indexer->>Chain: Pull bounded logs
    Indexer->>DB: Raw evidence + projection + checkpoint
    Web->>API: Read snapshot
    API->>DB: Data + provenance in one transaction
    API-->>Web: Sale may still be LISTED until catch-up
  end
```

Receipt success establishes execution for one transaction. It does not establish that the API
projection is current. A stale API response is not a reason to fund again.

## Database boundary

Runtime API and Indexer composition use the public exports of `@motorcove/database`. The API receives
a readonly reader; only the Indexer SQLite adapter receives a projection writer; maintenance tooling
owns migration, seed, backup, restore, recovery, and reset operations. Architecture checks enforce
these import boundaries.

Continue with [frontend architecture](frontend.md), [backend and Indexer](backend-indexer.md),
[database architecture](database.md), or [flows](../flows/listing-and-funding.md).
