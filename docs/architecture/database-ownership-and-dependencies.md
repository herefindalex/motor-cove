# Database ownership and dependencies

This page answers which team role owns each database surface and which consumers may import it.

| Surface                                 | Owner               | Allowed consumer                  | Forbidden responsibility               |
| --------------------------------------- | ------------------- | --------------------------------- | -------------------------------------- |
| `@motorcove/database/reader`            | Database maintainer | API query adapters                | Migration, seed, generic SQL writes    |
| `@motorcove/database/projection-writer` | Database + Indexer  | Indexer SQLite adapter            | Catalog mutation, migration, restore   |
| `@motorcove/database/maintenance`       | Database + tooling  | Root maintenance composition      | Normal API or Indexer runtime          |
| `@motorcove/database/types`             | Database maintainer | Server consumers                  | Browser runtime or raw driver exposure |
| Drizzle schema and SQL history          | Database maintainer | Migration generator/checker       | Runtime auto-migrate                   |
| Projectors                              | Indexer             | Ingestion and rebuild application | RPC, SQLite, or wall-clock imports     |

Schema changes require Database, API, Indexer, and QA impact review. A provider may publish a schema
and migration before consumers switch; end-to-end completion still waits for consumer integration
and compatible data. The current schema, reader, writer, API, and Indexer consumers are integrated;
future schema changes must preserve that same provider-consumer gate.

See [dependency rules](dependency-rules.md) and [change recipes](../onboarding/change-recipes.md).
