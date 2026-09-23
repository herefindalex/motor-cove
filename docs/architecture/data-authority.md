# Data authority

This page answers which component can make each claim and which records can be rebuilt.

| Claim                                | Authority                                    | Local evidence                                  | Rebuild or backup rule                                                        |
| ------------------------------------ | -------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| NFT owner and transfers              | Canonical contract history                   | Transfer logs and ownership projection          | Projection can rebuild from verified complete history                         |
| Sale state and deadlines             | Escrow contract                              | Escrow events plus anchored chain reads         | Projection can rebuild; no SQL seed may invent state                          |
| Payment claim and withdrawal         | Escrow contract                              | Claim events and contract getters               | Keep beneficiary, amount, kind, status, and recipient distinct                |
| Catalog copy and local image mapping | SQLite catalog tables                        | Catalog row and deployment-scoped asset binding | Authoritative off-chain data must survive projection rebuild and needs backup |
| Transaction observation              | Wallet/RPC observation for a recorded intent | Browser journal, hash, receipt, replacement     | Does not write the server projection                                          |
| Projection freshness                 | Indexer checkpoint and observed head         | API provenance and runtime status               | Freshness and comparison are separate from correctness                        |

SQLite is a mixed-authority database. Calling it “a cache” would make catalog edits and bindings
look disposable; calling every row authoritative would hide that chain-derived projections require
replay or reindex. A full backup preserves both classes. A projection rebuild replaces only derived
tables.

See [database architecture](database.md), the generated
[database schema reference](../database/schema-reference.generated.md), and the curated
[authority and lifecycle matrix](../database/authority-and-lifecycle.md).
