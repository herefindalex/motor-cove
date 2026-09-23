# R26 regression test plan

## Executed correction

The future-heartbeat regression uses a migrated, real `better-sqlite3` database, the public
read-only reader, and `Fastify.inject`. It sets a saved `CURRENT` status and a heartbeat one minute
ahead of the injected reader clock. Before the fix it failed with `FRESH`, age `0`, and lag `0`;
after the fix it requires `UNKNOWN`, null age, and null lag while preserving the last-known status.
The neighboring expired-heartbeat and `RECOVERY_REQUIRED` tests remain controls.

```bash
pnpm exec vitest run tests/integration/api-reader-contract.test.ts
```

The exact executed commands, results, toolchain, and limitations for this delivery are recorded in
[verification evidence](../../evidence/verification.json). The required full gates are:

```bash
pnpm docs:check
pnpm verify
pnpm test:e2e
```

## Existing behavior to preserve

| Invariant                                                                            | Existing regression owner                         | Future audit trigger                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| Idempotent catalog seed, preserved timestamps on no-op rerun, and conflict rejection | `tests/seeds/catalog-seed.test.ts`                | A supported catalog edit or binding rebind command          |
| Event/projection/checkpoint atomicity and source identity                            | `tests/integration/indexer-store.test.ts`         | A new event time or provenance column                       |
| Reorg canonicality and retained branch evidence                                      | `tests/integration/reindex-canonical.test.ts`     | A duplicated block timestamp or new observation clock       |
| Rebuild does not invent worker freshness                                             | `tests/integration/rebuild-freshness.r25.test.ts` | A new projection or runtime timestamp                       |
| Backup/restore compatibility and evidence validation                                 | `tests/recovery/backup-restore.test.ts`           | Any persisted timestamp whose meaning changes after restore |
| API projection freshness and recovery reason presentation                            | `tests/integration/api-reader-contract.test.ts`   | A new clock source or freshness threshold                   |

## Tests required if a future schema proposal is accepted

- An immutable `first_seen_at` must survive identical re-observation; a source-refresh reindex must
  have an explicit policy for a newly reacquired row.
- Rebuild the same verified chain evidence at different wall-clock times and compare every
  chain-derived projection field. They must be identical.
- For a supported catalog edit, creation time must remain stable and mutation time must advance
  only after a meaningful, committed change. Current seed conflicts must not rewrite timestamps.
- Orphan and recanonicalize events, then check new chain-time fields against the correct block
  branch. A local timestamp must not override block/hash/log provenance.
- Restore an older compatible snapshot and show which times remain historical and which require a
  new live observation. Restoring cannot refresh heartbeat or reconciliation publication evidence.
- Run the new migration from all supported historical schema versions in an isolated environment,
  then check generated schema reference and semantic model drift guards.

No schema candidate passed the `ADD` gate in this audit, so these conditional tests are a plan,
not a claim that new fields or migrations were implemented.
