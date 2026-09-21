# How to migrate an owned database

Use this runbook for schema changes in a disposable or explicitly selected local environment.

## Prerequisites

- API and Indexer stopped for the target environment.
- A safe environment slug under `.motorcove/environments/`.
- Reviewed Drizzle schema and generated SQL. Never point this flow at the pre-existing `data/` DB.

## Generate and check repository artifacts

```bash
pnpm db:generate --name add_descriptive_name
pnpm db:check
```

Review SQL, Drizzle metadata, ordered hashes, aggregate digest, normalized schema fingerprint,
schema-source digest, and projector compatibility. `db:check` binds the sorted
`packages/database/src/schema/*.ts` contents to `schema-contract.json`, so a schema edit without a
regenerated and reviewed migration contract fails the repository gate. Do not use
`drizzle-kit push` or edit an applied migration.

## Inspect and migrate

```bash
pnpm db:status --env docs-smoke
pnpm db:plan --env docs-smoke
pnpm db:migrate --env docs-smoke
pnpm db:verify --env docs-smoke
```

Status and plan are read-only and do not create a missing environment. Migrate takes exclusive
service and writer locks, writes a durable marker, applies the official SQLite migrator, verifies
history/schema/FK/integrity, writes `db_contract`, then clears the marker.

## Verification

The real `0000` to `0001` fixture preserves an existing chain event while adding source-record
integrity storage. Because migrated rows cannot retroactively prove a digest that did not exist,
rebuild rejects them and a reindex from the deployment scan start reacquires verified source before
publishing current projection metadata.

## Troubleshooting

- `RESOURCE_BUSY`: stop API/Indexer or another maintenance command; do not kill an unknown process.
- `DB_HISTORY_DIVERGED`: preserve the DB and marker. Do not rewrite the ledger.
- `DB_SCHEMA_DRIFT`: compare with a fresh migrated temporary DB and add a forward migration.
- `MAINTENANCE_INCOMPLETE`: use `ops:recover`; do not delete the marker.

The inspected `data/motorcove.sqlite` was not modified and is not automatically adopted.
