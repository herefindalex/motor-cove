# Database documentation

MotorCove uses one managed SQLite database for deployment identity, off-chain catalog authority,
retained chain evidence, derived projections, runtime observations, and reconciliation reports.
Those records have different owners and recovery rules. Treating the whole database as either
authoritative truth or a disposable cache would be incorrect.

## Sources of truth

The database contract has two complementary sources:

1. Executable migrations under `packages/database/drizzle` define the physical schema.
2. [`databaseModel`](../../packages/database/src/model.ts) defines semantic ownership and lifecycle
   facts that SQLite cannot express.

`packages/database/schema-contract.json` binds the reviewed migration bundle, schema fingerprint,
schema source, toolchain, and required projector version. The generated reference is produced by
running those migrations against an isolated in-memory database; it does not inspect or modify a
managed environment.

## Read by question

- [Physical schema reference](schema-reference.generated.md): columns, keys, indexes, constraints,
  and contract digests generated from the executed migration history.
- [Database model](database-model.md): state classes, table relationships, and the boundary between
  authority, evidence, projection, runtime observation, and audit history.
- [Authority and lifecycle](authority-and-lifecycle.md): the generated table-by-table ownership,
  writer, recovery source, backup, and reorg matrix plus interpretation rules.
- [Recovery semantics](recovery-semantics.md): the effects of migration, rebuild, reindex, backup,
  restore, and reset.
- [Temporal semantics](temporal-semantics.md): business, chain, observation, verification,
  process-liveness, and local-mutation time and what each existing field proves.
- [Database architecture](../architecture/database.md): process and package boundaries.
- [Database acceptance matrix](../testing/database-acceptance-matrix.md): implemented and executed
  verification evidence.

## Generation and drift checks

```bash
pnpm docs:generate
pnpm docs:generate:check
pnpm docs:check
```

`docs:generate` owns the complete physical schema reference and the marked matrix region in the
authority page. Text outside generated regions remains human-curated. Check mode fails with
`DATABASE_MODEL_TABLE_DRIFT` when a migrated table lacks a semantic model entry, and with
`GENERATED_DOC_DRIFT` when committed generated Markdown differs from current inputs.

## Change rule

A physical schema change starts with a new migration and reviewed schema contract. A semantic
ownership or recovery change updates `databaseModel` and the human lifecycle pages in the same
delivery. Never edit an applied migration or the generated reference to make documentation agree
with an unreviewed database.

## Public-chain readiness fields

Migration `0003_public_chain_readiness` adds nullable `sales.allowed_buyer` and runtime
`last_eligible_head`/`last_head_advanced_at`. Historical sales remain `NULL`: their reservation
cannot be inferred from a prior contract event. The runtime fields distinguish the last observed
head from the projection's eligible finalized boundary and when that head advanced. A database
migration does not upgrade an existing non-upgradeable escrow deployment; a new contract deployment
and matching manifest are required for reserved-buyer semantics.
