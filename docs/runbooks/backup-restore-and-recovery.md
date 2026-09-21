# How to back up, restore, and recover a database

Use these commands only for an owned `.motorcove` environment with API and Indexer stopped.

## Create a snapshot

```bash
pnpm db:backup --env docs-smoke
```

The command uses the SQLite backup API, verifies integrity, foreign keys, schema contract, and native
history, then publishes a bundle with checksum and metadata. It does not copy Anvil state, keys, or
wallet journals.

## Restore explicitly

```bash
pnpm db:restore --env docs-smoke --backup <verified-backup-id> --yes
```

Restore verifies before moving active files, quarantines the current main DB and WAL/SHM sidecars,
installs the standalone snapshot, opens it with WAL policy, and verifies again. `--yes` confirms the
destructive choice; it does not bypass ownership or checksum guards. DB restore never rolls back the
chain.

## Recover an interrupted operation

```bash
pnpm ops:recover --env docs-smoke
pnpm ops:recover --env docs-smoke --complete
```

The first command reports the marker. `--complete` reacquires locks and clears the marker only after
an active, staged, or quarantined candidate becomes a verified DB. Never delete `maintenance.json`
as a normal recovery method.

## Stop conditions

Stop on checksum/identity mismatch, missing candidate, schema drift, history divergence, or a chain
deployment mismatch. Keep marker, quarantine, and reports for diagnosis.

Temporary tests cover WAL snapshot, corrupted backup rejection, verified restore, and one file-switch
crash window. Hardware power loss, chain-forward catch-up after restore, and all file-system failure
modes are not verified.
