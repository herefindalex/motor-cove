# How to back up, restore, and recover a database

Use these commands only for an owned `.motorcove` environment with API and Indexer stopped.

## Create a snapshot

```bash
pnpm db:backup --env docs-smoke
```

The command uses the SQLite backup API, verifies integrity, foreign keys, schema contract, and native
history, then publishes a format 3 bundle with checksum, source readiness, restore policy, and
projection evidence. A standard backup requires the maintenance marker to be absent. It does not
copy Anvil state, keys, or wallet journals.

Migration safety and source refresh archive calls run inside the existing maintenance owner. They
must bind the current operation ID and purpose. Their bundles are `EVIDENCE_ONLY`: they preserve the
source checkpoint, build, scope, status, recovery reason, and marker identity for recovery or
diagnosis, but the normal restore command will not install them.

## Restore explicitly

```bash
pnpm db:restore --env docs-smoke --backup <verified-backup-id> --yes
```

Restore verifies before moving active files, quarantines the current main DB and WAL/SHM sidecars,
installs the standalone snapshot, opens it with WAL policy, and verifies again. `--yes` confirms the
destructive choice; it does not bypass ownership or checksum guards. DB restore never rolls back the
chain. Restore accepts only a `STANDARD` snapshot whose recorded source condition was `READY`.

## Recover an interrupted operation

```bash
pnpm ops:recover --env docs-smoke
pnpm ops:recover --env docs-smoke --complete
```

The first command reports the marker. `--complete` reacquires locks and clears the marker only after
an active, staged, or quarantined candidate becomes a verified DB. Never delete `maintenance.json`
as a normal recovery method.

Marker publication uses a fresh exclusive temporary filename for each update, then atomically
renames it over `maintenance.json` and syncs the directory. The published marker is authoritative.
If a process dies before rename, a matching resume ignores that unpublished file and removes orphan
temporary files after its next successful publication. Operators must not promote or delete marker
temporary files by hand.

The reporting command may read a marker without ownership because it is only a preview. The
`--complete` path acquires the environment maintenance locks first and then reads the marker again;
all recovery selection and mutation use that lock-owned snapshot. A marker observed before lock
acquisition is never used to clear or complete an operation because another owner may have replaced
it while the command waited.

SQLite main, WAL, and SHM files are one generation. If restore stopped after moving only the active
main file, recovery first moves the remaining active sidecars into the same quarantine before it
installs the staged standalone snapshot. If it rolls back from quarantine, it reunites that
quarantine's main and sidecars. Duplicate sidecars in active and quarantine locations are ambiguous;
recovery stops and preserves the marker instead of choosing one.

## Stop conditions

Stop on checksum/identity mismatch, missing candidate, schema drift, history divergence, or a chain
deployment mismatch. Keep marker, quarantine, and reports for diagnosis.

Temporary tests cover WAL snapshot, corrupted backup rejection, verified restore, and a process-killed
hot-WAL file-switch crash window. Hardware power loss, chain-forward catch-up after restore, and all
file-system failure modes are not verified.

## Source-schema backup evidence

Backup verifies integrity, foreign keys, native history as a known prefix of the repository migration
bundle, and the live schema fingerprint against the database's own `db_contract` row. The manifest
records the snapshot's actual migration count, prefix digest, schema fingerprint, and source contract
version. It does not describe the snapshot as already being at a future target schema.

For a pre-migration snapshot, successful publication is a durable migration phase. The migration
marker stores the published backup ID, and every matching resume calls the normal backup verifier
again before applying SQL. It also compares the verified snapshot evidence with the live source
database and deployment identity. A failed backup leaves no proof, so the next matching run must
retry backup creation. A failure after the proof is recorded reuses the same verified snapshot.

Restore currently installs only a snapshot that matches the running code's target schema. A valid
older snapshot fails with `BACKUP_REQUIRES_MIGRATION` before the active database is moved; upgrade it
through the migration workflow instead of bypassing the guard. An interrupted projection rebuild or
reindex remains `ACTION_REQUIRED` until the matching projection command completes.

## Deployment and sidecar identity

Backup format 3 records an explicit deployment state. `DEPLOYED` snapshots bind the database
deployment ID and record presence and SHA-256 evidence for the deployment, bootstrap receipt, and
seed journal sidecars. `PREDEPLOYMENT` snapshots are valid only when the database has zero deployment
rows and all three sidecars are absent. This lets migration protect an initialized predeployment
database without inventing chain identity. A sidecar in a predeployment snapshot, or a missing or
changed sidecar in a deployed snapshot, fails verification.

Restore compares a deployed backup with both the active database and active deployment manifest
before creating a quarantine directory. A backup from an earlier deployment of the same environment
name is rejected. Predeployment backups are migration evidence and currently return
`BACKUP_PREDEPLOYMENT_RESTORE_UNSUPPORTED` from the restore command; they are not installed as a
deployed environment.

Restore does not install sidecars, reset Anvil, deploy contracts, or replay seed transactions. Moving
an entire environment requires a separate, explicit workflow; database restore is for the same
deployment identity and may be followed by normal Indexer catch-up.
