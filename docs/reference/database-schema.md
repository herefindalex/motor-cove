# Database schema reference

Executable migrations under `packages/database/drizzle` define the physical SQLite schema. The
[generated physical reference](../database/schema-reference.generated.md) executes that history in
an isolated database and records every repository-managed table, column, primary key, foreign key,
index, constraint definition, and schema-contract digest.

Architectural facts that SQL cannot express live in the
[machine-readable database model](../../packages/database/src/model.ts) and the curated
[authority and lifecycle matrix](../database/authority-and-lifecycle.md). Recovery behavior is
documented separately in [database recovery semantics](../database/recovery-semantics.md).

Use `pnpm db:verify` for an owned managed environment. Documentation generation and checks use only
an in-memory database and never adopt or modify `data/motorcove.sqlite` or a managed environment.

```bash
pnpm docs:generate
pnpm docs:generate:check
```

The first command updates generated artifacts. The second fails when the migration-derived schema,
semantic table model, or committed generated Markdown has drifted.
